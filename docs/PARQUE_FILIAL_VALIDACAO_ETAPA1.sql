-- ETAPA 1 (v3) - Filial responsavel pela validacao / situacao (registro daqui para frente)
-- Nao altera filial cadastral (filial_id), nao preenche maquinas antigas, nao muda filtros.
-- Historico imutavel; filial ja registrada nunca e apagada; filial nao autorizada recusada.
-- Retorno: UPDATE public.parque_validation_filial_config SET enforce_required = false;
--          (operacoes voltam a ser aceitas com pendencia; registros preservados)

ALTER TABLE public.client_equipment
  ADD COLUMN validation_filial_id uuid REFERENCES public.filiais(id),
  ADD COLUMN validation_filial_source text,
  ADD COLUMN validation_filial_at timestamptz,
  ADD COLUMN validation_filial_pending boolean NOT NULL DEFAULT false;

CREATE TABLE public.parque_validation_filial_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enforce_required boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.parque_validation_filial_config (id, enforce_required) VALUES (true, true);
GRANT SELECT ON public.parque_validation_filial_config TO authenticated;
GRANT ALL ON public.parque_validation_filial_config TO service_role;
ALTER TABLE public.parque_validation_filial_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY parque_vf_config_select ON public.parque_validation_filial_config
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.client_equipment_validation_filial_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  event_type text NOT NULL,
  operation text NOT NULL,
  origin text NOT NULL,
  actor_user_id uuid,
  actor_process text NOT NULL,
  import_batch_id uuid,
  old_machine_status text,
  new_machine_status text,
  old_validation_filial_id uuid,
  new_validation_filial_id uuid,
  validation_marked boolean NOT NULL DEFAULT false,
  pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ce_vf_history_equipment ON public.client_equipment_validation_filial_history (equipment_id, created_at DESC);
GRANT SELECT ON public.client_equipment_validation_filial_history TO authenticated;
GRANT ALL ON public.client_equipment_validation_filial_history TO service_role;
ALTER TABLE public.client_equipment_validation_filial_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_vf_history_select ON public.client_equipment_validation_filial_history
  FOR SELECT TO authenticated USING (
    public.can_view_equipment_park() AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
      OR new_validation_filial_id = ANY(public.get_user_filial_ids_internal(auth.uid()))
      OR old_validation_filial_id = ANY(public.get_user_filial_ids_internal(auth.uid()))
    ));

CREATE OR REPLACE FUNCTION public.ce_vf_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'Historico da filial responsavel nao pode ser alterado ou excluido' USING ERRCODE = '42501';
END $fn$;

CREATE TRIGGER trg_ce_vf_history_immutable
  BEFORE UPDATE OR DELETE ON public.client_equipment_validation_filial_history
  FOR EACH ROW EXECUTE FUNCTION public.ce_vf_history_immutable();

CREATE OR REPLACE FUNCTION public.client_equipment_register_validation_filial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_filial uuid;
  v_source text;
  v_origin text;
  v_ids uuid[];
  v_global boolean := false;
  v_new_validation boolean;
  v_status_event boolean;
  v_enforce boolean;
BEGIN
  -- Filial cadastral: definida apenas na criacao; validacao/situacao nunca a altera.
  IF TG_OP = 'UPDATE' AND NEW.filial_id IS DISTINCT FROM OLD.filial_id
     AND NULLIF(current_setting('app.validation_filial_origin', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Validacao nao pode alterar a filial cadastral' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_new_validation := NEW.last_validation_at IS DISTINCT FROM OLD.last_validation_at
                        AND NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IS DISTINCT FROM OLD.machine_status;
  ELSE
    v_new_validation := NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IN ('vendida', 'inativa', 'sucateada');
  END IF;

  -- Colunas da filial responsavel so mudam por este gatilho.
  IF TG_OP = 'UPDATE' THEN
    NEW.validation_filial_id := OLD.validation_filial_id;
    NEW.validation_filial_source := OLD.validation_filial_source;
    NEW.validation_filial_at := OLD.validation_filial_at;
    NEW.validation_filial_pending := OLD.validation_filial_pending;
  ELSE
    NEW.validation_filial_id := NULL;
    NEW.validation_filial_source := NULL;
    NEW.validation_filial_at := NULL;
    NEW.validation_filial_pending := false;
  END IF;

  IF NOT (v_new_validation OR v_status_event) THEN
    RETURN NEW;
  END IF;

  v_filial := NULLIF(current_setting('app.validation_filial_id', true), '')::uuid;
  v_source := NULLIF(current_setting('app.validation_filial_source', true), '');
  v_origin := COALESCE(NULLIF(current_setting('app.validation_filial_origin', true), ''),
                CASE WHEN v_uid IS NULL AND NEW.import_batch_id IS NOT NULL THEN 'importacao'
                     WHEN v_uid IS NULL THEN 'processo_automatico'
                     WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade'
                     ELSE 'alteracao_direta' END);

  IF v_uid IS NOT NULL THEN
    v_global := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager');
    IF v_filial IS NULL AND NOT v_global THEN
      v_ids := public.get_user_filial_ids_internal(v_uid);
      IF COALESCE(array_length(v_ids, 1), 0) = 1 THEN
        v_filial := v_ids[1];
        v_source := 'filial_unica_usuario';
      END IF;
    END IF;
    -- Nao aceitar filial nao autorizada.
    IF v_filial IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.filiais f WHERE f.id = v_filial) THEN
        RAISE EXCEPTION 'Filial responsavel inexistente' USING ERRCODE = '42501';
      END IF;
      IF NOT v_global AND NOT (v_filial = ANY(COALESCE(public.get_user_filial_ids_internal(v_uid), '{}'::uuid[]))) THEN
        RAISE EXCEPTION 'Filial responsavel nao autorizada' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF v_filial IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.filiais f WHERE f.id = v_filial) THEN
    RAISE EXCEPTION 'Filial responsavel inexistente' USING ERRCODE = '42501';
  END IF;

  IF v_filial IS NOT NULL THEN
    NEW.validation_filial_id := v_filial;
    NEW.validation_filial_source := COALESCE(v_source, 'operacao');
    NEW.validation_filial_at := now();
    NEW.validation_filial_pending := false;
    RETURN NEW;
  END IF;

  -- Sem filial identificada: operacao de usuario em atualizacao e bloqueada (se exigencia ligada);
  -- inclusoes e processos automaticos seguem com pendencia auditavel.
  SELECT c.enforce_required INTO v_enforce FROM public.parque_validation_filial_config c WHERE c.id;
  IF v_uid IS NOT NULL AND TG_OP = 'UPDATE' AND COALESCE(v_enforce, true)
     AND v_origin NOT IN ('importacao', 'processo_automatico') THEN
    RAISE EXCEPTION 'FILIAL_VALIDACAO_OBRIGATORIA: selecione a filial responsavel pela validacao'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.validation_filial_id IS NULL THEN
    NEW.validation_filial_source := 'pendente:' || v_origin;
    NEW.validation_filial_at := now();
    NEW.validation_filial_pending := true;
  END IF;
  -- Filial ja registrada e mantida (nunca apagada por falta de informacao).
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.client_equipment_log_validation_filial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_new_validation boolean;
  v_status_event boolean;
  v_event text;
  v_origin text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_new_validation := NEW.last_validation_at IS DISTINCT FROM OLD.last_validation_at
                        AND NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IS DISTINCT FROM OLD.machine_status;
  ELSE
    v_new_validation := NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IN ('vendida', 'inativa', 'sucateada');
  END IF;
  IF NOT (v_new_validation OR v_status_event) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := CASE WHEN NEW.validation_filial_pending THEN 'pendencia' ELSE 'inclusao' END;
  ELSIF NEW.validation_filial_id IS DISTINCT FROM OLD.validation_filial_id THEN
    v_event := CASE WHEN OLD.validation_filial_id IS NULL THEN 'inclusao' ELSE 'alteracao' END;
  ELSIF NEW.validation_filial_id IS NULL THEN
    v_event := 'pendencia';
  ELSE
    v_event := 'mantida';
  END IF;

  v_origin := COALESCE(NULLIF(current_setting('app.validation_filial_origin', true), ''),
                CASE WHEN v_uid IS NULL AND NEW.import_batch_id IS NOT NULL THEN 'importacao'
                     WHEN v_uid IS NULL THEN 'processo_automatico'
                     WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade'
                     ELSE 'alteracao_direta' END);

  INSERT INTO public.client_equipment_validation_filial_history (
    equipment_id, event_type, operation, origin, actor_user_id, actor_process, import_batch_id,
    old_machine_status, new_machine_status, old_validation_filial_id, new_validation_filial_id,
    validation_marked, pending
  ) VALUES (
    NEW.id, v_event, lower(TG_OP), v_origin, v_uid,
    CASE WHEN v_uid IS NULL THEN current_user::text ELSE 'usuario' END, NEW.import_batch_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.machine_status END, NEW.machine_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.validation_filial_id END, NEW.validation_filial_id,
    v_new_validation, NEW.validation_filial_pending
  );
  RETURN NULL;
END $fn$;

REVOKE ALL ON FUNCTION public.client_equipment_register_validation_filial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_equipment_log_validation_filial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ce_vf_history_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_client_equipment_validation_filial
  BEFORE INSERT OR UPDATE ON public.client_equipment
  FOR EACH ROW EXECUTE FUNCTION public.client_equipment_register_validation_filial();

CREATE TRIGGER trg_client_equipment_validation_filial_log
  AFTER INSERT OR UPDATE ON public.client_equipment
  FOR EACH ROW EXECUTE FUNCTION public.client_equipment_log_validation_filial();

CREATE OR REPLACE FUNCTION public.validate_client_equipment(p_equipment_id uuid, p_filial_id uuid DEFAULT NULL::uuid, p_mark_validated boolean DEFAULT true, p_model text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_hours numeric DEFAULT NULL::numeric, p_serial_chassis text DEFAULT NULL::text, p_observation text DEFAULT NULL::text, p_machine_status text DEFAULT NULL::text, p_client_code text DEFAULT NULL::text, p_clear_year boolean DEFAULT false, p_clear_hours boolean DEFAULT false)
 RETURNS SETOF client_equipment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_eff uuid[];
  v_cur_filial uuid;
  v_cur_code text;
  v_cur_status text;
  v_global boolean;
  v_ids uuid[];
  v_resp uuid;
  v_source text;
  v_enforce boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso negado: cadastro nao aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  -- Recusa filial inexistente ou nao autorizada (42501).
  v_eff := public.effective_filial_ids(p_filial_id);
  v_global := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager');

  SELECT ce.filial_id, ce.client_code, ce.machine_status INTO v_cur_filial, v_cur_code, v_cur_status
    FROM public.client_equipment ce WHERE ce.id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maquina nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_cur_filial IS NOT NULL AND cardinality(v_eff) > 0 AND NOT (v_cur_filial = ANY(v_eff)) THEN
    RAISE EXCEPTION 'Acesso negado: maquina de outra filial' USING ERRCODE = '42501';
  END IF;

  -- Filial responsavel: escolhida na operacao; ou unica filial autorizada (nao-global).
  IF p_filial_id IS NOT NULL THEN
    v_resp := p_filial_id; v_source := 'operacao';
  ELSIF NOT v_global THEN
    v_ids := public.get_user_filial_ids_internal(v_uid);
    IF COALESCE(array_length(v_ids, 1), 0) = 1 THEN
      v_resp := v_ids[1]; v_source := 'filial_unica_usuario';
    END IF;
  END IF;

  SELECT c.enforce_required INTO v_enforce FROM public.parque_validation_filial_config c WHERE c.id;
  IF v_resp IS NULL AND COALESCE(v_enforce, true) AND (COALESCE(p_mark_validated, false)
       OR (p_machine_status IS NOT NULL AND p_machine_status IS DISTINCT FROM v_cur_status)) THEN
    RAISE EXCEPTION 'FILIAL_VALIDACAO_OBRIGATORIA: selecione a filial responsavel pela validacao'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.validation_filial_id', COALESCE(v_resp::text, ''), true);
  PERFORM set_config('app.validation_filial_source', COALESCE(v_source, ''), true);
  PERFORM set_config('app.validation_filial_origin', 'validacao_tela', true);

  RETURN QUERY
  UPDATE public.client_equipment ce
     SET model = CASE WHEN p_model IS NULL THEN ce.model
                      ELSE NULLIF(btrim(p_model), '') END,
         serial_chassis = CASE WHEN p_serial_chassis IS NULL THEN ce.serial_chassis
                               ELSE NULLIF(btrim(p_serial_chassis), '') END,
         observation = CASE WHEN p_observation IS NULL THEN ce.observation
                            ELSE NULLIF(btrim(p_observation), '') END,
         year = CASE WHEN COALESCE(p_clear_year, false) THEN NULL
                     ELSE COALESCE(p_year, ce.year) END,
         hours = CASE WHEN COALESCE(p_clear_hours, false) THEN NULL
                      ELSE COALESCE(p_hours, ce.hours) END,
         machine_status = COALESCE(p_machine_status, ce.machine_status),
         client_code = CASE WHEN v_cur_code IS NULL OR btrim(v_cur_code) = ''
                            THEN COALESCE(p_client_code, ce.client_code) ELSE ce.client_code END,
         validated_by = CASE WHEN p_mark_validated THEN v_uid ELSE ce.validated_by END,
         last_validation_at = CASE WHEN p_mark_validated THEN now() ELSE ce.last_validation_at END,
         updated_at = now()
   WHERE ce.id = p_equipment_id
  RETURNING ce.*;

  PERFORM set_config('app.validation_filial_id', '', true);
  PERFORM set_config('app.validation_filial_source', '', true);
  PERFORM set_config('app.validation_filial_origin', '', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.create_client_equipment(p_client_name text, p_filial_id uuid DEFAULT NULL::uuid, p_client_code text DEFAULT NULL::text, p_machine_type text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_serial_chassis text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_hours numeric DEFAULT NULL::numeric, p_machine_status text DEFAULT NULL::text, p_observation text DEFAULT NULL::text)
 RETURNS SETOF client_equipment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_eff uuid[];
  v_filial uuid;
  v_code text := NULLIF(btrim(COALESCE(p_client_code, '')), '');
  v_serial text := NULLIF(btrim(COALESCE(p_serial_chassis, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso negado: cadastro nao aprovado ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_client_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Cliente e obrigatorio' USING ERRCODE = '22023';
  END IF;

  v_eff := public.effective_filial_ids(p_filial_id);
  IF cardinality(v_eff) <> 1 THEN
    RAISE EXCEPTION 'Selecione uma filial no cabecalho para cadastrar a maquina'
      USING ERRCODE = '42501';
  END IF;
  v_filial := v_eff[1];

  IF v_code IS NOT NULL AND v_serial IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.client_equipment ce
       WHERE regexp_replace(btrim(COALESCE(ce.client_code, '')), '^0+', '')
             = regexp_replace(v_code, '^0+', '')
         AND lower(btrim(COALESCE(ce.serial_chassis, ''))) = lower(v_serial)
    ) THEN
      RAISE EXCEPTION 'Ja existe uma maquina cadastrada com este chassi/serie.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Filial da operacao (autorizada) registrada como responsavel quando a situacao exigir.
  PERFORM set_config('app.validation_filial_id', v_filial::text, true);
  PERFORM set_config('app.validation_filial_source', 'operacao', true);
  PERFORM set_config('app.validation_filial_origin', 'criacao_manual', true);

  RETURN QUERY
  INSERT INTO public.client_equipment (
    client_code, client_name, filial_id, machine_type, model, serial_chassis,
    year, hours, machine_status, observation, validation_priority,
    validation_source, created_by
  ) VALUES (
    v_code, btrim(p_client_name), v_filial, NULLIF(btrim(COALESCE(p_machine_type, '')), ''),
    NULLIF(btrim(COALESCE(p_model, '')), ''), v_serial, p_year, p_hours,
    COALESCE(NULLIF(btrim(COALESCE(p_machine_status, '')), ''), 'ativa'),
    NULLIF(btrim(COALESCE(p_observation, '')), ''), false, 'manual_visita', v_uid
  )
  RETURNING client_equipment.*;

  PERFORM set_config('app.validation_filial_id', '', true);
  PERFORM set_config('app.validation_filial_source', '', true);
  PERFORM set_config('app.validation_filial_origin', '', true);
END
$function$;

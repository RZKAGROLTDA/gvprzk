-- SIMULACAO A - usuarios reais (somente testes). NAO e migracao definitiva.
-- O bloco inteiro roda numa unica transacao e termina SEMPRE com RAISE EXCEPTION,
-- portanto tudo e desfeito (rollback integral). Nao ha COMMIT.
-- -- ETAPA 1 (v3) - Filial responsavel pela validacao / situacao (registro daqui para frente)
-- Nao altera filial cadastral (filial_id), nao preenche maquinas antigas, nao muda filtros.
-- Processos automaticos podem se identificar com set_config('app.process_name', '<nome>', true).
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
REVOKE ALL ON public.parque_validation_filial_config FROM PUBLIC, anon, authenticated;
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
  actor_db_role text NOT NULL,
  actor_application text,
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
REVOKE ALL ON public.client_equipment_validation_filial_history FROM PUBLIC, anon, authenticated;
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
  IF TG_OP = 'UPDATE' THEN
    v_new_validation := NEW.last_validation_at IS DISTINCT FROM OLD.last_validation_at
                        AND NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IS DISTINCT FROM OLD.machine_status;
  ELSE
    v_new_validation := NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IN ('vendida', 'inativa', 'sucateada');
  END IF;

  -- Filial cadastral: definida na criacao; numa maquina existente, validacao ou mudanca
  -- de situacao nunca a altera (inclusive gravacao direta). Alteracao cadastral so em
  -- operacao separada, sem validacao/situacao no mesmo comando.
  IF TG_OP = 'UPDATE' AND NEW.filial_id IS DISTINCT FROM OLD.filial_id
     AND (v_new_validation OR v_status_event
          OR NULLIF(current_setting('app.validation_filial_origin', true), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Validacao ou mudanca de situacao nao pode alterar a filial cadastral' USING ERRCODE = '42501';
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
  -- Origem automatica so vale sem usuario autenticado (condicao do banco, nao do valor informado).
  IF v_uid IS NOT NULL AND v_origin IN ('importacao', 'processo_automatico') THEN
    v_origin := CASE WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade' ELSE 'alteracao_direta' END;
  END IF;

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

  -- Sem filial identificada: qualquer atualizacao de usuario autenticado e bloqueada (se exigencia
  -- ligada), independente da origem informada; so processos sem usuario seguem com pendencia.
  SELECT c.enforce_required INTO v_enforce FROM public.parque_validation_filial_config c WHERE c.id;
  IF v_uid IS NOT NULL AND TG_OP = 'UPDATE' AND COALESCE(v_enforce, true) THEN
    RAISE EXCEPTION 'FILIAL_VALIDACAO_OBRIGATORIA: selecione a filial responsavel pela validacao'
      USING ERRCODE = '22023';
  END IF;

  -- Marca a operacao atual como pendente para o historico (mesmo com filial anterior gravada).
  PERFORM set_config('app.vf_op_pending', NEW.id::text, true);
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
  v_op_pending boolean;
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

  v_op_pending := COALESCE(current_setting('app.vf_op_pending', true) = NEW.id::text, false);
  PERFORM set_config('app.vf_op_pending', '', true);

  IF v_op_pending THEN
    -- Operacao sem filial identificada: pendente; filial anterior (se houver) preservada.
    v_event := CASE WHEN NEW.validation_filial_id IS NULL THEN 'pendencia' ELSE 'pendencia_filial_anterior_mantida' END;
  ELSIF TG_OP = 'INSERT' OR OLD.validation_filial_id IS NULL THEN
    v_event := 'inclusao';
  ELSIF NEW.validation_filial_id IS DISTINCT FROM OLD.validation_filial_id THEN
    v_event := 'alteracao';
  ELSE
    v_event := 'confirmacao';
  END IF;

  v_origin := COALESCE(NULLIF(current_setting('app.validation_filial_origin', true), ''),
                CASE WHEN v_uid IS NULL AND NEW.import_batch_id IS NOT NULL THEN 'importacao'
                     WHEN v_uid IS NULL THEN 'processo_automatico'
                     WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade'
                     ELSE 'alteracao_direta' END);
  IF v_uid IS NOT NULL AND v_origin IN ('importacao', 'processo_automatico') THEN
    v_origin := CASE WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade' ELSE 'alteracao_direta' END;
  END IF;

  INSERT INTO public.client_equipment_validation_filial_history (
    equipment_id, event_type, operation, origin, actor_user_id, actor_process, actor_db_role,
    actor_application, import_batch_id,
    old_machine_status, new_machine_status, old_validation_filial_id, new_validation_filial_id,
    validation_marked, pending
  ) VALUES (
    NEW.id, v_event, lower(TG_OP), v_origin, v_uid,
    COALESCE(NULLIF(current_setting('app.process_name', true), ''),
             CASE WHEN v_uid IS NULL THEN COALESCE(NULLIF(current_setting('application_name', true), ''), session_user::text)
                  ELSE 'usuario' END),
    session_user::text, NULLIF(current_setting('application_name', true), ''), NEW.import_batch_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.machine_status END, NEW.machine_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.validation_filial_id END, NEW.validation_filial_id,
    v_new_validation, v_op_pending
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
 e substituido pelo conteudo exato de docs/PARQUE_FILIAL_VALIDACAO_ETAPA1.sql
-- (SHA-256 5d3b63a0b64c2bf0f648d6a0c476ae1104cb78c212d877549e6217ee06ce85f0, conferido abaixo).
DO $simA$
DECLARE
  v_file text := $file$-- ETAPA 1 (v3) - Filial responsavel pela validacao / situacao (registro daqui para frente)
-- Nao altera filial cadastral (filial_id), nao preenche maquinas antigas, nao muda filtros.
-- Processos automaticos podem se identificar com set_config('app.process_name', '<nome>', true).
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
REVOKE ALL ON public.parque_validation_filial_config FROM PUBLIC, anon, authenticated;
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
  actor_db_role text NOT NULL,
  actor_application text,
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
REVOKE ALL ON public.client_equipment_validation_filial_history FROM PUBLIC, anon, authenticated;
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
  IF TG_OP = 'UPDATE' THEN
    v_new_validation := NEW.last_validation_at IS DISTINCT FROM OLD.last_validation_at
                        AND NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IS DISTINCT FROM OLD.machine_status;
  ELSE
    v_new_validation := NEW.last_validation_at IS NOT NULL;
    v_status_event := NEW.machine_status IN ('vendida', 'inativa', 'sucateada');
  END IF;

  -- Filial cadastral: definida na criacao; numa maquina existente, validacao ou mudanca
  -- de situacao nunca a altera (inclusive gravacao direta). Alteracao cadastral so em
  -- operacao separada, sem validacao/situacao no mesmo comando.
  IF TG_OP = 'UPDATE' AND NEW.filial_id IS DISTINCT FROM OLD.filial_id
     AND (v_new_validation OR v_status_event
          OR NULLIF(current_setting('app.validation_filial_origin', true), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Validacao ou mudanca de situacao nao pode alterar a filial cadastral' USING ERRCODE = '42501';
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
  -- Origem automatica so vale sem usuario autenticado (condicao do banco, nao do valor informado).
  IF v_uid IS NOT NULL AND v_origin IN ('importacao', 'processo_automatico') THEN
    v_origin := CASE WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade' ELSE 'alteracao_direta' END;
  END IF;

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

  -- Sem filial identificada: qualquer atualizacao de usuario autenticado e bloqueada (se exigencia
  -- ligada), independente da origem informada; so processos sem usuario seguem com pendencia.
  SELECT c.enforce_required INTO v_enforce FROM public.parque_validation_filial_config c WHERE c.id;
  IF v_uid IS NOT NULL AND TG_OP = 'UPDATE' AND COALESCE(v_enforce, true) THEN
    RAISE EXCEPTION 'FILIAL_VALIDACAO_OBRIGATORIA: selecione a filial responsavel pela validacao'
      USING ERRCODE = '22023';
  END IF;

  -- Marca a operacao atual como pendente para o historico (mesmo com filial anterior gravada).
  PERFORM set_config('app.vf_op_pending', NEW.id::text, true);
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
  v_op_pending boolean;
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

  v_op_pending := COALESCE(current_setting('app.vf_op_pending', true) = NEW.id::text, false);
  PERFORM set_config('app.vf_op_pending', '', true);

  IF v_op_pending THEN
    -- Operacao sem filial identificada: pendente; filial anterior (se houver) preservada.
    v_event := CASE WHEN NEW.validation_filial_id IS NULL THEN 'pendencia' ELSE 'pendencia_filial_anterior_mantida' END;
  ELSIF TG_OP = 'INSERT' OR OLD.validation_filial_id IS NULL THEN
    v_event := 'inclusao';
  ELSIF NEW.validation_filial_id IS DISTINCT FROM OLD.validation_filial_id THEN
    v_event := 'alteracao';
  ELSE
    v_event := 'confirmacao';
  END IF;

  v_origin := COALESCE(NULLIF(current_setting('app.validation_filial_origin', true), ''),
                CASE WHEN v_uid IS NULL AND NEW.import_batch_id IS NOT NULL THEN 'importacao'
                     WHEN v_uid IS NULL THEN 'processo_automatico'
                     WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade'
                     ELSE 'alteracao_direta' END);
  IF v_uid IS NOT NULL AND v_origin IN ('importacao', 'processo_automatico') THEN
    v_origin := CASE WHEN TG_OP = 'INSERT' THEN 'cadastro_por_atividade' ELSE 'alteracao_direta' END;
  END IF;

  INSERT INTO public.client_equipment_validation_filial_history (
    equipment_id, event_type, operation, origin, actor_user_id, actor_process, actor_db_role,
    actor_application, import_batch_id,
    old_machine_status, new_machine_status, old_validation_filial_id, new_validation_filial_id,
    validation_marked, pending
  ) VALUES (
    NEW.id, v_event, lower(TG_OP), v_origin, v_uid,
    COALESCE(NULLIF(current_setting('app.process_name', true), ''),
             CASE WHEN v_uid IS NULL THEN COALESCE(NULLIF(current_setting('application_name', true), ''), session_user::text)
                  ELSE 'usuario' END),
    session_user::text, NULLIF(current_setting('application_name', true), ''), NEW.import_batch_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.machine_status END, NEW.machine_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.validation_filial_id END, NEW.validation_filial_id,
    v_new_validation, v_op_pending
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
$file$;
  v_sha text;
  v_users jsonb := '[
    {"perfil":"Admin","uid":"b6543a7f-3b83-42dc-aa69-930dcb56b21d","cargo":"admin","n":"global"},
    {"perfil":"Gerente","uid":"adaf99ba-128e-493c-8e03-a4e64748f494","cargo":"manager","n":"global"},
    {"perfil":"Supervisor 1 filial","uid":"6a374349-d37c-4b28-922a-5d9e60848fc4","cargo":"supervisor","n":"1"},
    {"perfil":"Supervisor varias filiais","uid":"5f76bc71-5e7a-49f3-b567-b79de6e280fc","cargo":"supervisor","n":"varias"},
    {"perfil":"RAC","uid":"d6a4f143-4444-46ee-99c8-08d01f1ef66b","cargo":"rac","n":"1"},
    {"perfil":"CSA","uid":"5fe47adb-aa02-4f0c-847a-d7070b9486f7","cargo":"csa","n":"1"}
  ]'::jsonb;
  u jsonb;
  v_uid uuid; v_perfil text; v_global boolean; v_allowed uuid[]; v_f uuid; v_e uuid; v_x uuid; v_bad uuid;
  v_used uuid[] := '{}'; v_m uuid;
  v_pre jsonb := '{}'; v_val jsonb;
  v_fp_before text; v_fp_after text;
  v_lotes_b bigint; v_itens_b bigint; v_hist_b bigint; v_lotes_a bigint; v_itens_a bigint;
  v_state text; v_ok boolean; v_rows int;
  v_vf uuid; v_src text; v_fil uuid; v_lva_before timestamptz; v_lva timestamptz;
  v_h record; v_rep text := ''; v_line text; v_nt int := 0; v_cargos text; v_fnomes text;
BEGIN
  v_sha := encode(sha256(convert_to(v_file, 'UTF8')), 'hex');
  IF v_sha <> '5d3b63a0b64c2bf0f648d6a0c476ae1104cb78c212d877549e6217ee06ce85f0' THEN
    RAISE EXCEPTION 'FALHA: SHA divergente %', v_sha;
  END IF;

  -- Fotografia antes: filial cadastral de cada maquina, lotes, itens
  SELECT md5(string_agg(id::text || ':' || COALESCE(filial_id::text, '-'), ',' ORDER BY id)) INTO v_fp_before FROM public.client_equipment;
  SELECT count(*) INTO v_lotes_b FROM public.equipment_regularization_batches;
  SELECT count(*) INTO v_itens_b FROM public.equipment_regularization_items;

  -- Referencia das telas por usuario ANTES da migracao
  FOR u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_uid := (u->>'uid')::uuid;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT p.filial_id INTO v_f FROM public.profiles p WHERE p.user_id = v_uid;
    SELECT jsonb_build_object(
      'kpi', (SELECT to_jsonb(k) FROM public.get_equipment_park_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false) k),
      'val', (SELECT count(*) || '/' || COALESCE(sum(validated_count), 0) FROM public.get_equipment_validators(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)),
      'reg', public.equipment_regularization_pending_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)
    ) INTO v_val;
    v_pre := v_pre || jsonb_build_object(u->>'uid', v_val);
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Migracao exata (dentro da mesma transacao)
  EXECUTE v_file;
  SELECT count(*) INTO v_hist_b FROM public.client_equipment_validation_filial_history;

  FOR u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_uid := (u->>'uid')::uuid; v_perfil := u->>'perfil';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_global := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager');
    v_allowed := public.get_user_filial_ids_internal(v_uid);
    SELECT p.filial_id INTO v_f FROM public.profiles p WHERE p.user_id = v_uid;
    v_e := NULL; v_x := NULL;
    SELECT x INTO v_e FROM unnest(v_allowed) x WHERE x <> v_f ORDER BY x LIMIT 1;
    SELECT f.id INTO v_x FROM public.filiais f WHERE NOT (f.id = ANY(v_allowed)) ORDER BY f.id LIMIT 1;
    SELECT string_agg(role::text, ',' ORDER BY role) INTO v_cargos FROM public.user_roles WHERE user_id = v_uid;
    SELECT string_agg(f.nome, ', ' ORDER BY f.nome) INTO v_fnomes FROM public.filiais f WHERE f.id = ANY(v_allowed);

    -- Confirmacao do cargo e das filiais autorizadas no banco
    IF NOT public.has_role(v_uid, (u->>'cargo')::public.app_role)
       OR (u->>'n' = 'global' AND NOT v_global)
       OR (u->>'n' = '1' AND (v_global OR cardinality(v_allowed) <> 1))
       OR (u->>'n' = 'varias' AND (v_global OR cardinality(v_allowed) < 2)) THEN
      RAISE EXCEPTION 'FALHA [%] perfil divergente: cargos=% filiais=%', v_perfil, v_cargos, v_fnomes;
    END IF;

    -- Filial invalida do teste B: global -> inexistente; restrito -> existente nao autorizada
    IF v_global THEN
      v_bad := gen_random_uuid();
      IF EXISTS (SELECT 1 FROM public.filiais WHERE id = v_bad) THEN RAISE EXCEPTION 'FALHA: uuid de teste existe'; END IF;
    ELSE
      v_bad := v_x;
    END IF;

    v_line := format(E'\n[%s] %s | cargos=%s | global=%s | filiais autorizadas (%s)=%s',
                     v_perfil, v_uid, v_cargos, v_global, cardinality(v_allowed), v_fnomes);

    -- R0: telas atuais iguais apos a migracao
    SELECT jsonb_build_object(
      'kpi', (SELECT to_jsonb(k) FROM public.get_equipment_park_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false) k),
      'val', (SELECT count(*) || '/' || COALESCE(sum(validated_count), 0) FROM public.get_equipment_validators(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)),
      'reg', public.equipment_regularization_pending_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)
    ) INTO v_val;
    IF v_val IS DISTINCT FROM v_pre->(u->>'uid') THEN
      RAISE EXCEPTION 'FALHA [%] R0 telas mudaram: antes % depois %', v_perfil, v_pre->(u->>'uid'), v_val;
    END IF;
    v_line := v_line || format(E'\n  R0 OK telas iguais: total=%s validadas=%s validadores=%s',
                               v_val->'kpi'->>'total', v_val->'kpi'->>'total_validadas', v_val->>'val');

    -- A: validacao com a Filial Ativa autorizada
    <<t_a>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  A NAO TESTADO: maquina nao encontrada'; EXIT t_a; END IF;
      v_used := v_used || v_m;
      PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_f, p_mark_validated => true);
      SELECT validation_filial_id, validation_filial_source, filial_id INTO v_vf, v_src, v_fil FROM public.client_equipment WHERE id = v_m;
      SELECT * INTO v_h FROM public.client_equipment_validation_filial_history WHERE equipment_id = v_m ORDER BY created_at DESC LIMIT 1;
      IF v_vf IS DISTINCT FROM v_f OR v_fil IS DISTINCT FROM v_f OR v_h.new_validation_filial_id IS DISTINCT FROM v_f
         OR v_h.actor_user_id IS DISTINCT FROM v_uid OR v_h.pending OR NOT v_h.validation_marked THEN
        RAISE EXCEPTION 'FALHA [%] A: vf=% cadastral=% hist=%', v_perfil, v_vf, v_fil, to_jsonb(v_h);
      END IF;
      v_line := v_line || format(E'\n  A OK Filial Ativa registrada (origem=%s); cadastral inalterada; historico evento=%s origem=%s pendente=%s',
                                 v_src, v_h.event_type, v_h.origin, v_h.pending);
    END t_a;

    -- B: filial invalida bloqueada (global: inexistente; restrito: existente nao autorizada)
    <<t_b>> BEGIN
      v_m := NULL;
      IF v_bad IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  B NAO TESTADO: nenhuma filial nao autorizada disponivel'; EXIT t_b; END IF;
      SELECT ce.id, ce.last_validation_at INTO v_m, v_lva_before FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  B NAO TESTADO: maquina nao encontrada'; EXIT t_b; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO';
      BEGIN
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_bad, p_mark_validated => true);
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      SELECT validation_filial_id, last_validation_at INTO v_vf, v_lva FROM public.client_equipment WHERE id = v_m;
      IF v_state <> '42501' OR v_vf IS NOT NULL OR v_lva IS DISTINCT FROM v_lva_before THEN
        RAISE EXCEPTION 'FALHA [%] B: estado=% vf=%', v_perfil, v_state, v_vf;
      END IF;
      v_line := v_line || CASE WHEN v_global
        THEN E'\n  B OK filial inexistente bloqueada (42501), maquina intacta'
        ELSE E'\n  B OK filial existente nao autorizada bloqueada (42501), maquina intacta' END;
    END t_b;

    -- C: validacao sem filial informada
    <<t_c>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  C NAO TESTADO: maquina nao encontrada'; EXIT t_c; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO';
      BEGIN
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => NULL, p_mark_validated => true);
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      SELECT validation_filial_id, validation_filial_source INTO v_vf, v_src FROM public.client_equipment WHERE id = v_m;
      IF NOT v_global AND cardinality(v_allowed) = 1 THEN
        IF v_state <> 'ACEITO' OR v_vf IS DISTINCT FROM v_f OR v_src IS DISTINCT FROM 'filial_unica_usuario' THEN
          RAISE EXCEPTION 'FALHA [%] C(unica): estado=% vf=% src=%', v_perfil, v_state, v_vf, v_src;
        END IF;
        v_line := v_line || E'\n  C OK sem Filial Ativa: usou a unica filial autorizada';
      ELSE
        IF v_state <> '22023' OR v_vf IS NOT NULL THEN
          RAISE EXCEPTION 'FALHA [%] C(obrigatoria): estado=% vf=%', v_perfil, v_state, v_vf;
        END IF;
        v_line := v_line || E'\n  C OK sem Filial Ativa: bloqueado (FILIAL_VALIDACAO_OBRIGATORIA)';
      END IF;
    END t_c;

    -- D: mudanca de situacao para vendida
    <<t_d>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  D NAO TESTADO: maquina nao encontrada'; EXIT t_d; END IF;
      v_used := v_used || v_m;
      PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_f, p_mark_validated => false, p_machine_status => 'vendida');
      SELECT validation_filial_id, filial_id INTO v_vf, v_fil FROM public.client_equipment WHERE id = v_m;
      SELECT * INTO v_h FROM public.client_equipment_validation_filial_history WHERE equipment_id = v_m ORDER BY created_at DESC LIMIT 1;
      IF v_vf IS DISTINCT FROM v_f OR v_fil IS DISTINCT FROM v_f OR v_h.new_machine_status IS DISTINCT FROM 'vendida'
         OR v_h.new_validation_filial_id IS DISTINCT FROM v_f THEN
        RAISE EXCEPTION 'FALHA [%] D: vf=% hist=%', v_perfil, v_vf, to_jsonb(v_h);
      END IF;
      v_line := v_line || E'\n  D OK situacao vendida registrou a filial responsavel; cadastral inalterada';
    END t_d;

    -- E: gravacao direta tentando trocar a filial cadastral junto com validacao
    <<t_e>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL OR v_x IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  E NAO TESTADO: maquina ou filial alvo nao encontrada'; EXIT t_e; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO'; v_rows := 0;
      BEGIN
        SET LOCAL ROLE authenticated;
        UPDATE public.client_equipment SET filial_id = v_x, last_validation_at = clock_timestamp() WHERE id = v_m;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        RESET ROLE;
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET ROLE;
      SELECT filial_id INTO v_fil FROM public.client_equipment WHERE id = v_m;
      IF (v_state = 'ACEITO' AND v_rows > 0) OR v_fil IS DISTINCT FROM v_f THEN
        RAISE EXCEPTION 'FALHA [%] E: troca de cadastral aceita (estado=% linhas=%)', v_perfil, v_state, v_rows;
      END IF;
      v_line := v_line || format(E'\n  E OK gravacao direta trocando cadastral bloqueada (%s)',
                                 CASE WHEN v_state = 'ACEITO' THEN 'permissao: 0 linhas' ELSE v_state END);
    END t_e;

    -- F: gravacao direta declarando origem "importacao" sem filial
    <<t_f>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  F NAO TESTADO: maquina nao encontrada'; EXIT t_f; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO'; v_rows := 0;
      BEGIN
        PERFORM set_config('app.validation_filial_origin', 'importacao', true);
        SET LOCAL ROLE authenticated;
        UPDATE public.client_equipment SET last_validation_at = clock_timestamp() WHERE id = v_m;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        RESET ROLE;
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET ROLE;
      PERFORM set_config('app.validation_filial_origin', '', true);
      SELECT validation_filial_id, validation_filial_pending INTO v_vf, v_ok FROM public.client_equipment WHERE id = v_m;
      IF v_state = 'ACEITO' AND v_rows > 0 AND (v_vf IS NULL OR v_ok OR NOT (v_vf = ANY(v_allowed))) THEN
        RAISE EXCEPTION 'FALHA [%] F: contorno por origem aceito sem filial autorizada', v_perfil;
      END IF;
      v_line := v_line || format(E'\n  F OK origem "importacao" nao dispensa a filial (%s)',
        CASE WHEN v_state <> 'ACEITO' THEN 'bloqueado ' || v_state
             WHEN v_rows = 0 THEN 'permissao: 0 linhas'
             ELSE 'aceito somente com a unica filial autorizada' END);
    END t_f;

    -- G: supervisor com varias filiais valida pela filial adicional autorizada
    IF v_e IS NOT NULL THEN
      <<t_g>> BEGIN
        v_m := NULL;
        SELECT ce.id INTO v_m FROM public.client_equipment ce
         WHERE ce.filial_id = v_e AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
           AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
         ORDER BY ce.id LIMIT 1;
        IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  G NAO TESTADO: maquina nao encontrada'; EXIT t_g; END IF;
        v_used := v_used || v_m;
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_e, p_mark_validated => true);
        SELECT validation_filial_id, filial_id INTO v_vf, v_fil FROM public.client_equipment WHERE id = v_m;
        IF v_vf IS DISTINCT FROM v_e OR v_fil IS DISTINCT FROM v_e THEN
          RAISE EXCEPTION 'FALHA [%] G: vf=%', v_perfil, v_vf;
        END IF;
        v_line := v_line || E'\n  G OK Filial Ativa adicional autorizada registrada; cadastral inalterada';
      END t_g;
    END IF;

    -- H: global valida maquina sem filial cadastral escolhendo uma filial
    IF v_global THEN
      <<t_h>> BEGIN
        v_m := NULL;
        SELECT ce.id INTO v_m FROM public.client_equipment ce
         WHERE ce.filial_id IS NULL AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
           AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
         ORDER BY ce.id LIMIT 1;
        IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  H NAO TESTADO: maquina nao encontrada'; EXIT t_h; END IF;
        v_used := v_used || v_m;
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_f, p_mark_validated => true);
        SELECT validation_filial_id, filial_id INTO v_vf, v_fil FROM public.client_equipment WHERE id = v_m;
        IF v_vf IS DISTINCT FROM v_f OR v_fil IS NOT NULL THEN
          RAISE EXCEPTION 'FALHA [%] H: vf=% cadastral=%', v_perfil, v_vf, v_fil;
        END IF;
        v_line := v_line || E'\n  H OK maquina sem filial: responsavel registrada, cadastral continua vazia';
      END t_h;
    END IF;

    -- I: historico nao pode ser apagado
    v_state := 'ACEITO';
    BEGIN
      DELETE FROM public.client_equipment_validation_filial_history WHERE actor_user_id = v_uid;
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    IF v_state <> '42501' THEN RAISE EXCEPTION 'FALHA [%] I: historico apagavel (%)', v_perfil, v_state; END IF;
    v_line := v_line || E'\n  I OK historico imutavel';

    v_rep := v_rep || v_line;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT md5(string_agg(id::text || ':' || COALESCE(filial_id::text, '-'), ',' ORDER BY id)) INTO v_fp_after FROM public.client_equipment;
  SELECT count(*) INTO v_lotes_a FROM public.equipment_regularization_batches;
  SELECT count(*) INTO v_itens_a FROM public.equipment_regularization_items;
  IF v_fp_after <> v_fp_before THEN RAISE EXCEPTION 'FALHA: filial cadastral de alguma maquina mudou'; END IF;
  IF v_lotes_a <> v_lotes_b OR v_itens_a <> v_itens_b THEN RAISE EXCEPTION 'FALHA: lotes/itens mudaram'; END IF;

  -- Sempre termina com erro -> rollback integral. Resultado PARCIAL se algum caso nao foi testado.
  RAISE EXCEPTION E'% SHA=% maquinas_testadas=% nao_testados=% filial_cadastral_identica=sim lotes=% itens=% historico_novo=% %',
    CASE WHEN v_nt = 0 THEN 'SIMULACAO_OK_ROLLBACK' ELSE 'SIMULACAO_PARCIAL_ROLLBACK' END,
    v_sha, cardinality(v_used), v_nt, v_lotes_a, v_itens_a,
    (SELECT count(*) FROM public.client_equipment_validation_filial_history) - v_hist_b, v_rep;
END
$simA$;

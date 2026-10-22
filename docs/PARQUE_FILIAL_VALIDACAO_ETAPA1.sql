-- ETAPA 1 (v2) - Filial responsavel pela validacao (registro daqui para frente)
-- Nao altera filial cadastral (filial_id), nao preenche maquinas antigas, nao muda filtros.
-- Nova validacao SEM filial responsavel identificada e recusada (FILIAL_VALIDACAO_OBRIGATORIA).

ALTER TABLE public.client_equipment
  ADD COLUMN validation_filial_id uuid REFERENCES public.filiais(id),
  ADD COLUMN validation_filial_source text,
  ADD COLUMN validation_filial_at timestamptz,
  ADD COLUMN validation_filial_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.client_equipment_register_validation_filial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_filial uuid;
  v_source text;
  v_ids uuid[];
BEGIN
  IF NEW.filial_id IS DISTINCT FROM OLD.filial_id
     AND current_setting('app.validation_filial_id', true) IS NOT NULL
     AND current_setting('app.validation_filial_id', true) <> '' THEN
    RAISE EXCEPTION 'Validacao nao pode alterar a filial cadastral' USING ERRCODE = '42501';
  END IF;

  IF NEW.last_validation_at IS DISTINCT FROM OLD.last_validation_at
     OR NEW.machine_status IS DISTINCT FROM OLD.machine_status THEN
    v_filial := NULLIF(current_setting('app.validation_filial_id', true), '')::uuid;
    v_source := NULLIF(current_setting('app.validation_filial_source', true), '');
    IF v_filial IS NULL AND auth.uid() IS NOT NULL
       AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
      v_ids := public.get_user_filial_ids_internal(auth.uid());
      IF COALESCE(array_length(v_ids, 1), 0) = 1 THEN
        v_filial := v_ids[1];
        v_source := 'filial_unica_usuario';
      END IF;
    END IF;

    -- Nova validacao exige filial responsavel.
    IF NEW.last_validation_at IS DISTINCT FROM OLD.last_validation_at
       AND NEW.last_validation_at IS NOT NULL AND v_filial IS NULL THEN
      RAISE EXCEPTION 'FILIAL_VALIDACAO_OBRIGATORIA: selecione a filial responsavel pela validacao'
        USING ERRCODE = '22023';
    END IF;

    NEW.validation_filial_id := v_filial;
    NEW.validation_filial_source := CASE WHEN v_filial IS NULL THEN 'pendente' ELSE COALESCE(v_source, 'operacao') END;
    NEW.validation_filial_at := now();
    NEW.validation_filial_pending := (v_filial IS NULL);
  ELSE
    NEW.validation_filial_id := OLD.validation_filial_id;
    NEW.validation_filial_source := OLD.validation_filial_source;
    NEW.validation_filial_at := OLD.validation_filial_at;
    NEW.validation_filial_pending := OLD.validation_filial_pending;
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.client_equipment_register_validation_filial() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_client_equipment_validation_filial
  BEFORE UPDATE ON public.client_equipment
  FOR EACH ROW EXECUTE FUNCTION public.client_equipment_register_validation_filial();

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

  IF v_resp IS NULL AND (COALESCE(p_mark_validated, false)
       OR (p_machine_status IS NOT NULL AND p_machine_status IS DISTINCT FROM v_cur_status)) THEN
    RAISE EXCEPTION 'FILIAL_VALIDACAO_OBRIGATORIA: selecione a filial responsavel pela validacao'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.validation_filial_id', COALESCE(v_resp::text, ''), true);
  PERFORM set_config('app.validation_filial_source', COALESCE(v_source, ''), true);

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
END
$function$;

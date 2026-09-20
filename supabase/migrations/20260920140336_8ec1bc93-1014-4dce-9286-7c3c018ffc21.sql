DROP FUNCTION IF EXISTS public.validate_client_equipment(uuid, uuid, boolean, text, integer, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.validate_client_equipment(
  p_equipment_id uuid,
  p_filial_id uuid DEFAULT NULL,
  p_mark_validated boolean DEFAULT true,
  p_model text DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_hours numeric DEFAULT NULL,
  p_serial_chassis text DEFAULT NULL,
  p_observation text DEFAULT NULL,
  p_machine_status text DEFAULT NULL,
  p_client_code text DEFAULT NULL,
  p_clear_year boolean DEFAULT false,
  p_clear_hours boolean DEFAULT false
)
RETURNS SETOF public.client_equipment
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_eff uuid[];
  v_cur_filial uuid;
  v_cur_code text;
  v_new_filial uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso negado: cadastro nao aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  v_eff := public.effective_filial_ids(p_filial_id);

  SELECT ce.filial_id, ce.client_code INTO v_cur_filial, v_cur_code
    FROM public.client_equipment ce WHERE ce.id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maquina nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_cur_filial IS NULL THEN
    IF p_mark_validated THEN
      IF cardinality(v_eff) <> 1 THEN
        RAISE EXCEPTION 'Selecione uma filial no cabecalho para validar esta maquina'
          USING ERRCODE = '42501';
      END IF;
      v_new_filial := v_eff[1];
    ELSE
      v_new_filial := NULL;
    END IF;
  ELSE
    IF cardinality(v_eff) > 0 AND NOT (v_cur_filial = ANY(v_eff)) THEN
      RAISE EXCEPTION 'Acesso negado: maquina de outra filial' USING ERRCODE = '42501';
    END IF;
    v_new_filial := v_cur_filial;
  END IF;

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
         filial_id = v_new_filial,
         validated_by = CASE WHEN p_mark_validated THEN v_uid ELSE ce.validated_by END,
         last_validation_at = CASE WHEN p_mark_validated THEN now() ELSE ce.last_validation_at END,
         updated_at = now()
   WHERE ce.id = p_equipment_id
  RETURNING ce.*;
END
$fn$;

REVOKE ALL ON FUNCTION public.validate_client_equipment(uuid, uuid, boolean, text, integer, numeric, text, text, text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_client_equipment(uuid, uuid, boolean, text, integer, numeric, text, text, text, text, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_client_equipment(uuid, uuid, boolean, text, integer, numeric, text, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_client_equipment(uuid, uuid, boolean, text, integer, numeric, text, text, text, text, boolean, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.create_client_equipment(text, uuid, text, text, text, text, integer, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_client_equipment(text, uuid, text, text, text, text, integer, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_client_equipment(text, uuid, text, text, text, text, integer, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_equipment(text, uuid, text, text, text, text, integer, numeric, text, text) TO service_role;
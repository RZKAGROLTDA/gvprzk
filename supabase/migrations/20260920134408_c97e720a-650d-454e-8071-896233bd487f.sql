CREATE OR REPLACE FUNCTION public.validate_client_equipment(
  p_equipment_id   uuid,
  p_filial_id      uuid DEFAULT NULL,
  p_mark_validated boolean DEFAULT true,
  p_model          text DEFAULT NULL,
  p_year           integer DEFAULT NULL,
  p_hours          numeric DEFAULT NULL,
  p_serial_chassis text DEFAULT NULL,
  p_observation    text DEFAULT NULL,
  p_machine_status text DEFAULT NULL,
  p_client_code    text DEFAULT NULL
)
RETURNS SETOF public.client_equipment
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
     SET model = COALESCE(p_model, ce.model),
         year = COALESCE(p_year, ce.year),
         hours = COALESCE(p_hours, ce.hours),
         serial_chassis = COALESCE(p_serial_chassis, ce.serial_chassis),
         observation = COALESCE(p_observation, ce.observation),
         machine_status = COALESCE(p_machine_status, ce.machine_status),
         client_code = CASE WHEN v_cur_code IS NULL OR btrim(v_cur_code) = ''
                            THEN COALESCE(p_client_code, ce.client_code) ELSE ce.client_code END,
         filial_id = v_new_filial,
         validated_by = CASE WHEN p_mark_validated THEN v_uid ELSE ce.validated_by END,
         last_validation_at = CASE WHEN p_mark_validated THEN now() ELSE ce.last_validation_at END,
         updated_at = now()
   WHERE ce.id = p_equipment_id
  RETURNING ce.*;
END $$;

REVOKE ALL ON FUNCTION public.validate_client_equipment(uuid,uuid,boolean,text,integer,numeric,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_client_equipment(uuid,uuid,boolean,text,integer,numeric,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_client_equipment(
  p_client_name    text,
  p_filial_id      uuid DEFAULT NULL,
  p_client_code    text DEFAULT NULL,
  p_machine_type   text DEFAULT NULL,
  p_model          text DEFAULT NULL,
  p_serial_chassis text DEFAULT NULL,
  p_year           integer DEFAULT NULL,
  p_hours          numeric DEFAULT NULL,
  p_machine_status text DEFAULT NULL,
  p_observation    text DEFAULT NULL
)
RETURNS SETOF public.client_equipment
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.create_client_equipment(text,uuid,text,text,text,text,integer,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_equipment(text,uuid,text,text,text,text,integer,numeric,text,text) TO authenticated;
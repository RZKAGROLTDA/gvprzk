CREATE OR REPLACE FUNCTION public.pops_machines_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_filial uuid;
BEGIN
  NEW.pops_serial_norm      := public.pops_norm_serial(NEW.pops_serial);
  NEW.pops_client_code_norm := public.pops_norm_code(NEW.pops_client_code);
  NEW.pops_client_name_norm := public.pops_norm_place(NEW.pops_client_name);

  IF NEW.equipment_id IS NULL AND NEW.pops_serial_norm IS NULL THEN
    RAISE EXCEPTION 'Maquina POPS exige vinculo no Parque ou serial da base POPS';
  END IF;

  NEW.link_status := CASE WHEN NEW.equipment_id IS NULL THEN 'sem_vinculo' ELSE 'vinculado' END;

  v_filial := NULL;
  IF NEW.equipment_id IS NOT NULL THEN
    SELECT e.filial_id INTO v_filial
      FROM public.client_equipment e WHERE e.id = NEW.equipment_id;
  END IF;

  IF v_filial IS NULL THEN
    SELECT m.filial_id INTO v_filial
      FROM public.pops_location_mapping m
     WHERE m.active
       AND m.dealer_location_norm = public.pops_norm_place(NEW.pops_dealer_location);
  END IF;

  NEW.pops_filial_id := v_filial;
  NEW.pops_filial_pendente := (NEW.pops_filial_id IS NULL);

  NEW.client_key := CASE
    WHEN NEW.pops_client_name_norm IS NOT NULL
      THEN 'L:' || coalesce(public.pops_norm_place(NEW.pops_dealer_location),'SEM_LOCAL')
           || '|N:' || NEW.pops_client_name_norm
    ELSE 'S:' || coalesce(NEW.pops_serial_norm, NEW.id::text)
  END;

  RETURN NEW;
END $function$;

UPDATE public.pops_machines SET updated_at = now();
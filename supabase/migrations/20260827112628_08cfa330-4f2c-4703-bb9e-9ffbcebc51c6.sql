CREATE OR REPLACE FUNCTION public.pops_norm_place(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT nullif(upper(btrim(regexp_replace(
    translate(p,'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC'),
    '\s+',' ','g'))),'')
$$;

CREATE TABLE public.pops_location_mapping (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_location      text NOT NULL,
  dealer_location_norm text NOT NULL,
  filial_id            uuid REFERENCES public.filiais(id),
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pops_location_mapping_norm_uidx
  ON public.pops_location_mapping (dealer_location_norm);

REVOKE ALL ON public.pops_location_mapping FROM PUBLIC;
REVOKE ALL ON public.pops_location_mapping FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.pops_location_mapping TO authenticated;
GRANT ALL ON public.pops_location_mapping TO service_role;

ALTER TABLE public.pops_location_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY pops_location_mapping_select ON public.pops_location_mapping
  FOR SELECT TO authenticated USING (true);

CREATE POLICY pops_location_mapping_insert ON public.pops_location_mapping
  FOR INSERT TO authenticated
  WITH CHECK (public.pops_is_manager());

CREATE POLICY pops_location_mapping_update ON public.pops_location_mapping
  FOR UPDATE TO authenticated
  USING (public.pops_is_manager())
  WITH CHECK (public.pops_is_manager());

CREATE TRIGGER pops_location_mapping_updated_at
  BEFORE UPDATE ON public.pops_location_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pops_machines
  ALTER COLUMN equipment_id DROP NOT NULL,
  ADD COLUMN pops_serial            text,
  ADD COLUMN pops_serial_norm       text,
  ADD COLUMN pops_client_code       text,
  ADD COLUMN pops_client_code_norm  text,
  ADD COLUMN pops_client_name       text,
  ADD COLUMN pops_client_name_norm  text,
  ADD COLUMN client_key             text,
  ADD COLUMN pops_model             text,
  ADD COLUMN pops_product_series    text,
  ADD COLUMN pops_manufacture_year  text,
  ADD COLUMN pops_platform          text,
  ADD COLUMN pops_dealer_location   text,
  ADD COLUMN pops_filial_id         uuid REFERENCES public.filiais(id),
  ADD COLUMN pops_filial_pendente   boolean NOT NULL DEFAULT false,
  ADD COLUMN link_status            text NOT NULL DEFAULT 'sem_vinculo',
  ADD COLUMN import_row_id          uuid REFERENCES public.pops_import_rows(id);

ALTER TABLE public.pops_machines DROP CONSTRAINT pops_machines_program_equipment_key;

CREATE UNIQUE INDEX pops_machines_program_equipment_uidx
  ON public.pops_machines (program_id, equipment_id)
  WHERE equipment_id IS NOT NULL;

CREATE UNIQUE INDEX pops_machines_program_serial_uidx
  ON public.pops_machines (program_id, pops_serial_norm)
  WHERE pops_serial_norm IS NOT NULL;

CREATE INDEX pops_machines_filial_idx
  ON public.pops_machines (program_id, pops_filial_id) WHERE active;

CREATE INDEX pops_machines_client_code_idx
  ON public.pops_machines (program_id, pops_client_code_norm) WHERE active;

CREATE INDEX pops_machines_client_key_idx
  ON public.pops_machines (program_id, client_key) WHERE active;

CREATE INDEX pops_machines_cliente_nome_idx
  ON public.pops_machines (program_id, pops_client_name_norm) WHERE active;

CREATE OR REPLACE FUNCTION public.pops_machines_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.pops_serial_norm      := public.pops_norm_serial(NEW.pops_serial);
  NEW.pops_client_code_norm := public.pops_norm_code(NEW.pops_client_code);
  NEW.pops_client_name_norm := public.pops_norm_place(NEW.pops_client_name);

  IF NEW.equipment_id IS NULL AND NEW.pops_serial_norm IS NULL THEN
    RAISE EXCEPTION 'Maquina POPS exige vinculo no Parque ou serial da base POPS';
  END IF;

  NEW.link_status := CASE WHEN NEW.equipment_id IS NULL THEN 'sem_vinculo' ELSE 'vinculado' END;

  IF NEW.equipment_id IS NOT NULL THEN
    SELECT e.filial_id INTO NEW.pops_filial_id
      FROM public.client_equipment e WHERE e.id = NEW.equipment_id;
  ELSE
    SELECT m.filial_id INTO NEW.pops_filial_id
      FROM public.pops_location_mapping m
     WHERE m.active
       AND m.dealer_location_norm = public.pops_norm_place(NEW.pops_dealer_location);
  END IF;

  NEW.pops_filial_pendente := (NEW.pops_filial_id IS NULL);

  NEW.client_key := CASE
    WHEN NEW.pops_client_name_norm IS NOT NULL
      THEN 'L:' || coalesce(public.pops_norm_place(NEW.pops_dealer_location),'SEM_LOCAL')
           || '|N:' || NEW.pops_client_name_norm
    ELSE 'S:' || coalesce(NEW.pops_serial_norm, NEW.id::text)
  END;

  RETURN NEW;
END $$;

CREATE TRIGGER pops_machines_normalize_trg
  BEFORE INSERT OR UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_machines_normalize();

CREATE OR REPLACE FUNCTION public.pops_recalc_filiais(p_program_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;

  UPDATE public.pops_machines SET updated_at = now()
   WHERE program_id = p_program_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.pops_can_read_machine(p_pops_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.pops_is_manager() THEN true
              ELSE EXISTS (SELECT 1 FROM public.pops_machines m
                            WHERE m.id = p_pops_machine_id
                              AND m.pops_filial_id = public.get_user_filial_id())
         END
$$;

DROP POLICY pops_machines_select_scope ON public.pops_machines;

CREATE POLICY pops_machines_select_scope ON public.pops_machines
FOR SELECT TO authenticated
USING (
  CASE public.pops_scope() ->> 'scope'
    WHEN 'global' THEN true
    ELSE pops_filial_id IS NOT NULL
         AND pops_filial_id = ((public.pops_scope() ->> 'filial_id'))::uuid
  END
);
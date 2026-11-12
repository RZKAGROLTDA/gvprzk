CREATE OR REPLACE FUNCTION public.projection_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'projection_filial_divisional' THEN
    IF NEW.divisional IS NOT NULL AND NEW.divisional NOT IN ('MT','GO','PA','C&F') THEN
      RAISE EXCEPTION 'Divisional inválida'; END IF;
  ELSE
    IF NEW.mes NOT BETWEEN 1 AND 12 OR NEW.ano NOT BETWEEN 2020 AND 2100 THEN
      RAISE EXCEPTION 'Mês/ano inválido'; END IF;
    IF TG_TABLE_NAME = 'projection_goals' THEN
      IF NEW.meta < 0 THEN RAISE EXCEPTION 'Meta inválida'; END IF;
    ELSIF TG_TABLE_NAME = 'projection_entries' THEN
      IF NEW.semana NOT BETWEEN 1 AND 4 OR NEW.sem_risco < 0 OR NEW.com_risco < 0 THEN
        RAISE EXCEPTION 'Semana ou valor inválido'; END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

INSERT INTO public.projection_filial_divisional (filial_id, divisional, incluida)
SELECT f.id, v.divisional, true
FROM (VALUES
  ('f131ae2a-ba13-4abf-ab64-dfb7cea5c7e4'::uuid,'MT'),
  ('5202c983-737b-4f78-a00d-6d9d12f713c3'::uuid,'MT'),
  ('3aff6a7c-2264-4395-8132-b6e14ea0a2a0'::uuid,'MT'),
  ('15e25916-279d-4674-a283-7d8f589940f7'::uuid,'MT'),
  ('3839c2a4-4de5-4940-9ef9-c8e4351c1524'::uuid,'MT'),
  ('4535b36c-9f48-4df1-b9d6-51d329ee8dad'::uuid,'MT'),
  ('1e37252a-1992-4778-b009-0528646a29c2'::uuid,'MT'),
  ('79bbeaae-8617-4bc8-893f-7841d40782c4'::uuid,'MT'),
  ('9244b8f2-50cc-4939-9b29-980c926a04da'::uuid,'GO'),
  ('501b1452-3ddb-4f96-a390-1ddce9e14384'::uuid,'GO'),
  ('502c311e-9c14-4198-a356-85e1419fa666'::uuid,'GO'),
  ('0d1f33fe-24ab-46d0-9538-793aa1095d18'::uuid,'GO'),
  ('8e18326d-8714-4bea-9a5d-2274e566805f'::uuid,'GO'),
  ('1547cfe6-e532-436b-be87-448470f76e87'::uuid,'PA'),
  ('21056d12-5a47-403e-9b95-a83dcb245eea'::uuid,'PA'),
  ('c5b496f8-8eb7-4f95-a040-0b5ea41f2830'::uuid,'PA'),
  ('c655227d-f4f5-4bbb-acc4-6bc8cabd3eb0'::uuid,'PA'),
  ('27d9e744-0374-49fa-8a00-77317bede774'::uuid,'PA'),
  ('03610492-dc48-4894-9776-88e38eff311c'::uuid,'PA'),
  ('a223ce39-84da-4c43-a603-5e2d45191354'::uuid,'PA'),
  ('902c526d-d230-4ac7-a6f1-d79db114cda6'::uuid,'C&F'),
  ('e3dba55f-cea4-4ed1-9eb9-e7de25308f48'::uuid,'C&F'),
  ('0aec623e-cf9c-44e0-9713-308e24cab6f4'::uuid,'C&F'),
  ('eaa327ae-0532-4dba-a1d2-749fa9c34128'::uuid,'C&F'),
  ('c75d5614-ad22-4928-84a6-4b6195afae33'::uuid,'C&F'),
  ('f5d989dc-946c-40c1-bc72-84fefa3ba22b'::uuid,'C&F'),
  ('4c815d66-6160-47be-95f0-165bcc17f8b8'::uuid,'C&F'),
  ('b0c1a74a-6ed1-4a1d-8b4f-1d407dbafa88'::uuid,'C&F'),
  ('ed4af541-e700-4ad6-8481-d9019e405493'::uuid,'C&F')
) AS v(filial_id, divisional)
JOIN public.filiais f ON f.id = v.filial_id
WHERE regexp_replace(lower(f.nome),'\s','','g') <> 'televendas'
ON CONFLICT (filial_id) DO UPDATE SET divisional = EXCLUDED.divisional, incluida = true;
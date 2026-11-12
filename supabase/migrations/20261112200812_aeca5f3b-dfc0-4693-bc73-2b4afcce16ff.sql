CREATE OR REPLACE FUNCTION public.projection_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'projection_filial_divisional' THEN
    IF NEW.divisional IS NOT NULL AND NEW.divisional NOT IN ('MT','GO','PA') THEN
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
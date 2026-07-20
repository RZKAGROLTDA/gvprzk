
CREATE OR REPLACE FUNCTION public.sync_employment_status_to_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employment_status = 'inactive'
     AND (OLD.employment_status IS DISTINCT FROM 'inactive') THEN
    NEW.approval_status := 'rejected';
    IF NEW.deactivated_at IS NULL THEN
      NEW.deactivated_at := now();
    END IF;
  END IF;

  -- Reativação NÃO restaura approval_status automaticamente.
  -- Administrador deve reaprovar manualmente.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employment_status ON public.profiles;
CREATE TRIGGER trg_sync_employment_status
BEFORE UPDATE OF employment_status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_employment_status_to_approval();

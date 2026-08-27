REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pops_location_mapping FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pops_location_mapping TO authenticated;
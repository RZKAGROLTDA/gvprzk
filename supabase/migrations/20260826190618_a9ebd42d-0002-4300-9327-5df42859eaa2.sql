REVOKE ALL ON public.pops_programs FROM anon;
REVOKE ALL ON public.pops_services FROM anon;
REVOKE ALL ON public.pops_machines FROM anon;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pops_programs FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pops_services FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pops_machines FROM authenticated;

REVOKE INSERT, UPDATE ON public.pops_programs FROM authenticated;
REVOKE INSERT, UPDATE ON public.pops_services FROM authenticated;
GRANT INSERT, UPDATE ON public.pops_programs TO authenticated;
GRANT INSERT, UPDATE ON public.pops_services TO authenticated;
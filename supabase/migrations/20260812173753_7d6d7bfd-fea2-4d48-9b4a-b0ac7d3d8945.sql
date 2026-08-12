REVOKE ALL ON FUNCTION public.get_training_goal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_training_goal() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_training_goal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_goal() TO service_role;

REVOKE ALL ON FUNCTION public.prevent_training_catalog_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_training_catalog_delete() FROM anon;
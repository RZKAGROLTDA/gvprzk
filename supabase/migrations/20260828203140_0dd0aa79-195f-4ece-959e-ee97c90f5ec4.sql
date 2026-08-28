CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

ALTER FUNCTION public.equipment_regularization_pending_kpis(
  uuid, boolean, text, text, text
) SET search_path = public, extensions;

ALTER FUNCTION public.equipment_regularization_pending_clients(
  uuid, boolean, text, text, text, integer, integer
) SET search_path = public, extensions;

ALTER FUNCTION public.equipment_regularization_pending_machines(
  text, uuid, boolean, text, text, text
) SET search_path = public, extensions;
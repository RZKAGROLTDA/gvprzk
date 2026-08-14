CREATE OR REPLACE FUNCTION public.can_edit_client_equipment(p_equipment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_equipment ce
    WHERE ce.id = p_equipment_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role)
        OR ce.created_by = auth.uid()
        OR ce.validated_by = auth.uid()
        OR ce.filial_id IS NULL
        OR ce.filial_id = public.get_user_filial_id()
        OR ce.filial_id = public.get_supervisor_filial_id(auth.uid())
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_edit_client_equipment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_client_equipment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_edit_client_equipment(uuid) TO authenticated;
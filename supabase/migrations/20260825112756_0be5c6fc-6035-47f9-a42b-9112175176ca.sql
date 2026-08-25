CREATE OR REPLACE FUNCTION public.can_edit_client_equipment(p_equipment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_view_equipment_park()
     AND EXISTS (SELECT 1 FROM public.client_equipment ce WHERE ce.id = p_equipment_id);
$$;

DROP POLICY IF EXISTS client_equipment_select ON public.client_equipment;
DROP POLICY IF EXISTS client_equipment_update ON public.client_equipment;
DROP POLICY IF EXISTS client_equipment_insert ON public.client_equipment;

CREATE POLICY client_equipment_select
ON public.client_equipment
FOR SELECT
TO authenticated
USING ((SELECT public.can_view_equipment_park()));

CREATE POLICY client_equipment_update
ON public.client_equipment
FOR UPDATE
TO authenticated
USING ((SELECT public.can_view_equipment_park()))
WITH CHECK ((SELECT public.can_view_equipment_park()));

CREATE POLICY client_equipment_insert
ON public.client_equipment
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (SELECT public.can_view_equipment_park())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_equipment TO authenticated;
GRANT ALL ON public.client_equipment TO service_role;
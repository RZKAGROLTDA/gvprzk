DROP POLICY IF EXISTS client_equipment_select ON public.client_equipment;
DROP POLICY IF EXISTS client_equipment_update ON public.client_equipment;

CREATE POLICY client_equipment_select
ON public.client_equipment
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR created_by = auth.uid()
  OR validated_by = auth.uid()
  OR filial_id IS NULL
  OR filial_id = public.get_user_filial_id()
  OR filial_id = public.get_supervisor_filial_id(auth.uid())
);

CREATE POLICY client_equipment_update
ON public.client_equipment
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR created_by = auth.uid()
  OR validated_by = auth.uid()
  OR filial_id IS NULL
  OR filial_id = public.get_user_filial_id()
  OR filial_id = public.get_supervisor_filial_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR created_by = auth.uid()
  OR validated_by = auth.uid()
  OR filial_id IS NULL
  OR filial_id = public.get_user_filial_id()
  OR filial_id = public.get_supervisor_filial_id(auth.uid())
);
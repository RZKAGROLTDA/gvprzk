DROP POLICY IF EXISTS visit_schedules_delete ON public.visit_schedules;

CREATE POLICY visit_schedules_delete ON public.visit_schedules
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
  OR (seller_id = auth.uid() AND status <> 'realizado')
);
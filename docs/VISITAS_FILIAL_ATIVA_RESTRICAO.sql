-- PROPOSTA SEPARADA — NÃO EXECUTAR SEM APROVAÇÃO ESPECÍFICA.
-- Restringe o SUPERVISOR na Programação de Visitas à Filial Ativa gravada
-- (get_user_active_filial()), em vez de todas as filiais autorizadas.
-- Impacto: supervisor com várias filiais deixa de ver/editar as outras até trocar a Filial Ativa;
-- supervisor sem Filial Ativa gravada passa a ver só as próprias visitas.
-- Admin, gerente e consultor/RAC: inalterados. Exclusão: mesma regra atual + Filial Ativa.
CREATE OR REPLACE FUNCTION public.visit_schedule_supervisor_ok(p_filial_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'supervisor')
     AND p_filial_id IS NOT NULL
     AND p_filial_id = public.get_user_active_filial()
     AND public.user_can_access_filial(p_filial_id)
$$;
REVOKE ALL ON FUNCTION public.visit_schedule_supervisor_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visit_schedule_supervisor_ok(uuid) TO authenticated;

DROP POLICY visit_schedules_select ON public.visit_schedules;
CREATE POLICY visit_schedules_select ON public.visit_schedules FOR SELECT TO authenticated USING (
  seller_id = auth.uid() OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'admin')
  OR public.visit_schedule_supervisor_ok(filial_id));
DROP POLICY visit_schedules_insert ON public.visit_schedules;
CREATE POLICY visit_schedules_insert ON public.visit_schedules FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND (seller_id = auth.uid() OR has_role(auth.uid(),'manager')
  OR has_role(auth.uid(),'admin') OR public.visit_schedule_supervisor_ok(filial_id)));
DROP POLICY visit_schedules_update ON public.visit_schedules;
CREATE POLICY visit_schedules_update ON public.visit_schedules FOR UPDATE TO authenticated
USING (seller_id = auth.uid() OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'admin')
  OR public.visit_schedule_supervisor_ok(filial_id))
WITH CHECK (seller_id = auth.uid() OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'admin')
  OR public.visit_schedule_supervisor_ok(filial_id));
DROP POLICY visit_schedules_delete ON public.visit_schedules;
CREATE POLICY visit_schedules_delete ON public.visit_schedules FOR DELETE TO authenticated USING (
  has_role(auth.uid(),'manager') OR has_role(auth.uid(),'admin')
  OR public.visit_schedule_supervisor_ok(filial_id)
  OR (seller_id = auth.uid() AND status <> 'realizado'));

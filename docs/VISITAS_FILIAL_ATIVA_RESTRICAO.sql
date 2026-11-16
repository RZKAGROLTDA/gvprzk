-- PROPOSTA SEPARADA — NÃO EXECUTAR SEM APROVAÇÃO ESPECÍFICA.
-- Restringe o SUPERVISOR na Programação de Visitas à Filial Ativa gravada
-- gravada no servidor, em vez de todas as filiais autorizadas.
-- ATENÇÃO: hoje a Filial Ativa existe só na sessão do navegador; o banco não a conhece.
-- Por isso esta proposta cria um registro da Filial Ativa (user_active_filial) que a tela
-- passaria a gravar ao trocar a filial no topo. Sem isso, a restrição não é possível via RLS.
-- Impacto: supervisor com várias filiais deixa de ver/editar as outras até trocar a Filial Ativa;
-- supervisor sem Filial Ativa gravada passa a ver só as próprias visitas.
-- Admin, gerente e consultor/RAC: inalterados. Exclusão: mesma regra atual + Filial Ativa.
CREATE TABLE public.user_active_filial (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  filial_id uuid NOT NULL REFERENCES public.filiais(id),
  updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_active_filial TO authenticated;
GRANT ALL ON public.user_active_filial TO service_role;
ALTER TABLE public.user_active_filial ENABLE ROW LEVEL SECURITY;
CREATE POLICY uaf_own ON public.user_active_filial FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.user_can_access_filial(filial_id));

CREATE OR REPLACE FUNCTION public.get_user_active_filial()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT filial_id FROM public.user_active_filial WHERE user_id = auth.uid()
$$;

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

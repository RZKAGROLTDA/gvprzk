-- =========================================================
-- OTIMIZAÇÃO DE PERFORMANCE DE RLS (InitPlan)
-- Semântica preservada 1:1. Nenhuma permissão alterada.
-- Nenhum dado inserido, alterado ou removido.
-- =========================================================

-- ---------- client_equipment ----------
DROP POLICY IF EXISTS client_equipment_select ON public.client_equipment;
CREATE POLICY client_equipment_select ON public.client_equipment
FOR SELECT TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (created_by = (SELECT auth.uid()))
  OR (validated_by = (SELECT auth.uid()))
  OR (filial_id IS NULL)
  OR (filial_id = (SELECT public.get_user_filial_id()))
  OR (filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid()))))
);

DROP POLICY IF EXISTS client_equipment_insert ON public.client_equipment;
CREATE POLICY client_equipment_insert ON public.client_equipment
FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS client_equipment_update ON public.client_equipment;
CREATE POLICY client_equipment_update ON public.client_equipment
FOR UPDATE TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (created_by = (SELECT auth.uid()))
  OR (validated_by = (SELECT auth.uid()))
  OR (filial_id IS NULL)
  OR (filial_id = (SELECT public.get_user_filial_id()))
  OR (filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid()))))
)
WITH CHECK (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (created_by = (SELECT auth.uid()))
  OR (validated_by = (SELECT auth.uid()))
  OR (filial_id IS NULL)
  OR (filial_id = (SELECT public.get_user_filial_id()))
  OR (filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid()))))
);

DROP POLICY IF EXISTS client_equipment_delete ON public.client_equipment;
CREATE POLICY client_equipment_delete ON public.client_equipment
FOR DELETE TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
);

-- ---------- clients_master ----------
DROP POLICY IF EXISTS clients_master_select_authenticated ON public.clients_master;
CREATE POLICY clients_master_select_authenticated ON public.clients_master
FOR SELECT TO authenticated
USING (
  (SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'::employment_status
  ))
);

DROP POLICY IF EXISTS clients_master_insert_admin ON public.clients_master;
CREATE POLICY clients_master_insert_admin ON public.clients_master
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
);

DROP POLICY IF EXISTS clients_master_update_admin ON public.clients_master;
CREATE POLICY clients_master_update_admin ON public.clients_master
FOR UPDATE TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
)
WITH CHECK (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
);

DROP POLICY IF EXISTS clients_master_delete_admin ON public.clients_master;
CREATE POLICY clients_master_delete_admin ON public.clients_master
FOR DELETE TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

-- ---------- task_followups ----------
DROP POLICY IF EXISTS task_followups_select ON public.task_followups;
CREATE POLICY task_followups_select ON public.task_followups
FOR SELECT TO authenticated
USING (
  (responsible_user_id = (SELECT auth.uid()))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (
    (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
    AND filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid())))
  )
);

DROP POLICY IF EXISTS task_followups_insert ON public.task_followups;
CREATE POLICY task_followups_insert ON public.task_followups
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (
    (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
    AND filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid())))
  )
  OR (responsible_user_id = (SELECT auth.uid()) AND created_by = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS task_followups_update ON public.task_followups;
CREATE POLICY task_followups_update ON public.task_followups
FOR UPDATE TO authenticated
USING (
  (responsible_user_id = (SELECT auth.uid()))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (
    (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
    AND filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid())))
  )
)
WITH CHECK (
  (responsible_user_id = (SELECT auth.uid()))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (
    (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
    AND filial_id = (SELECT public.get_supervisor_filial_id((SELECT auth.uid())))
  )
);

DROP POLICY IF EXISTS task_followups_delete_admin ON public.task_followups;
CREATE POLICY task_followups_delete_admin ON public.task_followups
FOR DELETE TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

-- ---------- tasks ----------
DROP POLICY IF EXISTS secure_task_select_enhanced ON public.tasks;
CREATE POLICY secure_task_select_enhanced ON public.tasks
FOR SELECT TO authenticated
USING (
  (created_by = (SELECT auth.uid()))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (
    (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
    AND tasks.filial IN (
      SELECT f.nome
      FROM public.profiles p
      JOIN public.filiais f ON p.filial_id = f.id
      WHERE p.user_id = (SELECT auth.uid())
        AND p.approval_status = 'approved'
    )
  )
);

DROP POLICY IF EXISTS secure_task_insert ON public.tasks;
CREATE POLICY secure_task_insert ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS secure_task_update ON public.tasks;
CREATE POLICY secure_task_update ON public.tasks
FOR UPDATE TO authenticated
USING (
  (created_by = (SELECT auth.uid()))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
)
WITH CHECK (
  (created_by = (SELECT auth.uid()))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
);

DROP POLICY IF EXISTS secure_task_delete_admin_only ON public.tasks;
CREATE POLICY secure_task_delete_admin_only ON public.tasks
FOR DELETE TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

-- ---------- Índices de suporte ----------
CREATE INDEX IF NOT EXISTS idx_task_followups_activity_date_desc
  ON public.task_followups (activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_followups_responsible_activity
  ON public.task_followups (responsible_user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_followups_filial_activity
  ON public.task_followups (filial_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_equipment_filial_id
  ON public.client_equipment (filial_id);
CREATE INDEX IF NOT EXISTS idx_client_equipment_created_by
  ON public.client_equipment (created_by);
CREATE INDEX IF NOT EXISTS idx_client_equipment_validated_by
  ON public.client_equipment (validated_by);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_filial
  ON public.tasks (filial);

ANALYZE public.task_followups;
ANALYZE public.client_equipment;
ANALYZE public.clients_master;
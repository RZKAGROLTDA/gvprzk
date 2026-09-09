CREATE OR REPLACE FUNCTION public.get_user_filial_ids_internal(p_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_remove(array_agg(DISTINCT fid), NULL), '{}'::uuid[])
  FROM (
    SELECT p.filial_id AS fid
      FROM public.profiles p
     WHERE p.user_id = p_user_id
       AND p.approval_status = 'approved'
       AND p.employment_status = 'active'
    UNION
    SELECT uf.filial_id
      FROM public.user_filiais uf
      JOIN public.profiles p2 ON p2.user_id = uf.user_id
     WHERE uf.user_id = p_user_id
       AND uf.active
       AND p2.approval_status = 'approved'
       AND p2.employment_status = 'active'
  ) s;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_filial_ids_internal(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM unnest(public.get_user_filial_ids_internal(auth.uid())) AS a(fid)
       WHERE a.fid = ANY (public.get_user_filial_ids_internal(target_user_id))
     );
$$;

CREATE OR REPLACE FUNCTION public.pops_scope()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_enabled boolean;
  v_filial uuid;
  v_scope text := 'none';
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,
                              'filial_ids','[]'::jsonb,'user_id',NULL);
  END IF;

  SELECT (p.approval_status='approved' AND p.employment_status='active'), p.filial_id
    INTO v_enabled, v_filial
    FROM public.profiles p WHERE p.user_id = v_uid;

  IF COALESCE(v_enabled,false) = false THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,
                              'filial_ids','[]'::jsonb,'user_id',v_uid);
  END IF;

  IF public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') THEN
    v_scope := 'global';
  ELSIF public.has_role(v_uid,'supervisor')
     OR public.has_role(v_uid,'rac')
     OR public.has_role(v_uid,'cpa')
     OR public.has_role(v_uid,'csa') THEN
    v_scope := 'filial';
  END IF;

  v_ids := public.get_user_filial_ids_internal(v_uid);

  RETURN jsonb_build_object('scope', v_scope, 'filial_id', v_filial,
                            'filial_ids', to_jsonb(v_ids), 'user_id', v_uid);
END $$;

CREATE OR REPLACE FUNCTION public.my_day_scope_v2()
RETURNS TABLE(user_id uuid, role text, filial_id uuid, filial_ids uuid[], scope text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_filial uuid;
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT p.filial_id, true INTO v_filial, v_found
    FROM public.profiles p
   WHERE p.user_id = v_uid
     AND p.approval_status = 'approved'
     AND p.employment_status = 'active';

  IF NOT COALESCE(v_found,false) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  v_role := public.get_user_role();

  RETURN QUERY
  SELECT v_uid, v_role, v_filial,
         public.get_user_filial_ids_internal(v_uid),
         CASE WHEN v_role IN ('admin','manager') THEN 'global'
              WHEN v_role = 'supervisor'          THEN 'filial'
              ELSE 'self' END;
END $$;

REVOKE EXECUTE ON FUNCTION public.my_day_scope_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_day_scope_v2() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_insert_vacation(p_filial_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND p.approval_status = 'approved'
       AND (public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'manager'::app_role))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND p.approval_status = 'approved'
       AND (public.has_role(auth.uid(),'supervisor'::app_role)
         OR public.has_role(auth.uid(),'rac'::app_role)
         OR public.has_role(auth.uid(),'cpa'::app_role)
         OR public.has_role(auth.uid(),'csa'::app_role))
  ) AND public.user_can_access_filial(p_filial_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END $$;

DROP POLICY IF EXISTS campaign_clients_select ON public.campaign_clients;
CREATE POLICY campaign_clients_select ON public.campaign_clients
  FOR SELECT USING (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS campaign_clients_insert ON public.campaign_clients;
CREATE POLICY campaign_clients_insert ON public.campaign_clients
  FOR INSERT WITH CHECK (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS campaign_clients_update ON public.campaign_clients;
CREATE POLICY campaign_clients_update ON public.campaign_clients
  FOR UPDATE USING (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  ) WITH CHECK (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS special_conditions_select ON public.special_conditions;
CREATE POLICY special_conditions_select ON public.special_conditions
  FOR SELECT USING (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS special_conditions_insert ON public.special_conditions;
CREATE POLICY special_conditions_insert ON public.special_conditions
  FOR INSERT WITH CHECK (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS special_conditions_update ON public.special_conditions;
CREATE POLICY special_conditions_update ON public.special_conditions
  FOR UPDATE USING (
    has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR (seller_id = auth.uid() AND status = 'pendente'::text)
  ) WITH CHECK (
    has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR (seller_id = auth.uid() AND status = 'pendente'::text)
  );

DROP POLICY IF EXISTS special_conditions_delete ON public.special_conditions;
CREATE POLICY special_conditions_delete ON public.special_conditions
  FOR DELETE USING (
    has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR (seller_id = auth.uid() AND status = 'pendente'::text)
  );

DROP POLICY IF EXISTS visit_schedules_select ON public.visit_schedules;
CREATE POLICY visit_schedules_select ON public.visit_schedules
  FOR SELECT USING (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS visit_schedules_insert ON public.visit_schedules;
CREATE POLICY visit_schedules_insert ON public.visit_schedules
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      seller_id = auth.uid()
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'admin'::app_role)
      OR (has_role(auth.uid(),'supervisor'::app_role)
          AND public.user_can_access_filial(filial_id))
    )
  );

DROP POLICY IF EXISTS visit_schedules_update ON public.visit_schedules;
CREATE POLICY visit_schedules_update ON public.visit_schedules
  FOR UPDATE USING (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  ) WITH CHECK (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS visit_schedules_delete ON public.visit_schedules;
CREATE POLICY visit_schedules_delete ON public.visit_schedules
  FOR DELETE USING (
    has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR (seller_id = auth.uid() AND status <> 'realizado'::text)
  );

DROP POLICY IF EXISTS task_followups_select ON public.task_followups;
CREATE POLICY task_followups_select ON public.task_followups
  FOR SELECT USING (
    responsible_user_id = (SELECT auth.uid())
    OR (SELECT has_role((SELECT auth.uid()),'manager'::app_role))
    OR (SELECT has_role((SELECT auth.uid()),'admin'::app_role))
    OR ((SELECT has_role((SELECT auth.uid()),'supervisor'::app_role))
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS task_followups_insert ON public.task_followups;
CREATE POLICY task_followups_insert ON public.task_followups
  FOR INSERT WITH CHECK (
    (SELECT has_role((SELECT auth.uid()),'manager'::app_role))
    OR (SELECT has_role((SELECT auth.uid()),'admin'::app_role))
    OR ((SELECT has_role((SELECT auth.uid()),'supervisor'::app_role))
        AND public.user_can_access_filial(filial_id))
    OR (responsible_user_id = (SELECT auth.uid()) AND created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS task_followups_update ON public.task_followups;
CREATE POLICY task_followups_update ON public.task_followups
  FOR UPDATE USING (
    responsible_user_id = (SELECT auth.uid())
    OR (SELECT has_role((SELECT auth.uid()),'manager'::app_role))
    OR (SELECT has_role((SELECT auth.uid()),'admin'::app_role))
    OR ((SELECT has_role((SELECT auth.uid()),'supervisor'::app_role))
        AND public.user_can_access_filial(filial_id))
  ) WITH CHECK (
    responsible_user_id = (SELECT auth.uid())
    OR (SELECT has_role((SELECT auth.uid()),'manager'::app_role))
    OR (SELECT has_role((SELECT auth.uid()),'admin'::app_role))
    OR ((SELECT has_role((SELECT auth.uid()),'supervisor'::app_role))
        AND public.user_can_access_filial(filial_id))
  );

DROP POLICY IF EXISTS trainings_select_scope ON public.trainings;
CREATE POLICY trainings_select_scope ON public.trainings
  FOR SELECT USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS trainings_update_scope ON public.trainings;
CREATE POLICY trainings_update_scope ON public.trainings
  FOR UPDATE USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR user_id = auth.uid()
  ) WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS trainings_delete_scope ON public.trainings;
CREATE POLICY trainings_delete_scope ON public.trainings
  FOR DELETE USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(filial_id))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS secure_clients_select_contact_protected ON public.clients;
CREATE POLICY secure_clients_select_contact_protected ON public.clients
  FOR SELECT USING (
    auth.uid() = created_by
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(
              (SELECT creator.filial_id FROM public.profiles creator
                WHERE creator.user_id = clients.created_by LIMIT 1)))
  );

DROP POLICY IF EXISTS enhanced_clients_update ON public.clients;
CREATE POLICY enhanced_clients_update ON public.clients
  FOR UPDATE USING (
    auth.uid() = created_by
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(
              (SELECT creator.filial_id FROM public.profiles creator
                WHERE creator.user_id = clients.created_by LIMIT 1)))
  ) WITH CHECK (
    auth.uid() = created_by
    OR has_role(auth.uid(),'manager'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial(
              (SELECT creator.filial_id FROM public.profiles creator
                WHERE creator.user_id = clients.created_by LIMIT 1)))
  );

DROP POLICY IF EXISTS opportunities_select_with_supervisor_filial_access ON public.opportunities;
CREATE POLICY opportunities_select_with_supervisor_filial_access ON public.opportunities
  FOR SELECT USING (
    has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.tasks t
                WHERE t.id = opportunities.task_id AND t.created_by = auth.uid())
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND public.user_can_access_filial_nome(opportunities.filial))
  );

DROP POLICY IF EXISTS "Users can create opportunities for their tasks" ON public.opportunities;
CREATE POLICY "Users can create opportunities for their tasks" ON public.opportunities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
       WHERE t.id = opportunities.task_id
         AND (t.created_by = auth.uid()
              OR has_role(auth.uid(),'manager'::app_role)
              OR (has_role(auth.uid(),'supervisor'::app_role)
                  AND public.user_can_access_filial_nome(t.filial)))
    )
  );

DROP POLICY IF EXISTS opportunity_items_access ON public.opportunity_items;
CREATE POLICY opportunity_items_access ON public.opportunity_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
        JOIN public.tasks t ON t.id = o.task_id
       WHERE o.id = opportunity_items.opportunity_id
         AND (t.created_by = auth.uid()
              OR has_role(auth.uid(),'manager'::app_role)
              OR has_role(auth.uid(),'admin'::app_role)
              OR (has_role(auth.uid(),'supervisor'::app_role)
                  AND public.user_can_access_filial_nome(t.filial)))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunities o
        JOIN public.tasks t ON t.id = o.task_id
       WHERE o.id = opportunity_items.opportunity_id
         AND (t.created_by = auth.uid()
              OR has_role(auth.uid(),'manager'::app_role)
              OR has_role(auth.uid(),'admin'::app_role)
              OR (has_role(auth.uid(),'supervisor'::app_role)
                  AND public.user_can_access_filial_nome(t.filial)))
    )
  );

DROP POLICY IF EXISTS pops_machines_select_scope ON public.pops_machines;
CREATE POLICY pops_machines_select_scope ON public.pops_machines
  FOR SELECT USING (
    CASE (public.pops_scope() ->> 'scope')
      WHEN 'global' THEN true
      ELSE (pops_filial_id IS NOT NULL
            AND public.user_can_access_filial(pops_filial_id))
    END
  );

DROP POLICY IF EXISTS pops_client_assignments_select_scope ON public.pops_client_assignments;
CREATE POLICY pops_client_assignments_select_scope ON public.pops_client_assignments
  FOR SELECT USING (
    CASE (public.pops_scope() ->> 'scope')
      WHEN 'global' THEN true
      WHEN 'self'   THEN rac_user_id = (SELECT auth.uid())
      WHEN 'filial' THEN EXISTS (
        SELECT 1
          FROM public.pops_machines m
          JOIN public.pops_import_rows r ON r.confirmed_machine_id = m.id
          JOIN public.client_equipment e ON e.id = m.equipment_id
         WHERE m.program_id = pops_client_assignments.program_id
           AND r.pops_client_code_norm = pops_client_assignments.pops_client_code_norm
           AND public.user_can_access_filial(e.filial_id)
      )
      ELSE false
    END
  );
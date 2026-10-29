-- Análise Gerencial → Relatório: exportação Excel de Ligações / Visitas / Checklists
-- SOMENTE LEITURA. Não altera dados, permissões, RLS nem outras funções.
-- Escopo de acesso (Filial Ativa via effective_filial_ids + cargo):
--   admin/manager: global (filtro de filial opcional)
--   supervisor: apenas a Filial Ativa resolvida por effective_filial_ids (sem combinar filiais)
--   demais cargos: apenas as próprias tarefas, dentro da Filial Ativa
--   filial não autorizada => erro 42501 (lançado por effective_filial_ids).
-- Paginação keyset por tasks.id (sem OFFSET, sem count), máx. 1000 por chamada.

CREATE OR REPLACE FUNCTION public.get_management_activity_export(
  p_kind text,                       -- 'ligacao' | 'visita' | 'checklist'
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_client_code text DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_filial_atendida text DEFAULT NULL,  -- filtro opcional por filial atendida (texto, LOWER/TRIM)
  p_task_types text[] DEFAULT NULL,     -- subfiltro de tipo dentro do grupo (ex.: só 'prospection')
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  task_id uuid,
  task_type text,
  start_date date,
  start_time text,
  status text,
  filial text,
  filial_atendida text,
  seller_id uuid,
  seller_name text,
  seller_role text,
  client text,
  client_code text,
  property text,
  property_hectares numeric,
  contact_name text,
  contact_function text,
  phone text,
  email text,
  observations text,
  sales_type text,
  sales_value numeric,
  partial_sales_value numeric,
  sales_confirmed boolean,
  is_prospect boolean,
  next_action text,
  next_action_date date,
  equipment_quantity integer,
  opportunity_status text,
  opportunity_total numeric,
  opportunity_closed numeric,
  followup_status text,
  followup_next_return date,
  followup_temperature text,
  followup_notes text,
  surveyed_machines jsonb,      -- levantadas na visita (tasks.equipment_list)
  checklist_machine jsonb,      -- ficha do checklist (tasks.checklist_machine)
  technical_visit jsonb,        -- apenas equipments/service_type/total_estimate
  park_machines jsonb           -- dados ATUAIS do cadastro do Parque vinculados (task_equipment)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_scope uuid[];
  v_can_park boolean;
  v_seller uuid := public.resolve_primary_user_id(p_seller_id);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
  v_types text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_types := CASE p_kind
    WHEN 'ligacao'   THEN ARRAY['ligacao']
    WHEN 'visita'    THEN ARRAY['visita','prospection','technical_visit']
    WHEN 'checklist' THEN ARRAY['checklist']
    ELSE NULL END;
  IF v_types IS NULL THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  -- Filial Ativa / autorização (42501 se não autorizada). '{}' = global sem filtro.
  -- effective_filial_ids valida p_filial_id contra filial principal + adicionais.
  v_scope := public.effective_filial_ids(p_filial_id);
  -- [AJUSTE 1] Não-globais: exatamente UMA Filial Ativa; nunca combinar filiais.
  IF NOT (v_is_admin OR v_is_manager) AND COALESCE(cardinality(v_scope), 0) <> 1 THEN
    RAISE EXCEPTION 'Acesso negado: selecione uma Filial Ativa autorizada' USING ERRCODE = '42501';
  END IF;
  v_can_park := public.can_view_equipment_park();

  RETURN QUERY
  WITH primary_role AS (
    SELECT ur.user_id, (ARRAY_AGG(ur.role::text ORDER BY
      CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
        WHEN 'rac' THEN 4 WHEN 'cpa' THEN 4 WHEN 'csa' THEN 4 ELSE 5 END))[1] AS role
    FROM user_roles ur GROUP BY ur.user_id
  ),
  base AS (
    SELECT t.id, t.task_type, t.start_date, t.start_time, t.status,
           t.created_by, pp.filial_id, t.filial_atendida, pp.name AS pname,
           t.client, t.clientcode, t.property, t.propertyhectares,
           t.contact_name, t.contact_function, t.phone, t.email, t.observations,
           t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed, t.is_prospect,
           t.next_action, t.next_action_date, t.equipment_quantity,
           t.equipment_list, t.checklist_machine, t.technical_visit_data
    FROM tasks t
    JOIN profiles pp ON pp.user_id = t.created_by
    LEFT JOIN primary_role pr ON pr.user_id = public.resolve_primary_user_id(t.created_by)
    WHERE t.task_type = ANY(v_types)
      AND (p_after_id IS NULL OR t.id > p_after_id)
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (cardinality(v_scope) = 0 OR pp.filial_id = ANY(v_scope))
      AND (p_filial_atendida IS NULL
           OR LOWER(TRIM(t.filial_atendida)) = LOWER(TRIM(p_filial_atendida)))
      AND (v_seller IS NULL OR public.resolve_primary_user_id(t.created_by) = v_seller)
      AND (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
      AND public.client_filter_match(p_client_code, p_client_name, t.clientcode, t.client)
      AND (
        v_is_admin OR v_is_manager
        OR v_is_supervisor
        OR t.created_by = v_user_id
      )
    ORDER BY t.id
    LIMIT v_limit
  )
  SELECT
    b.id, b.task_type, b.start_date, b.start_time::text, b.status,
    f.nome, b.filial_atendida, public.resolve_primary_user_id(b.created_by), sp.name,
    COALESCE(pr.role, 'consultant'),
    b.client, b.clientcode, b.property, b.propertyhectares::numeric,
    b.contact_name, b.contact_function, b.phone, b.email, b.observations,
    b.sales_type, b.sales_value::numeric, b.partial_sales_value::numeric, b.sales_confirmed, b.is_prospect,
    b.next_action, b.next_action_date::date, b.equipment_quantity::integer,
    o.status, o.valor_total_oportunidade::numeric, o.valor_venda_fechada::numeric,
    fu.followup_status::text, fu.next_return_date::date, fu.client_temperature::text, fu.return_notes,
    CASE WHEN jsonb_typeof(b.equipment_list) = 'array' THEN b.equipment_list ELSE '[]'::jsonb END,
    CASE WHEN jsonb_typeof(b.checklist_machine) = 'object' THEN b.checklist_machine ELSE NULL END,
    CASE WHEN jsonb_typeof(b.technical_visit_data) = 'object' THEN jsonb_build_object(
      'service_type', b.technical_visit_data->'service_type',
      'total_estimate', b.technical_visit_data->'total_estimate',
      'equipments', COALESCE(b.technical_visit_data->'equipments', '[]'::jsonb)) ELSE NULL END,
    CASE WHEN NOT v_can_park THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'equipment_id', ce.id, 'machine_type', ce.machine_type, 'model', ce.model,
        'serial_chassis', ce.serial_chassis, 'year', ce.year, 'hours', ce.hours,
        'puk_status', ce.puk_status, 'machine_status', ce.machine_status,
        'last_validation_at', ce.last_validation_at, 'filial', cf.nome) ORDER BY ce.id)
      FROM task_equipment te
      JOIN client_equipment ce ON ce.id = te.equipment_id
      LEFT JOIN filiais cf ON cf.id = ce.filial_id
      WHERE te.task_id = b.id
        -- [AJUSTE 2] Permissão por máquina (SECURITY DEFINER não herda RLS):
        AND (
          (v_is_admin OR v_is_manager)
            AND (cardinality(v_scope) = 0 OR ce.filial_id = ANY(v_scope))
          OR (NOT (v_is_admin OR v_is_manager)
            AND ce.filial_id IS NOT NULL
            AND ce.filial_id = ANY(v_scope))
        )
    ), '[]'::jsonb) END
  FROM base b
  LEFT JOIN filiais f ON f.id = b.filial_id
  LEFT JOIN profiles sp ON sp.user_id = public.resolve_primary_user_id(b.created_by)
  LEFT JOIN primary_role pr ON pr.user_id = public.resolve_primary_user_id(b.created_by)
  LEFT JOIN LATERAL (
    SELECT op.status, op.valor_total_oportunidade, op.valor_venda_fechada
    FROM opportunities op WHERE op.task_id = b.id
    ORDER BY op.created_at DESC LIMIT 1
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT tf.followup_status, tf.next_return_date, tf.client_temperature, tf.return_notes
    FROM task_followups tf WHERE tf.task_id = b.id
    ORDER BY tf.updated_at DESC LIMIT 1
  ) fu ON true
  ORDER BY b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_management_activity_export(text,date,date,uuid,text,uuid,text,text,text,text[],uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_management_activity_export(text,date,date,uuid,text,uuid,text,text,text,text[],uuid,integer) TO authenticated, service_role;

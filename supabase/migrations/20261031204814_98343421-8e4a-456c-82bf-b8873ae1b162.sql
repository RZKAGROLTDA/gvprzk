CREATE OR REPLACE FUNCTION public.get_service_opportunities_details(
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_filial_id uuid DEFAULT NULL::uuid,
  p_seller_role text DEFAULT NULL::text,
  p_seller_id uuid DEFAULT NULL::uuid,
  p_service_type text DEFAULT NULL::text,
  p_severity text DEFAULT NULL::text,
  p_machine_type text DEFAULT NULL::text,
  p_client text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_jd_status text DEFAULT NULL::text
)
RETURNS TABLE(
  task_id uuid, checklist_date date, filial_nome text, seller_id uuid,
  seller_name text, seller_role text, client_name text, client_code text,
  machine_type text, machine_model text, machine_serial text,
  machine_year text, machine_hours text, service_type text, item_name text,
  severity text, response_status text, observation text, total_count bigint,
  jd_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_scope uuid[];
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  v_scope := public.effective_filial_ids(p_filial_id);
  IF NOT (v_is_admin OR v_is_manager) AND COALESCE(cardinality(v_scope), 0) <> 1 THEN
    RAISE EXCEPTION 'Acesso negado: selecione uma Filial Ativa autorizada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH primary_role AS (
    SELECT ur.user_id,
      (ARRAY_AGG(ur.role::text ORDER BY
        CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
          WHEN 'rac' THEN 4 WHEN 'cpa' THEN 4 WHEN 'csa' THEN 4 ELSE 5 END))[1] AS role
    FROM user_roles ur
    GROUP BY ur.user_id
  ),
  rows_data AS (
    SELECT
      t.id AS task_id,
      t.start_date AS checklist_date,
      COALESCE(f.nome, NULLIF(TRIM(t.filial), ''), 'Sem filial') AS filial_nome,
      t.created_by AS seller_id,
      COALESCE(NULLIF(TRIM(pf.name), ''), NULLIF(TRIM(t.responsible), ''), 'Não informado') AS seller_name,
      COALESCE(pr.role, 'consultant') AS seller_role,
      t.client AS client_name,
      COALESCE(t.clientcode, '') AS client_code,
      COALESCE(t.checklist_machine->>'tipo', '') AS machine_type,
      COALESCE(t.checklist_machine->>'modelo', '') AS machine_model,
      COALESCE(t.checklist_machine->>'chassi_serie', '') AS machine_serial,
      COALESCE(t.checklist_machine->>'ano', '') AS machine_year,
      COALESCE(t.checklist_machine->>'horimetro', '') AS machine_hours,
      map_checklist_item_to_service(p.name) AS service_type,
      p.name AS item_name,
      CASE p.response_status WHEN 'nao_conforme' THEN 'alta' ELSE 'media' END AS severity,
      p.response_status,
      COALESCE(p.response_notes, '') AS observation,
      public.jd_audit_status_of(t.id) AS jd_status
    FROM tasks t
    JOIN products p ON p.task_id = t.id
    LEFT JOIN profiles pf ON pf.user_id = t.created_by
    LEFT JOIN filiais f ON LOWER(TRIM(f.nome)) = LOWER(TRIM(t.filial))
    LEFT JOIN primary_role pr ON pr.user_id = t.created_by
    WHERE t.task_type = 'checklist'
      AND p.response_status IN ('atencao','nao_conforme')
      AND map_checklist_item_to_service(p.name) IS NOT NULL
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (cardinality(v_scope) = 0 OR f.id = ANY(v_scope))
      AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
      AND (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
      AND (p_machine_type IS NULL OR LOWER(TRIM(COALESCE(t.checklist_machine->>'tipo',''))) = LOWER(TRIM(p_machine_type)))
      AND (p_client IS NULL OR t.client ILIKE '%' || p_client || '%' OR COALESCE(t.clientcode,'') ILIKE '%' || p_client || '%')
      AND (p_service_type IS NULL OR map_checklist_item_to_service(p.name) = p_service_type)
      AND (p_severity IS NULL OR (CASE p.response_status WHEN 'nao_conforme' THEN 'alta' ELSE 'media' END) = LOWER(TRIM(p_severity)))
      AND (
        v_is_admin OR v_is_manager
        OR v_is_supervisor
        OR t.created_by = v_user_id
      )
  ),
  filtered AS (
    SELECT rd.* FROM rows_data rd
    WHERE p_jd_status IS NULL OR rd.jd_status = LOWER(TRIM(p_jd_status))
  )
  SELECT r.task_id, r.checklist_date, r.filial_nome, r.seller_id, r.seller_name, r.seller_role,
    r.client_name, r.client_code, r.machine_type, r.machine_model, r.machine_serial,
    r.machine_year, r.machine_hours, r.service_type, r.item_name, r.severity,
    r.response_status, r.observation,
    COUNT(*) OVER() AS total_count,
    r.jd_status
  FROM filtered r
  ORDER BY r.checklist_date DESC, r.client_name, r.item_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_service_opportunities_details(date, date, uuid, text, uuid, text, text, text, text, integer, integer, text) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.map_checklist_item_to_service(p_item text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE LOWER(TRIM(COALESCE(p_item, '')))
    WHEN 'verificação de pneus' THEN 'Pneus'
    WHEN 'verificação de líquidos' THEN 'Fluidos / Arrefecimento'
    WHEN 'verificação de luzes' THEN 'Sistema Elétrico'
    WHEN 'verificação de óleo do motor' THEN 'Lubrificação / Motor'
    WHEN 'nível de óleo da transmissão' THEN 'Transmissão'
    WHEN 'teste de bateria' THEN 'Baterias'
    WHEN 'inspeção de suspensão' THEN 'Suspensão'
    WHEN 'limpeza geral' THEN NULL
    WHEN '' THEN NULL
    ELSE 'Outros Serviços'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_service_opportunities_summary(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_service_type text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_machine_type text DEFAULT NULL,
  p_client text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

  WITH primary_role AS (
    SELECT ur.user_id,
      (ARRAY_AGG(ur.role::text ORDER BY
        CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
          WHEN 'rac' THEN 4 WHEN 'cpa' THEN 4 WHEN 'csa' THEN 4 ELSE 5 END))[1] AS role
    FROM user_roles ur
    GROUP BY ur.user_id
  ),
  chk AS (
    SELECT
      t.id AS task_id,
      t.start_date,
      COALESCE(f.nome, NULLIF(TRIM(t.filial), ''), 'Sem filial') AS filial_nome,
      pp.filial_id,
      t.created_by,
      COALESCE(NULLIF(TRIM(pf.name), ''), NULLIF(TRIM(t.responsible), ''), 'Não informado') AS seller_name,
      COALESCE(pr.role, 'consultant') AS seller_role,
      LOWER(TRIM(COALESCE(NULLIF(TRIM(t.clientcode), ''), t.client, ''))) AS client_key,
      UPPER(COALESCE(
        NULLIF(TRIM(t.checklist_machine->>'chassi_serie'), ''),
        NULLIF(TRIM(t.checklist_machine->>'modelo'), '') || '|' || LOWER(TRIM(COALESCE(NULLIF(TRIM(t.clientcode), ''), t.client, ''))),
        'task:' || t.id::text
      )) AS machine_key
    FROM tasks t
    LEFT JOIN profiles pp ON pp.user_id = t.created_by
    LEFT JOIN profiles pf ON pf.user_id = t.created_by
    LEFT JOIN filiais f ON f.id = pp.filial_id
    LEFT JOIN primary_role pr ON pr.user_id = t.created_by
    WHERE t.task_type = 'checklist'
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
      AND (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
      AND (p_machine_type IS NULL OR LOWER(TRIM(COALESCE(t.checklist_machine->>'tipo',''))) = LOWER(TRIM(p_machine_type)))
      AND (p_client IS NULL OR t.client ILIKE '%' || p_client || '%' OR COALESCE(t.clientcode,'') ILIKE '%' || p_client || '%')
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial)
        OR t.created_by = v_user_id
      )
  ),
  items AS (
    SELECT c.*, p.name AS item_name, p.response_status
    FROM chk c
    JOIN products p ON p.task_id = c.task_id
  ),
  opp AS (
    SELECT i.*, map_checklist_item_to_service(i.item_name) AS service_type,
      CASE i.response_status WHEN 'nao_conforme' THEN 'alta' ELSE 'media' END AS severity
    FROM items i
    WHERE i.response_status IN ('atencao','nao_conforme')
      AND map_checklist_item_to_service(i.item_name) IS NOT NULL
  ),
  opp_f AS (
    SELECT * FROM opp
    WHERE (p_service_type IS NULL OR service_type = p_service_type)
      AND (p_severity IS NULL OR severity = LOWER(TRIM(p_severity)))
  ),
  kpis AS (
    SELECT
      (SELECT COUNT(*) FROM opp_f) AS oportunidades,
      (SELECT COUNT(DISTINCT client_key) FROM opp_f) AS clientes,
      (SELECT COUNT(DISTINCT machine_key) FROM opp_f) AS maquinas,
      (SELECT COUNT(DISTINCT task_id) FROM opp_f) AS checklists_com_opp,
      (SELECT COUNT(*) FROM chk) AS checklists_periodo,
      (SELECT COUNT(*) FROM items WHERE response_status IS NULL) AS itens_nao_avaliados
  ),
  by_service AS (
    SELECT service_type,
      COUNT(*) AS oportunidades,
      COUNT(*) FILTER (WHERE severity = 'alta') AS alta,
      COUNT(*) FILTER (WHERE severity = 'media') AS media,
      COUNT(DISTINCT client_key) AS clientes,
      COUNT(DISTINCT machine_key) AS maquinas,
      COUNT(DISTINCT task_id) AS checklists
    FROM opp_f GROUP BY service_type
  ),
  by_filial AS (
    SELECT filial_nome,
      COUNT(*) AS oportunidades,
      COUNT(*) FILTER (WHERE severity = 'alta') AS alta,
      COUNT(*) FILTER (WHERE severity = 'media') AS media,
      COUNT(DISTINCT client_key) AS clientes,
      COUNT(DISTINCT task_id) AS checklists
    FROM opp_f GROUP BY filial_nome
  ),
  by_seller AS (
    SELECT created_by AS seller_id, seller_name, seller_role, filial_nome,
      COUNT(*) AS oportunidades,
      COUNT(*) FILTER (WHERE severity = 'alta') AS alta,
      COUNT(*) FILTER (WHERE severity = 'media') AS media,
      COUNT(DISTINCT client_key) AS clientes,
      COUNT(DISTINCT task_id) AS checklists
    FROM opp_f GROUP BY created_by, seller_name, seller_role, filial_nome
  ),
  by_month AS (
    SELECT to_char(start_date, 'YYYY-MM') AS mes,
      COUNT(*) AS oportunidades,
      COUNT(*) FILTER (WHERE severity = 'alta') AS alta,
      COUNT(*) FILTER (WHERE severity = 'media') AS media,
      COUNT(DISTINCT task_id) AS checklists
    FROM opp_f GROUP BY 1
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
        'oportunidades', k.oportunidades,
        'clientes', k.clientes,
        'maquinas', k.maquinas,
        'checklists_com_oportunidade', k.checklists_com_opp,
        'checklists_periodo', k.checklists_periodo,
        'taxa_oportunidade', CASE WHEN k.checklists_periodo > 0
          THEN ROUND(k.checklists_com_opp::numeric / k.checklists_periodo * 100, 1) ELSE 0 END,
        'itens_nao_avaliados', k.itens_nao_avaliados
      ) FROM kpis k),
    'by_service', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.oportunidades DESC, s.service_type) FROM by_service s), '[]'::jsonb),
    'by_filial', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oportunidades DESC, x.filial_nome) FROM by_filial x), '[]'::jsonb),
    'by_seller', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oportunidades DESC, x.seller_name) FROM by_seller x), '[]'::jsonb),
    'by_month', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.mes) FROM by_month x), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_service_opportunities_details(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_service_type text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_machine_type text DEFAULT NULL,
  p_client text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  task_id uuid,
  checklist_date date,
  filial_nome text,
  seller_id uuid,
  seller_name text,
  seller_role text,
  client_name text,
  client_code text,
  machine_type text,
  machine_model text,
  machine_serial text,
  machine_year text,
  machine_hours text,
  service_type text,
  item_name text,
  severity text,
  response_status text,
  observation text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

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
      COALESCE(p.response_notes, '') AS observation
    FROM tasks t
    JOIN products p ON p.task_id = t.id
    LEFT JOIN profiles pp ON pp.user_id = t.created_by
    LEFT JOIN profiles pf ON pf.user_id = t.created_by
    LEFT JOIN filiais f ON f.id = pp.filial_id
    LEFT JOIN primary_role pr ON pr.user_id = t.created_by
    WHERE t.task_type = 'checklist'
      AND p.response_status IN ('atencao','nao_conforme')
      AND map_checklist_item_to_service(p.name) IS NOT NULL
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
      AND (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
      AND (p_machine_type IS NULL OR LOWER(TRIM(COALESCE(t.checklist_machine->>'tipo',''))) = LOWER(TRIM(p_machine_type)))
      AND (p_client IS NULL OR t.client ILIKE '%' || p_client || '%' OR COALESCE(t.clientcode,'') ILIKE '%' || p_client || '%')
      AND (p_service_type IS NULL OR map_checklist_item_to_service(p.name) = p_service_type)
      AND (p_severity IS NULL OR (CASE p.response_status WHEN 'nao_conforme' THEN 'alta' ELSE 'media' END) = LOWER(TRIM(p_severity)))
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial)
        OR t.created_by = v_user_id
      )
  )
  SELECT r.task_id, r.checklist_date, r.filial_nome, r.seller_id, r.seller_name, r.seller_role,
    r.client_name, r.client_code, r.machine_type, r.machine_model, r.machine_serial,
    r.machine_year, r.machine_hours, r.service_type, r.item_name, r.severity,
    r.response_status, r.observation,
    COUNT(*) OVER() AS total_count
  FROM rows_data r
  ORDER BY r.checklist_date DESC, r.client_name, r.item_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.map_checklist_item_to_service(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_service_opportunities_summary(date, date, uuid, text, uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_service_opportunities_details(date, date, uuid, text, uuid, text, text, text, text, integer, integer) TO authenticated, service_role;
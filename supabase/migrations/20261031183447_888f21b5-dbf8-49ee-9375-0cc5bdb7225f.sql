CREATE TABLE public.jd_chassis_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  imported_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'processando',
  total_linhas integer NOT NULL DEFAULT 0,
  novos integer NOT NULL DEFAULT 0,
  duplicados integer NOT NULL DEFAULT 0,
  invalidos integer NOT NULL DEFAULT 0,
  processadas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluded_at timestamptz
);
GRANT SELECT ON public.jd_chassis_import_batches TO authenticated;
GRANT ALL ON public.jd_chassis_import_batches TO service_role;
ALTER TABLE public.jd_chassis_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY jd_batches_admin_select ON public.jd_chassis_import_batches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.jd_chassis_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassi_normalizado text NOT NULL UNIQUE,
  chassi_original text NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.jd_chassis_import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jd_chassis_base TO authenticated;
GRANT ALL ON public.jd_chassis_base TO service_role;
ALTER TABLE public.jd_chassis_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY jd_base_admin_select ON public.jd_chassis_base
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.normalize_chassis(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.jd_import_start(p_filename text, p_total_linhas integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores podem importar a base JD' USING ERRCODE = '42501';
  END IF;
  INSERT INTO jd_chassis_import_batches (filename, imported_by, total_linhas)
  VALUES (coalesce(nullif(trim(p_filename), ''), 'arquivo'), auth.uid(), greatest(coalesce(p_total_linhas, 0), 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.jd_import_append(p_batch_id uuid, p_chassis text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_total integer;
  v_invalid integer;
  v_inserted integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores podem importar a base JD' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM jd_chassis_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lote de importação não encontrado';
  END IF;
  IF v_status <> 'processando' THEN
    RAISE EXCEPTION 'Lote já finalizado; inicie uma nova importação';
  END IF;

  WITH rows_in AS (
    SELECT c AS original, public.normalize_chassis(c) AS n
    FROM unnest(coalesce(p_chassis, ARRAY[]::text[])) AS c
  ),
  firsts AS (
    SELECT n, min(original) AS original
    FROM rows_in
    WHERE n ~ '^[A-Z0-9]{5,30}$'
    GROUP BY n
  ),
  ins AS (
    INSERT INTO jd_chassis_base (chassi_normalizado, chassi_original, batch_id)
    SELECT n, original, p_batch_id FROM firsts
    ON CONFLICT (chassi_normalizado) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM rows_in),
    (SELECT count(*) FROM rows_in WHERE NOT (n ~ '^[A-Z0-9]{5,30}$')),
    (SELECT count(*) FROM ins)
  INTO v_total, v_invalid, v_inserted;

  UPDATE jd_chassis_import_batches
  SET novos = novos + v_inserted,
      duplicados = duplicados + (v_total - v_invalid - v_inserted),
      invalidos = invalidos + v_invalid,
      processadas = processadas + v_total
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'recebidas', v_total,
    'novos', v_inserted,
    'duplicados', v_total - v_invalid - v_inserted,
    'invalidos', v_invalid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.jd_import_conclude(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row jd_chassis_import_batches%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores podem importar a base JD' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM jd_chassis_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'processando' THEN
    RAISE EXCEPTION 'Lote não encontrado ou já finalizado';
  END IF;
  IF v_row.processadas <> v_row.total_linhas
     OR v_row.novos + v_row.duplicados + v_row.invalidos <> v_row.total_linhas THEN
    RAISE EXCEPTION 'Importação incompleta: % de % linhas processadas; o lote permanece em processamento',
      v_row.processadas, v_row.total_linhas USING ERRCODE = 'P0001';
  END IF;
  UPDATE jd_chassis_import_batches
  SET status = 'concluido', concluded_at = now()
  WHERE id = p_batch_id
  RETURNING * INTO v_row;
  RETURN jsonb_build_object(
    'novos', v_row.novos,
    'duplicados', v_row.duplicados,
    'invalidos', v_row.invalidos,
    'total_linhas', v_row.total_linhas,
    'processadas', v_row.processadas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.jd_import_start(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jd_import_append(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jd_import_conclude(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jd_import_start(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jd_import_append(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jd_import_conclude(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.jd_classify_checklists(p_task_ids uuid[])
RETURNS TABLE(task_id uuid, jd_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_task_ids, 1), 0) > 1000 THEN
    RAISE EXCEPTION 'Máximo de 1000 atividades por chamada' USING ERRCODE = '22023';
  END IF;
  v_is_admin := public.has_role(v_uid, 'admin'::app_role);

  RETURN QUERY
  SELECT t.id,
    CASE
      WHEN public.normalize_chassis(t.checklist_machine->>'chassi_serie') = '' THEN 'sem_chassi'
      WHEN EXISTS (
        SELECT 1 FROM jd_chassis_base b
        WHERE b.chassi_normalizado = public.normalize_chassis(t.checklist_machine->>'chassi_serie')
      ) THEN 'enviado'
      ELSE 'disponivel'
    END
  FROM tasks t
  WHERE t.id = ANY(coalesce(p_task_ids, ARRAY[]::uuid[]))
    AND t.task_type = 'checklist'
    AND (v_is_admin OR public.can_access_task_related_data(t.id));
END;
$$;

REVOKE ALL ON FUNCTION public.jd_classify_checklists(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jd_classify_checklists(uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.get_service_opportunities_details(date, date, uuid, text, uuid, text, text, text, text, integer, integer);

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
      COALESCE(p.response_notes, '') AS observation,
      CASE
        WHEN NULLIF(TRIM(COALESCE(t.checklist_machine->>'chassi_serie', '')), '') IS NULL THEN 'sem_chassi'
        WHEN EXISTS (
          SELECT 1 FROM jd_chassis_base jb
          WHERE jb.chassi_normalizado = public.normalize_chassis(t.checklist_machine->>'chassi_serie')
        ) THEN 'enviado'
        ELSE 'disponivel'
      END AS jd_status
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
  ),
  filtered AS (
    SELECT * FROM rows_data
    WHERE p_jd_status IS NULL OR rows_data.jd_status = LOWER(TRIM(p_jd_status))
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
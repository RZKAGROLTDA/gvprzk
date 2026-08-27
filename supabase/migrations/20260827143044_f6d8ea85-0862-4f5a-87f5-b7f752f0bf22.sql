CREATE OR REPLACE FUNCTION public.pops_scope()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_enabled boolean; v_filial uuid; v_scope text := 'none';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('scope','none','filial_id',NULL,'user_id',NULL); END IF;

  SELECT (p.approval_status='approved' AND p.employment_status='active'), p.filial_id
    INTO v_enabled, v_filial FROM public.profiles p WHERE p.user_id = v_uid;

  IF COALESCE(v_enabled,false) = false THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,'user_id',v_uid);
  END IF;

  IF public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') THEN v_scope := 'global';
  ELSIF public.has_role(v_uid,'supervisor')
     OR public.has_role(v_uid,'rac')
     OR public.has_role(v_uid,'cpa')
     OR public.has_role(v_uid,'csa') THEN v_scope := 'filial';
  END IF;

  RETURN jsonb_build_object('scope', v_scope, 'filial_id', v_filial, 'user_id', v_uid);
END $$;

CREATE OR REPLACE FUNCTION public.pops_confirm_import_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_program_id uuid;
  v_total      integer;
  v_bloqueadas integer;
  v_inseridas  integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT b.program_id INTO v_program_id
    FROM public.pops_import_batches b WHERE b.id = p_batch_id;
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Lote inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total FROM public.pops_import_rows r WHERE r.batch_id = p_batch_id;

  SELECT count(*) INTO v_bloqueadas
    FROM public.pops_import_rows r
   WHERE r.batch_id = p_batch_id
     AND public.pops_norm_serial(r.serial_number) IS NULL
     AND r.matched_equipment_id IS NULL;

  WITH src AS (
    SELECT r.*, public.pops_norm_serial(r.serial_number) AS serial_norm_calc
      FROM public.pops_import_rows r
     WHERE r.batch_id = p_batch_id
       AND (public.pops_norm_serial(r.serial_number) IS NOT NULL OR r.matched_equipment_id IS NOT NULL)
  ),
  dedup AS (
    SELECT DISTINCT ON (coalesce(serial_norm_calc, matched_equipment_id::text)) *
      FROM src
     ORDER BY coalesce(serial_norm_calc, matched_equipment_id::text), row_number
  ),
  novas AS (
    SELECT d.* FROM dedup d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.pops_machines m
        WHERE m.program_id = v_program_id
          AND ( (d.serial_norm_calc IS NOT NULL AND m.pops_serial_norm = d.serial_norm_calc)
             OR (d.matched_equipment_id IS NOT NULL AND m.equipment_id = d.matched_equipment_id) )
     )
  ),
  ins AS (
    INSERT INTO public.pops_machines (
      program_id, equipment_id, import_row_id, import_batch_id,
      pops_serial, pops_client_code, pops_client_name, pops_model,
      pops_product_series, pops_manufacture_year, pops_platform, pops_dealer_location,
      source, status, active, created_by
    )
    SELECT v_program_id, n.matched_equipment_id, n.id, p_batch_id,
           n.serial_number, n.pops_client_code, n.client_name, n.model,
           n.product_series, n.manufacture_year, n.platform, n.dealer_location,
           'import', 'foco'::pops_machine_status, true, v_uid
      FROM novas n
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridas FROM ins;

  UPDATE public.pops_import_batches
     SET status = 'confirmado'::pops_import_status,
         confirmed_by = v_uid,
         confirmed_at = now(),
         total_rows = v_total
   WHERE id = p_batch_id;

  RETURN (
    SELECT jsonb_build_object(
      'total_linhas',        v_total,
      'bloqueadas',          v_bloqueadas,
      'inseridas',           v_inseridas,
      'ja_existentes',       v_total - v_bloqueadas - v_inseridas,
      'total_no_programa',   count(*),
      'com_vinculo_parque',  count(*) FILTER (WHERE m.equipment_id IS NOT NULL),
      'sem_vinculo_parque',  count(*) FILTER (WHERE m.equipment_id IS NULL),
      'filial_pendente',     count(*) FILTER (WHERE m.pops_filial_pendente)
    )
    FROM public.pops_machines m
   WHERE m.program_id = v_program_id AND m.active
  );
END $$;

DROP FUNCTION IF EXISTS public.pops_portfolio_clients(uuid, uuid, uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.pops_portfolio_clients(uuid, uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.pops_portfolio_clients(
  p_program_id uuid,
  p_filial_id  uuid DEFAULT NULL,
  p_search     text DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid  := (v_scope ->> 'filial_id')::uuid;
  v_eff    uuid;
  v_search text  := nullif(btrim(coalesce(p_search,'')),'');
  v_limit  integer;
  v_total  integer;
  v_rows   jsonb;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit,50),1),200);
  v_eff := CASE WHEN v_kind = 'global' THEN p_filial_id ELSE v_filial END;
  IF v_kind <> 'global' AND v_eff IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  END IF;

  SELECT count(*) INTO v_total FROM (
    SELECT m.client_key
      FROM public.pops_machines m
     WHERE m.program_id = p_program_id AND m.active
       AND (v_eff IS NULL OR m.pops_filial_id = v_eff)
       AND (v_search IS NULL OR m.pops_client_name_norm LIKE '%'||public.pops_norm_place(v_search)||'%')
     GROUP BY m.client_key
  ) c;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pops_client_name), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT a.* FROM (
        SELECT m.client_key,
               min(m.pops_client_name)     AS pops_client_name,
               min(m.pops_dealer_location) AS pops_dealer_location,
               min(m.pops_filial_id)       AS pops_filial_id,
               min(f.nome)                 AS filial_nome,
               count(*)                                                            AS total_maquinas,
               count(*) FILTER (WHERE m.status NOT IN ('servicada','em_andamento')) AS pendentes,
               count(*) FILTER (WHERE m.status = 'em_andamento')                    AS em_andamento,
               count(*) FILTER (WHERE m.status = 'servicada')                       AS servicadas
          FROM public.pops_machines m
          LEFT JOIN public.filiais f ON f.id = m.pops_filial_id
         WHERE m.program_id = p_program_id AND m.active
           AND (v_eff IS NULL OR m.pops_filial_id = v_eff)
           AND (v_search IS NULL OR m.pops_client_name_norm LIKE '%'||public.pops_norm_place(v_search)||'%')
         GROUP BY m.client_key
      ) a
      ORDER BY a.pops_client_name
      LIMIT v_limit OFFSET greatest(coalesce(p_offset,0),0)
    ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;

DROP FUNCTION IF EXISTS public.pops_portfolio_client_machines(uuid, text);
DROP FUNCTION IF EXISTS public.pops_portfolio_client_machines(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.pops_portfolio_client_machines(
  p_program_id uuid,
  p_client_key text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid  := (v_scope ->> 'filial_id')::uuid;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pops_serial), '[]'::jsonb)
      FROM (
        SELECT m.id AS pops_machine_id, m.status, m.pops_serial, m.pops_model,
               m.pops_product_series, m.pops_manufacture_year, m.pops_platform,
               m.pops_client_name, m.pops_client_code, m.pops_dealer_location,
               m.pops_filial_id, f.nome AS filial_nome,
               m.link_status, m.equipment_id,
               e.serial_chassis AS parque_serial_chassis,
               e.model          AS parque_model,
               e.client_name    AS parque_client_name,
               e.client_code    AS parque_client_code,
               e.year           AS parque_year,
               e.hours          AS parque_hours,
               e.machine_type   AS parque_machine_type
          FROM public.pops_machines m
          LEFT JOIN public.filiais f ON f.id = m.pops_filial_id
          LEFT JOIN public.client_equipment e ON e.id = m.equipment_id
         WHERE m.program_id = p_program_id
           AND m.active
           AND m.client_key = p_client_key
           AND (v_kind = 'global' OR m.pops_filial_id = v_filial)
      ) t
  );
END $$;
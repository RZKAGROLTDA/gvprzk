CREATE OR REPLACE FUNCTION public.pops_goal_summary(p_program_id uuid, p_filial_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid;
  v_tz     text := 'America/Sao_Paulo';
  v_d0     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_wk     date;
  v_mo     date;
  v_goal   int;
  v_universe int; v_serviced int; v_pending int;
  v_today int; v_week int; v_month int;
  v_lt int; v_ls int; v_st int; v_ss int;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;

  v_filial := CASE WHEN v_kind = 'global' THEN p_filial_id ELSE (v_scope ->> 'filial_id')::uuid END;
  v_wk := v_d0 - (extract(isodow from v_d0)::int - 1);
  v_mo := date_trunc('month', v_d0)::date;

  SELECT pr.goal_machines INTO v_goal FROM public.pops_programs pr WHERE pr.id = p_program_id;
  IF v_goal IS NULL THEN RAISE EXCEPTION 'Programa POPS nao encontrado'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE m.status = 'servicada')::int,
         count(*) FILTER (WHERE m.status <> 'servicada')::int,
         count(*) FILTER (WHERE m.status = 'servicada'
                            AND (m.executed_at AT TIME ZONE v_tz)::date = v_d0)::int,
         count(*) FILTER (WHERE m.status = 'servicada'
                            AND (m.executed_at AT TIME ZONE v_tz)::date >= v_wk)::int,
         count(*) FILTER (WHERE m.status = 'servicada'
                            AND (m.executed_at AT TIME ZONE v_tz)::date >= v_mo)::int,
         count(*) FILTER (WHERE upper(btrim(coalesce(m.pops_platform,''))) = 'LARGE')::int,
         count(*) FILTER (WHERE upper(btrim(coalesce(m.pops_platform,''))) = 'LARGE'
                            AND m.status = 'servicada')::int,
         count(*) FILTER (WHERE upper(btrim(coalesce(m.pops_platform,''))) = 'SMALL')::int,
         count(*) FILTER (WHERE upper(btrim(coalesce(m.pops_platform,''))) = 'SMALL'
                            AND m.status = 'servicada')::int
    INTO v_universe, v_serviced, v_pending, v_today, v_week, v_month,
         v_lt, v_ls, v_st, v_ss
    FROM public.pops_machines m
   WHERE m.program_id = p_program_id
     AND m.active
     AND (v_filial IS NULL OR m.pops_filial_id = v_filial);

  RETURN jsonb_build_object(
    'program_id', p_program_id,
    'scope', v_kind,
    'filial_id', v_filial,
    'goal', v_goal,
    'total_universe', v_universe,
    'serviced', v_serviced,
    'remaining', greatest(v_goal - v_serviced, 0),
    'attainment_percent', round((v_serviced::numeric / nullif(v_goal,0)) * 100, 1),
    'completion_percent', round((v_serviced::numeric / nullif(v_universe,0)) * 100, 1),
    'today', v_today,
    'this_week', v_week,
    'this_month', v_month,
    'pending', v_pending,
    'large_total', v_lt,
    'large_serviced', v_ls,
    'large_pending', greatest(v_lt - v_ls, 0),
    'large_percent', round((v_ls::numeric / nullif(v_lt,0)) * 100, 1),
    'small_total', v_st,
    'small_serviced', v_ss,
    'small_pending', greatest(v_st - v_ss, 0),
    'small_percent', round((v_ss::numeric / nullif(v_st,0)) * 100, 1)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.pops_portfolio_clients(
  p_program_id uuid,
  p_filial_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_serial text DEFAULT NULL::text,
  p_model text DEFAULT NULL::text,
  p_platform text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid  := (v_scope ->> 'filial_id')::uuid;
  v_eff    uuid;
  v_terms  text[];
  v_serial text;
  v_model  text;
  v_plat   text  := nullif(btrim(coalesce(p_platform,'')),'');
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

  -- termos do nome: normaliza, quebra em palavras e "esmaga" cada termo
  SELECT array_agg(t) INTO v_terms
    FROM (
      SELECT regexp_replace(w, '[^A-Z0-9]', '', 'g') AS t
        FROM regexp_split_to_table(coalesce(public.pops_norm_place(p_search),''), '\s+') AS w
    ) s
   WHERE t <> '';

  v_serial := nullif(regexp_replace(upper(coalesce(p_serial,'')), '[^A-Z0-9]', '', 'g'), '');
  v_model  := nullif(regexp_replace(upper(coalesce(public.pops_norm_place(p_model),'')), '[^A-Z0-9]', '', 'g'), '');

  SELECT count(*) INTO v_total FROM (
    SELECT m.client_key
      FROM public.pops_machines m
     WHERE m.program_id = p_program_id AND m.active
       AND (v_eff IS NULL OR m.pops_filial_id = v_eff)
       AND (v_terms IS NULL OR (
             SELECT bool_and(regexp_replace(coalesce(m.pops_client_name_norm,''), '[^A-Z0-9]', '', 'g')
                             LIKE '%'||x||'%')
               FROM unnest(v_terms) AS x))
       AND (v_serial IS NULL OR regexp_replace(coalesce(m.pops_serial_norm, upper(coalesce(m.pops_serial,''))), '[^A-Z0-9]', '', 'g') LIKE '%'||v_serial||'%')
       AND (v_model  IS NULL OR regexp_replace(upper(coalesce(m.pops_model,'')), '[^A-Z0-9]', '', 'g') LIKE '%'||v_model||'%')
       AND (v_plat   IS NULL OR upper(btrim(coalesce(m.pops_platform,''))) = upper(v_plat))
     GROUP BY m.client_key
  ) c;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pops_client_name), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT a.* FROM (
        SELECT m.client_key,
               min(m.pops_client_name)      AS pops_client_name,
               min(m.pops_dealer_location)   AS pops_dealer_location,
               min(m.pops_filial_id::text)::uuid AS pops_filial_id,
               min(f.nome)                  AS filial_nome,
               count(*)                                                            AS total_maquinas,
               count(*) FILTER (WHERE m.status NOT IN ('servicada','em_andamento')) AS pendentes,
               count(*) FILTER (WHERE m.status = 'em_andamento')                    AS em_andamento,
               count(*) FILTER (WHERE m.status = 'servicada')                       AS servicadas
          FROM public.pops_machines m
          LEFT JOIN public.filiais f ON f.id = m.pops_filial_id
         WHERE m.program_id = p_program_id AND m.active
           AND (v_eff IS NULL OR m.pops_filial_id = v_eff)
           AND (v_terms IS NULL OR (
                 SELECT bool_and(regexp_replace(coalesce(m.pops_client_name_norm,''), '[^A-Z0-9]', '', 'g')
                                 LIKE '%'||x||'%')
                   FROM unnest(v_terms) AS x))
           AND (v_serial IS NULL OR regexp_replace(coalesce(m.pops_serial_norm, upper(coalesce(m.pops_serial,''))), '[^A-Z0-9]', '', 'g') LIKE '%'||v_serial||'%')
           AND (v_model  IS NULL OR regexp_replace(upper(coalesce(m.pops_model,'')), '[^A-Z0-9]', '', 'g') LIKE '%'||v_model||'%')
           AND (v_plat   IS NULL OR upper(btrim(coalesce(m.pops_platform,''))) = upper(v_plat))
         GROUP BY m.client_key
      ) a
      ORDER BY a.pops_client_name
      LIMIT v_limit OFFSET greatest(coalesce(p_offset,0),0)
    ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $function$;

CREATE OR REPLACE FUNCTION public.pops_executor_results(
  p_program_id uuid,
  p_filial_id uuid DEFAULT NULL::uuid,
  p_platform text DEFAULT NULL::text,
  p_executed_by uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid;
  v_plat   text  := nullif(btrim(coalesce(p_platform,'')),'');
  v_tz     text  := 'America/Sao_Paulo';
  v_d0     date  := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_wk     date;
  v_mo     date;
  v_total  integer;
  v_rows   jsonb;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_filial := CASE WHEN v_kind = 'global' THEN p_filial_id ELSE (v_scope ->> 'filial_id')::uuid END;
  v_wk := v_d0 - (extract(isodow from v_d0)::int - 1);
  v_mo := date_trunc('month', v_d0)::date;

  WITH base AS (
    SELECT m.executed_by,
           upper(btrim(coalesce(m.pops_platform,''))) AS plat,
           (m.executed_at AT TIME ZONE v_tz)::date AS exec_date
      FROM public.pops_machines m
     WHERE m.program_id = p_program_id
       AND m.active
       AND m.status = 'servicada'
       AND m.executed_by IS NOT NULL
       AND (v_filial IS NULL OR m.pops_filial_id = v_filial)
       AND (v_plat IS NULL OR upper(btrim(coalesce(m.pops_platform,''))) = upper(v_plat))
       AND (p_executed_by IS NULL OR m.executed_by = p_executed_by)
  ), agg AS (
    SELECT b.executed_by,
           count(*)::int AS serviced,
           count(*) FILTER (WHERE b.plat = 'LARGE')::int AS large_serviced,
           count(*) FILTER (WHERE b.plat = 'SMALL')::int AS small_serviced,
           count(*) FILTER (WHERE b.exec_date = v_d0)::int AS today,
           count(*) FILTER (WHERE b.exec_date >= v_wk)::int AS this_week,
           count(*) FILTER (WHERE b.exec_date >= v_mo)::int AS this_month
      FROM base b
     GROUP BY b.executed_by
  )
  SELECT (SELECT coalesce(sum(serviced),0)::int FROM agg),
         coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.serviced DESC, t.executor_name), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (
      SELECT a.executed_by AS user_id,
             coalesce(pr.name, 'Usuário removido') AS executor_name,
             (SELECT ur.role::text FROM public.user_roles ur
               WHERE ur.user_id = a.executed_by
               ORDER BY CASE ur.role::text
                          WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
                          WHEN 'rac' THEN 4 WHEN 'cpa' THEN 5 WHEN 'csa' THEN 6 ELSE 7 END
               LIMIT 1) AS executor_role,
             pr.filial_id,
             f.nome AS filial_nome,
             a.serviced, a.large_serviced, a.small_serviced,
             a.today, a.this_week, a.this_month,
             round((a.serviced::numeric / nullif((SELECT sum(serviced) FROM agg),0)) * 100, 1) AS share_percent
        FROM agg a
        LEFT JOIN public.profiles pr ON pr.user_id = a.executed_by
        LEFT JOIN public.filiais f ON f.id = pr.filial_id
    ) t;

  RETURN jsonb_build_object(
    'scope', v_kind,
    'filial_id', v_filial,
    'total_serviced', coalesce(v_total,0),
    'rows', coalesce(v_rows,'[]'::jsonb)
  );
END $function$;
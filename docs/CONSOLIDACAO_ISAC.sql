-- ============================================================================
-- CONSOLIDAÇÃO DE CONTAS — ISAC MANSO STANKE (PM2064)
-- Execução em UMA ÚNICA TRANSAÇÃO. Qualquer validação falha => ROLLBACK.
-- Nenhum registro histórico é criado, excluído, transferido ou tem user_id alterado.
--
-- MAPA DO SCRIPT
--   [A] Infraestrutura: user_account_links + resolve_primary_user_id()
--   [B] VÍNCULO DO ISAC (alias 513dcb05… -> titular 04884288…, PM2064)  <-- vínculo criado aqui
--   [C] DESATIVAÇÃO DA CONTA ANTIGA (procedimento oficial)              <-- conta antiga desativada aqui
--   [D] CONSOLIDAÇÃO DOS INDICADORES DO RELATÓRIO (somente leitura)     <-- cada indicador consolidado aqui
--       D1 get_performance_by_seller_v2  -> atividades, visitas, ligações, checklists,
--                                           prospecções, clientes únicos, vendas/conversão
--       D2 get_activity_metrics_v2       -> KPIs de atividades/vendas (filtro por responsável)
--       D3 get_my_day_team_summary       -> LINHA POR COLABORADOR (tela da duplicidade):
--                                           tarefas/visitas/ligações (tasks), agendamentos
--                                           (visit_schedules), retornos (task_followups),
--                                           treinamentos (trainings), próximas ações
--       D4 get_equipment_validators      -> máquinas validadas por colaborador
--       D5 pops_executor_results         -> POPS executados por colaborador
--   [E] VALIDAÇÕES 1..9 + idempotência
-- ============================================================================

BEGIN;

-- ------------------------------------- [BASELINE] leitura atual (sem números fixos)
CREATE TEMP TABLE tmp_baseline_profiles ON COMMIT DROP AS
  SELECT user_id, employment_status::text AS employment_status, approval_status, filial_id, role
    FROM public.profiles;

CREATE TEMP TABLE tmp_baseline ON COMMIT DROP AS
  SELECT 'tasks' AS k, count(*) AS c FROM public.tasks WHERE created_by = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'followups',      count(*) FROM public.task_followups   WHERE responsible_user_id = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'agendamentos',   count(*) FROM public.visit_schedules  WHERE seller_id = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'pops',           count(*) FROM public.pops_machines    WHERE executed_by = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'validacoes',     count(*) FROM public.client_equipment WHERE validated_by = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'trainings',      count(*) FROM public.trainings        WHERE user_id = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'tasks_p',        count(*) FROM public.tasks            WHERE created_by = '04884288-d6bc-4f40-9857-519abae62605'
  UNION ALL SELECT 'followups_p',    count(*) FROM public.task_followups   WHERE responsible_user_id = '04884288-d6bc-4f40-9857-519abae62605'
  UNION ALL SELECT 'agendamentos_p', count(*) FROM public.visit_schedules  WHERE seller_id = '04884288-d6bc-4f40-9857-519abae62605'
  UNION ALL SELECT 'pops_p',         count(*) FROM public.pops_machines    WHERE executed_by = '04884288-d6bc-4f40-9857-519abae62605'
  UNION ALL SELECT 'validacoes_p',   count(*) FROM public.client_equipment WHERE validated_by = '04884288-d6bc-4f40-9857-519abae62605'
  UNION ALL SELECT 'trainings_p',    count(*) FROM public.trainings        WHERE user_id = '04884288-d6bc-4f40-9857-519abae62605'
  UNION ALL SELECT 'roles_outros',   count(*) FROM public.user_roles       WHERE user_id <> '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
  UNION ALL SELECT 'filiais_isac',   count(*) FROM public.user_filiais     WHERE user_id IN ('513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4','04884288-d6bc-4f40-9857-519abae62605') AND active;

-- ---------------------------------------------------------------- [A] INFRA
CREATE TABLE IF NOT EXISTS public.user_account_links (
  alias_user_id   uuid PRIMARY KEY,
  primary_user_id uuid NOT NULL,
  pm_registration text,
  reason          text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_account_links_no_self CHECK (alias_user_id <> primary_user_id)
);

GRANT SELECT ON public.user_account_links TO authenticated;
GRANT ALL    ON public.user_account_links TO service_role;

ALTER TABLE public.user_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view account links" ON public.user_account_links;
CREATE POLICY "Authenticated can view account links"
  ON public.user_account_links FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can manage account links" ON public.user_account_links;
CREATE POLICY "Managers can manage account links"
  ON public.user_account_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

DROP TRIGGER IF EXISTS update_user_account_links_updated_at ON public.user_account_links;
CREATE TRIGGER update_user_account_links_updated_at
  BEFORE UPDATE ON public.user_account_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Impede cadeia/ambiguidade de vínculos (titular nunca pode ser alias e vice-versa).
CREATE OR REPLACE FUNCTION public.user_account_links_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_account_links l WHERE l.alias_user_id = NEW.primary_user_id) THEN
    RAISE EXCEPTION 'Conta titular ja esta vinculada como conta antiga' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_account_links l WHERE l.primary_user_id = NEW.alias_user_id) THEN
    RAISE EXCEPTION 'Conta antiga ja e titular de outro vinculo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_account_links_guard_trg ON public.user_account_links;
CREATE TRIGGER user_account_links_guard_trg
  BEFORE INSERT OR UPDATE ON public.user_account_links
  FOR EACH ROW EXECUTE FUNCTION public.user_account_links_guard();

CREATE OR REPLACE FUNCTION public.resolve_primary_user_id(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT l.primary_user_id FROM public.user_account_links l WHERE l.alias_user_id = p_user_id),
    p_user_id);
$$;

REVOKE ALL ON FUNCTION public.resolve_primary_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_primary_user_id(uuid) TO authenticated, service_role;

-- Baseline dos vínculos já existentes (para provar que nenhum outro foi tocado).
CREATE TEMP TABLE tmp_baseline_links ON COMMIT DROP AS
  SELECT alias_user_id, primary_user_id FROM public.user_account_links;


-- ------------------------------------------------- [B] VÍNCULO DO ISAC (aqui)
-- created_by: recebe auth.uid() quando houver sessao administrativa; executado por
-- migracao (sem sessao) fica NULL e a autoria fica registrada em reason.
-- Sem ON CONFLICT DO UPDATE: um alias ja vinculado a outro titular ABORTA tudo.
DO $$
DECLARE
  v_alias   uuid := '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4';  -- stankeisac@gmail.com
  v_primary uuid := '04884288-d6bc-4f40-9857-519abae62605';  -- isac.stanke@rzkagro.com.br
  v_exist   uuid;
  v_ok_alias   int;
  v_ok_primary int;
BEGIN
  -- Só cria vínculo se os dados atuais conferirem exatamente (zero divergência).
  SELECT count(*) INTO v_ok_alias FROM public.profiles
   WHERE user_id = v_alias AND lower(email) = 'stankeisac@gmail.com';
  SELECT count(*) INTO v_ok_primary FROM public.profiles
   WHERE user_id = v_primary AND lower(email) = 'isac.stanke@rzkagro.com.br'
     AND pm_registration = 'PM2064' AND approval_status = 'approved';
  IF v_ok_alias <> 1 OR v_ok_primary <> 1 THEN
    RAISE EXCEPTION 'VALIDACAO B: dados atuais divergem do vinculo autorizado (alias=%, titular=%)',
      v_ok_alias, v_ok_primary;
  END IF;

  SELECT primary_user_id INTO v_exist FROM public.user_account_links WHERE alias_user_id = v_alias;

  IF v_exist IS NULL THEN
    INSERT INTO public.user_account_links (alias_user_id, primary_user_id, pm_registration, reason, created_by)
    VALUES (v_alias, v_primary, 'PM2064',
            'Conta pessoal antiga do titular PM2064 (Isac Manso Stanke). Consolidacao de relatorio autorizada pela gestao; executada por migracao sem sessao (auth.uid() nulo).',
            auth.uid());
  ELSIF v_exist = v_primary THEN
    NULL;  -- idempotente: vinculo correto ja existe
  ELSE
    RAISE EXCEPTION 'VALIDACAO B: alias ja vinculado a outro titular (%) — abortado', v_exist;
  END IF;
END $$;

-- ------------------------------- [C] DESATIVAÇÃO DA CONTA ANTIGA (aqui)
-- Mesmos efeitos de banco do procedimento oficial (edge function deactivate-user):
-- employment_status=inactive (trigger marca approval_status=rejected/deactivated_at)
-- e remoção de cargos/admin, sem tocar em nenhum registro histórico.
UPDATE public.profiles
   SET employment_status = 'inactive',
       deactivated_at    = COALESCE(deactivated_at, now()),
       deactivated_by    = COALESCE(deactivated_by, '04884288-d6bc-4f40-9857-519abae62605')
 WHERE user_id = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4'
   AND employment_status <> 'inactive';              -- idempotente

DELETE FROM public.user_roles  WHERE user_id = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4';
DELETE FROM public.admin_users WHERE user_id = '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4';

-- ============================ [D] CONSOLIDAÇÃO DOS INDICADORES (só leitura)
-- Regra única: todo agrupamento/contagem por colaborador passa a usar
-- public.resolve_primary_user_id(<coluna de usuário>) — os registros continuam
-- com seus user_id originais.

-- D1 — Relatório por vendedor/RAC: atividades, visitas, ligações, checklists,
--      prospecções, clientes únicos, vendas (total/parcial) e conversão.
--      DIVERGÊNCIA CORRIGIDA: a tela "Performance dos Vendedores"
--      (src/pages/PerformanceBySeller.tsx) sempre enviou p_responsible_user_id,
--      parâmetro que a função NÃO possuía — o filtro de consultor era ignorado
--      silenciosamente. A assinatura antiga de 3 parâmetros é substituída pela de
--      4 (o 4º com DEFAULT NULL, então chamadas antigas continuam válidas e sem
--      criar overload). Filtrar pela conta antiga resolve para o titular.
DROP FUNCTION IF EXISTS public.get_performance_by_seller_v2(date, date, uuid);
CREATE OR REPLACE FUNCTION public.get_performance_by_seller_v2(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_filial_id uuid DEFAULT NULL::uuid, p_responsible_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(responsible_user_id uuid, responsible_name text, filial_id uuid, filial_nome text, total_activities bigint, visitas bigint, ligacoes bigint, checklists bigint, prospections bigint, unique_clients bigint, sales_total_count bigint, sales_total_value numeric, sales_partial_count bigint, sales_partial_value numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_filiais uuid[];
  v_target uuid := public.resolve_primary_user_id(p_responsible_user_id); -- CONSOLIDA o filtro
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);

  -- LOGICA ANTERIOR (defeito): finance = scoped JOIN tasks por task_id, e as subqueries
  -- somavam TODAS as vendas do responsavel em CADA linha de filial => venda repetida
  -- quando a task tinha mais de um followup e quando o responsavel atuava em 2 filiais.
  -- LOGICA CORRIGIDA: atividades por followup; vendas DISTINCT por task dentro de
  -- (titular, filial), agregadas separadamente e unidas por (titular, filial).
  RETURN QUERY
  WITH scoped AS (
    SELECT tf.id, tf.task_id,
           public.resolve_primary_user_id(tf.responsible_user_id) AS rid,
           tf.filial_id, tf.activity_type,
           COALESCE(NULLIF(tf.client_code, ''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (cardinality(v_filiais) = 0 OR tf.filial_id = ANY(v_filiais))
      AND (v_target IS NULL OR public.resolve_primary_user_id(tf.responsible_user_id) = v_target) -- CONSOLIDA
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = ANY(v_filiais)))
  ),
  acts AS (
    SELECT s.rid, s.filial_id,
      COUNT(*)::bigint AS total_activities,
      COUNT(*) FILTER (WHERE s.activity_type::text = 'visita')::bigint AS visitas,
      COUNT(*) FILTER (WHERE s.activity_type::text = 'ligacao')::bigint AS ligacoes,
      COUNT(*) FILTER (WHERE s.activity_type::text = 'checklist')::bigint AS checklists,
      COUNT(*) FILTER (WHERE s.activity_type::text = 'prospection')::bigint AS prospections,
      COUNT(DISTINCT s.client_key) FILTER (WHERE s.client_key IS NOT NULL AND s.client_key <> '')::bigint AS unique_clients
    FROM scoped s GROUP BY s.rid, s.filial_id
  ),
  sales_tasks AS (
    SELECT DISTINCT s.rid, s.filial_id, t.id AS task_id,
           t.sales_value, t.partial_sales_value, t.sales_type, t.sales_confirmed
    FROM scoped s JOIN public.tasks t ON t.id = s.task_id
  ),
  sales AS (
    SELECT st.rid, st.filial_id,
      COUNT(*) FILTER (WHERE st.sales_confirmed AND st.sales_type = 'ganho')::bigint AS sales_total_count,
      COALESCE(SUM(st.sales_value) FILTER (WHERE st.sales_confirmed AND st.sales_type = 'ganho'), 0)::numeric AS sales_total_value,
      COUNT(*) FILTER (WHERE st.sales_confirmed AND st.sales_type = 'parcial')::bigint AS sales_partial_count,
      COALESCE(SUM(st.partial_sales_value) FILTER (WHERE st.sales_confirmed AND st.sales_type = 'parcial'), 0)::numeric AS sales_partial_value
    FROM sales_tasks st GROUP BY st.rid, st.filial_id
  )
  SELECT a.rid, p.name, a.filial_id, f.nome,
         a.total_activities, a.visitas, a.ligacoes, a.checklists, a.prospections, a.unique_clients,
         COALESCE(sa.sales_total_count, 0), COALESCE(sa.sales_total_value, 0),
         COALESCE(sa.sales_partial_count, 0), COALESCE(sa.sales_partial_value, 0)
  FROM acts a
  LEFT JOIN sales sa ON sa.rid = a.rid AND sa.filial_id IS NOT DISTINCT FROM a.filial_id
  LEFT JOIN public.profiles p ON p.user_id = a.rid
  LEFT JOIN public.filiais f ON f.id = a.filial_id
  ORDER BY a.total_activities DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_performance_by_seller_v2(date, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_by_seller_v2(date, date, uuid, uuid) TO authenticated, service_role;

-- D2 — KPIs de atividades/vendas (usa o mesmo conceito no filtro por responsável).
CREATE OR REPLACE FUNCTION public.get_activity_metrics_v2(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_filial_id uuid DEFAULT NULL::uuid, p_responsible_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_filiais uuid[];
  v_target uuid := public.resolve_primary_user_id(p_responsible_user_id); -- CONSOLIDA o filtro
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);

  WITH scoped_followups AS (
    SELECT tf.id, tf.task_id, tf.activity_type, tf.activity_date, tf.filial_id,
           tf.responsible_user_id, tf.followup_status,
           COALESCE(NULLIF(tf.client_code, ''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (cardinality(v_filiais) = 0 OR tf.filial_id = ANY(v_filiais))
      AND (v_target IS NULL OR public.resolve_primary_user_id(tf.responsible_user_id) = v_target) -- CONSOLIDA
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = ANY(v_filiais)))
  ),
  task_finances AS (
    SELECT t.id AS task_id, t.sales_value, t.partial_sales_value, t.sales_type, t.sales_confirmed, t.is_prospect
    FROM public.tasks t
    WHERE t.id IN (SELECT DISTINCT task_id FROM scoped_followups WHERE task_id IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'total_activities', (SELECT COUNT(*) FROM scoped_followups),
    'visitas',          (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'visita'),
    'ligacoes',         (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'ligacao'),
    'checklists',       (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'checklist'),
    'prospections',     (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'prospection'),
    'unique_clients',   (SELECT COUNT(DISTINCT client_key) FROM scoped_followups WHERE client_key IS NOT NULL AND client_key <> ''),
    'concluidos',       (SELECT COUNT(*) FROM scoped_followups WHERE followup_status::text = 'concluido'),
    'pendentes',        (SELECT COUNT(*) FROM scoped_followups WHERE followup_status::text = 'pendente'),
    'sales_total_count',   (SELECT COUNT(*) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'ganho'),
    'sales_total_value',   (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'ganho'),
    'sales_partial_count', (SELECT COUNT(*) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'parcial'),
    'sales_partial_value', (SELECT COALESCE(SUM(partial_sales_value), 0) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'parcial'),
    'sales_lost_count',    (SELECT COUNT(*) FROM task_finances WHERE sales_type = 'perdido'),
    'sales_lost_value',    (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE sales_type = 'perdido'),
    'prospect_open_count', (SELECT COUNT(*) FROM task_finances WHERE is_prospect = true AND (sales_confirmed IS NULL OR sales_confirmed = false)),
    'prospect_open_value', (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE is_prospect = true AND (sales_confirmed IS NULL OR sales_confirmed = false))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- D3 — TELA DA DUPLICIDADE (Meu Dia > Minha equipe): uma linha por colaborador.
--      Consolida tarefas/visitas/ligações (tasks.created_by), agendamentos
--      (visit_schedules.seller_id), retornos (task_followups.responsible_user_id),
--      treinamentos (trainings.user_id) e próximas ações (tasks.next_action_date).
--      Contas antigas vinculadas nunca geram linha própria.
CREATE OR REPLACE FUNCTION public.get_my_day_team_summary(p_filial_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s            record;
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_week_start date;
  v_week_end   date;
  v_is_weekend boolean;
  v_month_start date;
  v_month_end   date;
  v_win_start   date;
  v_win_end     date;
  v_elapsed_wd  integer;
  v_elapsed_all integer;
  v_total_wd    integer;
  v_total_all   integer;
  v_filial     uuid;
  v_role       text := NULLIF(btrim(COALESCE(p_role, '')), '');
  v_rows       jsonb;
  v_kpi        jsonb;
BEGIN
  SELECT * INTO s FROM public.my_day_scope();

  IF s.scope = 'self' THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para visão de equipe' USING ERRCODE = '42501';
  END IF;

  v_filial := CASE
    WHEN s.scope = 'global' THEN p_filial_id
    ELSE (public.effective_filial_ids(p_filial_id))[1]
  END;

  v_week_start := (v_today - (EXTRACT(ISODOW FROM v_today)::int - 1))::date;
  v_week_end   := (v_week_start + 6)::date;
  v_is_weekend := EXTRACT(ISODOW FROM v_today)::int >= 6;

  v_month_start := date_trunc('month', v_today)::date;
  v_month_end   := (v_month_start + interval '1 month - 1 day')::date;
  v_win_start   := GREATEST(v_week_start, v_month_start);
  v_win_end     := LEAST(v_week_end, v_month_end);

  SELECT count(*) FILTER (WHERE EXTRACT(ISODOW FROM d)::int <= 5)::int, count(*)::int
    INTO v_elapsed_wd, v_elapsed_all
  FROM generate_series(v_win_start::timestamp, v_today::timestamp, interval '1 day') d;

  SELECT count(*) FILTER (WHERE EXTRACT(ISODOW FROM d)::int <= 5)::int, count(*)::int
    INTO v_total_wd, v_total_all
  FROM generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d;

  WITH membros AS (
    SELECT p.user_id, p.name, p.filial_id, fi.nome AS filial_nome,
           public.my_day_role_of(p.user_id) AS role
    FROM public.profiles p
    LEFT JOIN public.filiais fi ON fi.id = p.filial_id
    WHERE p.approval_status = 'approved'
      AND p.employment_status = 'active'
      AND (v_filial IS NULL OR p.filial_id = v_filial)
      AND (p_user_id IS NULL OR p.user_id = p_user_id)
      AND p.user_id <> s.user_id
      AND NOT EXISTS (SELECT 1 FROM public.user_account_links l WHERE l.alias_user_id = p.user_id) -- CONSOLIDA
      AND public.my_day_role_of(p.user_id) IN ('supervisor', 'sales_consultant', 'consultant',
                                               'technical_consultant', 'rac', 'cpa', 'csa')
  ), filtrados AS (
    SELECT * FROM membros WHERE v_role IS NULL OR role = v_role
  ), metas AS (
    SELECT f.*,
           gv.target_value  AS meta_visitas,
           gv.period_type   AS visitas_period,
           gv.weekdays_only AS visitas_weekdays_only,
           gl.target_value  AS meta_ligacoes,
           gl.period_type   AS ligacoes_period,
           gl.weekdays_only AS ligacoes_weekdays_only
    FROM filtrados f
    LEFT JOIN public.activity_goal_settings gv
           ON gv.active AND gv.activity_type = 'visita'  AND gv.role::text = f.role
    LEFT JOIN public.activity_goal_settings gl
           ON gl.active AND gl.activity_type = 'ligacao' AND gl.role::text = f.role
  ), agg AS (
    SELECT m.user_id, m.name, m.role, m.filial_id, m.filial_nome,
           CASE WHEN m.meta_visitas IS NULL THEN NULL
                WHEN m.visitas_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_visitas END AS meta_visitas,
           CASE WHEN m.meta_ligacoes IS NULL THEN NULL
                WHEN m.ligacoes_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_ligacoes END AS meta_ligacoes,
           CASE WHEN m.meta_visitas IS NULL OR m.visitas_period <> 'daily' THEN NULL
                WHEN m.visitas_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_visitas END AS meta_visitas_hoje,
           CASE WHEN m.meta_ligacoes IS NULL OR m.ligacoes_period <> 'daily' THEN NULL
                WHEN m.ligacoes_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_ligacoes END AS meta_ligacoes_hoje,
           CASE WHEN m.meta_visitas IS NULL THEN NULL
                WHEN m.visitas_period = 'weekly' THEN
                  CASE WHEN COALESCE(CASE WHEN m.visitas_weekdays_only THEN v_total_wd ELSE v_total_all END, 0) = 0 THEN 0
                       ELSE CEIL(m.meta_visitas::numeric
                                 * (CASE WHEN m.visitas_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
                                 / (CASE WHEN m.visitas_weekdays_only THEN v_total_wd ELSE v_total_all END))::int END
                ELSE m.meta_visitas * (CASE WHEN m.visitas_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
           END AS meta_visitas_semana,
           CASE WHEN m.meta_ligacoes IS NULL THEN NULL
                WHEN m.ligacoes_period = 'weekly' THEN
                  CASE WHEN COALESCE(CASE WHEN m.ligacoes_weekdays_only THEN v_total_wd ELSE v_total_all END, 0) = 0 THEN 0
                       ELSE CEIL(m.meta_ligacoes::numeric
                                 * (CASE WHEN m.ligacoes_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
                                 / (CASE WHEN m.ligacoes_weekdays_only THEN v_total_wd ELSE v_total_all END))::int END
                ELSE m.meta_ligacoes * (CASE WHEN m.ligacoes_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
           END AS meta_ligacoes_semana,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date >= CASE WHEN m.visitas_period = 'weekly' THEN v_week_start ELSE v_today END
               AND t.start_date <= v_today) AS visitas_realizado,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date = v_today) AS ligacoes_realizado,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date = v_today) AS visitas_hoje,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date = v_today) AS ligacoes_hoje,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date >= v_win_start
               AND t.start_date <= v_today) AS visitas_semana,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date >= v_win_start
               AND t.start_date <= v_today) AS ligacoes_semana,
           (SELECT count(*)::int FROM public.visit_schedules vs
             WHERE public.resolve_primary_user_id(vs.seller_id) = m.user_id
               AND vs.status = 'planejado'
               AND vs.planned_date < v_today) AS visitas_atrasadas,
           (SELECT count(*)::int FROM public.task_followups f2
             WHERE public.resolve_primary_user_id(f2.responsible_user_id) = m.user_id
               AND f2.followup_status = 'pendente'
               AND f2.next_return_date IS NOT NULL
               AND f2.next_return_date < v_today) AS retornos_atrasados,
           (SELECT count(*)::int FROM public.trainings tr
             WHERE public.resolve_primary_user_id(tr.user_id) = m.user_id
               AND tr.status = 'pendente'
               AND tr.training_date <= v_today) AS treinamentos_pendentes,
           (SELECT count(*)::int FROM public.tasks t
             WHERE public.resolve_primary_user_id(t.created_by) = m.user_id
               AND t.next_action_date IS NOT NULL
               AND COALESCE(t.status, 'pending') NOT IN ('closed', 'completed')
               AND t.next_action_date < v_today) AS acoes_atrasadas
    FROM metas m
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'name', name, 'role', role,
      'filial_id', filial_id, 'filial_nome', filial_nome,
      'visitas_realizado', visitas_realizado, 'visitas_meta', meta_visitas,
      'ligacoes_realizado', ligacoes_realizado, 'ligacoes_meta', meta_ligacoes,
      'visitas_hoje', visitas_hoje, 'visitas_meta_hoje', meta_visitas_hoje,
      'ligacoes_hoje', ligacoes_hoje, 'ligacoes_meta_hoje', meta_ligacoes_hoje,
      'visitas_semana', visitas_semana, 'visitas_meta_semana', meta_visitas_semana,
      'ligacoes_semana', ligacoes_semana, 'ligacoes_meta_semana', meta_ligacoes_semana,
      'visitas_pendencia_semana', CASE WHEN meta_visitas_semana IS NULL THEN NULL
                                       ELSE GREATEST(meta_visitas_semana - visitas_semana, 0) END,
      'ligacoes_pendencia_semana', CASE WHEN meta_ligacoes_semana IS NULL THEN NULL
                                        ELSE GREATEST(meta_ligacoes_semana - ligacoes_semana, 0) END,
      'visitas_atrasadas', visitas_atrasadas,
      'retornos_atrasados', retornos_atrasados,
      'treinamentos_pendentes', treinamentos_pendentes,
      'acoes_atrasadas', acoes_atrasadas,
      'total_pendencias', visitas_atrasadas + retornos_atrasados + treinamentos_pendentes + acoes_atrasadas,
      'meta_atingida', CASE
        WHEN meta_visitas IS NULL AND meta_ligacoes IS NULL THEN NULL
        ELSE COALESCE(visitas_realizado >= meta_visitas, true)
         AND COALESCE(ligacoes_realizado >= meta_ligacoes, true) END
    ) ORDER BY name), '[]'::jsonb),
    jsonb_build_object(
      'colaboradores', count(*),
      'com_pendencias', count(*) FILTER (
        WHERE visitas_atrasadas + retornos_atrasados + treinamentos_pendentes + acoes_atrasadas > 0),
      'meta_nao_atingida', count(*) FILTER (
        WHERE (meta_visitas  IS NOT NULL AND visitas_realizado  < meta_visitas)
           OR (meta_ligacoes IS NOT NULL AND ligacoes_realizado < meta_ligacoes)),
      'visitas_atrasadas',      COALESCE(sum(visitas_atrasadas), 0),
      'retornos_atrasados',     COALESCE(sum(retornos_atrasados), 0),
      'treinamentos_pendentes', COALESCE(sum(treinamentos_pendentes), 0),
      'acoes_atrasadas',        COALESCE(sum(acoes_atrasadas), 0),
      'visitas_pendencia_semana',  COALESCE(sum(GREATEST(COALESCE(meta_visitas_semana, 0) - visitas_semana, 0)), 0),
      'ligacoes_pendencia_semana', COALESCE(sum(GREATEST(COALESCE(meta_ligacoes_semana, 0) - ligacoes_semana, 0)), 0)
    )
  INTO v_rows, v_kpi
  FROM agg;

  RETURN jsonb_build_object(
    'scope', s.scope,
    'viewer', jsonb_build_object('user_id', s.user_id, 'role', s.role, 'filial_id', s.filial_id),
    'today', v_today, 'week_start', v_week_start, 'week_end', v_week_end, 'is_weekend', v_is_weekend,
    'week_window', jsonb_build_object('start', v_win_start, 'end', v_win_end,
      'elapsed_days', v_elapsed_all, 'elapsed_weekdays', v_elapsed_wd,
      'total_days', v_total_all, 'total_weekdays', v_total_wd),
    'filters', jsonb_build_object('filial_id', v_filial, 'role', v_role, 'user_id', p_user_id),
    'kpis', v_kpi,
    'rows', v_rows
  );
END;
$function$;

-- D4 — Máquinas validadas por colaborador (Parque de Máquinas > validadores).
CREATE OR REPLACE FUNCTION public.get_equipment_validators(p_filial_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, name text, filial_id uuid, filial_nome text, validated_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT public.effective_filial_ids(p_filial_id) AS ids
  ), base AS (
    SELECT public.resolve_primary_user_id(ce.validated_by) AS uid, -- CONSOLIDA
           ce.id AS eq_id, ce.filial_id AS eq_filial_id
    FROM public.client_equipment ce
    CROSS JOIN scope s
    WHERE ce.validated_by IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND public.can_view_equipment_park()
      AND (cardinality(s.ids) = 0 OR ce.filial_id = ANY (s.ids))
  ), agg AS (
    SELECT b.uid,
           count(b.eq_id) AS validated_count,
           mode() WITHIN GROUP (ORDER BY b.eq_filial_id) AS eq_filial_id
    FROM base b GROUP BY b.uid
  )
  SELECT
    a.uid,
    COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(h.name), ''), 'Usuário inativo/removido'),
    COALESCE(p.filial_id, h.filial_id, a.eq_filial_id),
    COALESCE(f.nome, '—'),
    a.validated_count
  FROM agg a
  LEFT JOIN public.profiles p         ON p.user_id = a.uid
  LEFT JOIN public.historical_users h ON h.user_id = a.uid
  LEFT JOIN public.filiais f          ON f.id = COALESCE(p.filial_id, h.filial_id, a.eq_filial_id)
  ORDER BY a.validated_count DESC;
$function$;

-- D5 — POPS executados por colaborador (resultado por executor).
CREATE OR REPLACE FUNCTION public.pops_executor_results(p_program_id uuid, p_filial_id uuid DEFAULT NULL::uuid, p_platform text DEFAULT NULL::text, p_executed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_scope   jsonb := public.pops_scope();
  v_kind    text  := v_scope ->> 'scope';
  v_filiais uuid[];
  v_plat   text  := nullif(btrim(coalesce(p_platform,'')),'');
  v_tz     text  := 'America/Sao_Paulo';
  v_d0     date  := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_exec   uuid  := public.resolve_primary_user_id(p_executed_by); -- CONSOLIDA o filtro
  v_wk     date;
  v_mo     date;
  v_total  integer;
  v_rows   jsonb;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);
  v_wk := v_d0 - (extract(isodow from v_d0)::int - 1);
  v_mo := date_trunc('month', v_d0)::date;

  WITH base AS (
    SELECT public.resolve_primary_user_id(m.executed_by) AS executed_by, -- CONSOLIDA
           upper(btrim(coalesce(m.pops_platform,''))) AS plat,
           (m.executed_at AT TIME ZONE v_tz)::date AS exec_date
      FROM public.pops_machines m
     WHERE m.program_id = p_program_id
       AND m.active
       AND m.status = 'servicada'
       AND m.executed_by IS NOT NULL
       AND (cardinality(v_filiais) = 0 OR m.pops_filial_id = ANY(v_filiais))
       AND (v_plat IS NULL OR upper(btrim(coalesce(m.pops_platform,''))) = upper(v_plat))
       AND (v_exec IS NULL OR public.resolve_primary_user_id(m.executed_by) = v_exec)
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
    'filial_id', CASE WHEN cardinality(v_filiais) = 1 THEN v_filiais[1] ELSE NULL END,
    'total_serviced', coalesce(v_total,0),
    'rows', coalesce(v_rows,'[]'::jsonb)
  );
END $function$;

-- D6 — ANÁLISE GERENCIAL > RESUMO POR VENDEDOR.
--      Identidade consolidada em resolve_primary_user_id(); clientes atendidos
--      continuam COUNT(DISTINCT client_key) (nunca soma simples); os valores
--      comerciais vêm de tasks/opportunities (nunca de followups) e são anexados a
--      UMA única linha do colaborador, para não multiplicar por filial.
CREATE OR REPLACE FUNCTION public.get_management_seller_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_filial_id uuid DEFAULT NULL::uuid, p_seller_role text DEFAULT NULL::text, p_seller_id uuid DEFAULT NULL::uuid, p_task_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(seller_id uuid, seller_name text, seller_role text, filial text, visitas bigint, ligacoes bigint, checklists bigint, total_atividades bigint, clientes_atendidos bigint, oportunidade_gerada numeric, valor_convertido numeric, taxa_conversao numeric, ultima_atividade timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
  v_seller uuid := public.resolve_primary_user_id(p_seller_id);  -- CONSOLIDA o filtro
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

  RETURN QUERY
  WITH ops AS (
    SELECT
      public.resolve_primary_user_id(tf.responsible_user_id) AS seller_id,  -- CONSOLIDA
      tf.filial_id,
      COUNT(*) FILTER (WHERE tf.activity_type::text IN ('visita','prospection')) AS visitas,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'ligacao') AS ligacoes,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'checklist') AS checklists,
      COUNT(*) AS total_atividades,
      COUNT(DISTINCT COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name)))) AS clientes_atendidos,
      MAX(tf.activity_date) AS ultima_atividade
    FROM task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (v_seller IS NULL OR public.resolve_primary_user_id(tf.responsible_user_id) = v_seller)
      AND (p_task_types IS NULL OR tf.activity_type::text = ANY(p_task_types))
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
        OR tf.responsible_user_id = v_user_id
      )
    GROUP BY 1, tf.filial_id
  ),
  ops_rank AS (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.seller_id
                                   ORDER BY o.total_atividades DESC, o.filial_id) AS rn
    FROM ops o
  ),
  comm_tasks AS (  -- uma linha por TAREFA de origem (nunca por followup)
    SELECT DISTINCT public.resolve_primary_user_id(t.created_by) AS seller_id, t.id AS task_id
    FROM tasks t
    JOIN profiles pp ON pp.user_id = t.created_by
    WHERE
      (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (v_seller IS NULL OR public.resolve_primary_user_id(t.created_by) = v_seller)
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial)
        OR t.created_by = v_user_id
      )
  ),
  comm AS (
    SELECT ct.seller_id,
      COALESCE(SUM(o.valor_total_oportunidade), 0) AS oportunidade_gerada,
      COALESCE(SUM(o.valor_venda_fechada), 0) AS valor_convertido
    FROM comm_tasks ct
    LEFT JOIN opportunities o ON o.task_id = ct.task_id
    GROUP BY ct.seller_id
  ),
  primary_role AS (
    SELECT ur.user_id, (ARRAY_AGG(ur.role::text ORDER BY
      CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
        WHEN 'rac' THEN 4 WHEN 'cpa' THEN 4 WHEN 'csa' THEN 4 ELSE 5 END))[1] AS role
    FROM user_roles ur GROUP BY ur.user_id
  )
  SELECT
    ops_rank.seller_id,
    p.name AS seller_name,
    COALESCE(pr.role, 'consultant') AS seller_role,
    f.nome AS filial,
    ops_rank.visitas, ops_rank.ligacoes, ops_rank.checklists,
    ops_rank.total_atividades, ops_rank.clientes_atendidos,
    CASE WHEN ops_rank.rn = 1 THEN COALESCE(comm.oportunidade_gerada, 0) ELSE 0 END AS oportunidade_gerada,
    CASE WHEN ops_rank.rn = 1 THEN COALESCE(comm.valor_convertido, 0) ELSE 0 END AS valor_convertido,
    CASE WHEN ops_rank.rn = 1 AND COALESCE(comm.oportunidade_gerada, 0) > 0
      THEN ROUND(comm.valor_convertido / comm.oportunidade_gerada * 100, 2)
      ELSE 0 END AS taxa_conversao,
    ops_rank.ultima_atividade
  FROM ops_rank
  LEFT JOIN comm ON comm.seller_id = ops_rank.seller_id
  LEFT JOIN profiles p ON p.user_id = ops_rank.seller_id
  LEFT JOIN filiais f ON f.id = ops_rank.filial_id
  LEFT JOIN primary_role pr ON pr.user_id = ops_rank.seller_id
  WHERE (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
  ORDER BY COALESCE(comm.valor_convertido, 0) DESC, ops_rank.total_atividades DESC;
END;
$function$;

-- D7 — ANÁLISE GERENCIAL > DETALHE POR CLIENTE.
--      Mesma resolução de titular; cliente permanece individualizado por client_key;
--      valores comerciais por (cliente, titular) contados uma única vez.
CREATE OR REPLACE FUNCTION public.get_management_client_details(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_filial_id uuid DEFAULT NULL::uuid, p_seller_role text DEFAULT NULL::text, p_seller_id uuid DEFAULT NULL::uuid, p_task_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(client_name text, seller_id uuid, seller_name text, seller_role text, filial text, total_atividades bigint, visitas bigint, ligacoes bigint, checklists bigint, oportunidade_gerada numeric, valor_convertido numeric, status_cliente text, ultima_atividade timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
  v_seller uuid := public.resolve_primary_user_id(p_seller_id);  -- CONSOLIDA o filtro
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

  RETURN QUERY
  WITH ops AS (
    SELECT
      COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))) AS client_key,
      MAX(tf.client_name) AS client_name,
      public.resolve_primary_user_id(tf.responsible_user_id) AS seller_id,  -- CONSOLIDA
      tf.filial_id,
      COUNT(*) AS total_atividades,
      COUNT(*) FILTER (WHERE tf.activity_type::text IN ('visita','prospection')) AS visitas,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'ligacao') AS ligacoes,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'checklist') AS checklists,
      MAX(tf.activity_date) AS ultima_atividade
    FROM task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (v_seller IS NULL OR public.resolve_primary_user_id(tf.responsible_user_id) = v_seller)
      AND (p_task_types IS NULL OR tf.activity_type::text = ANY(p_task_types))
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
        OR tf.responsible_user_id = v_user_id
      )
    GROUP BY 1, 3, tf.filial_id
  ),
  ops_rank AS (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.client_key, o.seller_id
                                   ORDER BY o.total_atividades DESC, o.filial_id) AS rn
    FROM ops o
  ),
  comm_tasks AS (  -- uma linha por TAREFA de origem
    SELECT DISTINCT
      COALESCE(NULLIF(t.clientcode,''), LOWER(TRIM(t.client))) AS client_key,
      public.resolve_primary_user_id(t.created_by) AS seller_id,           -- CONSOLIDA
      t.id AS task_id
    FROM tasks t
    WHERE (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
  ),
  comm AS (
    SELECT ct.client_key, ct.seller_id,
      COALESCE(SUM(o.valor_total_oportunidade), 0) AS oportunidade_gerada,
      COALESCE(SUM(o.valor_venda_fechada), 0) AS valor_convertido,
      bool_or(o.status = 'Perdido') AS has_perdido
    FROM comm_tasks ct
    LEFT JOIN opportunities o ON o.task_id = ct.task_id
    GROUP BY ct.client_key, ct.seller_id
  ),
  primary_role AS (
    SELECT ur.user_id, (ARRAY_AGG(ur.role::text ORDER BY
      CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
        WHEN 'rac' THEN 4 WHEN 'cpa' THEN 4 WHEN 'csa' THEN 4 ELSE 5 END))[1] AS role
    FROM user_roles ur GROUP BY ur.user_id
  )
  SELECT
    ops_rank.client_name,
    ops_rank.seller_id,
    p.name AS seller_name,
    COALESCE(pr.role, 'consultant') AS seller_role,
    f.nome AS filial,
    ops_rank.total_atividades, ops_rank.visitas, ops_rank.ligacoes, ops_rank.checklists,
    CASE WHEN ops_rank.rn = 1 THEN COALESCE(comm.oportunidade_gerada, 0) ELSE 0 END AS oportunidade_gerada,
    CASE WHEN ops_rank.rn = 1 THEN COALESCE(comm.valor_convertido, 0) ELSE 0 END AS valor_convertido,
    CASE
      WHEN COALESCE(comm.valor_convertido, 0) > 0 THEN 'Ganho'
      WHEN COALESCE(comm.has_perdido, false) THEN 'Perdido'
      WHEN COALESCE(comm.oportunidade_gerada, 0) > 0 THEN 'Prospect'
      ELSE 'Sem Oportunidade'
    END AS status_cliente,
    ops_rank.ultima_atividade
  FROM ops_rank
  LEFT JOIN comm ON comm.client_key = ops_rank.client_key AND comm.seller_id = ops_rank.seller_id
  LEFT JOIN profiles p ON p.user_id = ops_rank.seller_id
  LEFT JOIN filiais f ON f.id = ops_rank.filial_id
  LEFT JOIN primary_role pr ON pr.user_id = ops_rank.seller_id
  WHERE (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
  ORDER BY COALESCE(comm.valor_convertido, 0) DESC, ops_rank.total_atividades DESC;
END;
$function$;

-- D8 — OPORTUNIDADES DE SERVIÇO > RESUMO POR CRIADOR.
--      Somente a IDENTIDADE do criador é resolvida para o titular (nome, cargo e
--      filial passam a vir do perfil titular). created_by dos registros NÃO muda,
--      e o escopo/permissão continua avaliado pela conta que criou a tarefa.
CREATE OR REPLACE FUNCTION public.get_service_opportunities_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_filial_id uuid DEFAULT NULL::uuid, p_seller_role text DEFAULT NULL::text, p_seller_id uuid DEFAULT NULL::uuid, p_service_type text DEFAULT NULL::text, p_severity text DEFAULT NULL::text, p_machine_type text DEFAULT NULL::text, p_client text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
  v_seller uuid := public.resolve_primary_user_id(p_seller_id);  -- CONSOLIDA o filtro
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
      public.resolve_primary_user_id(t.created_by) AS created_by,   -- CONSOLIDA (só identidade)
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
    LEFT JOIN profiles pf ON pf.user_id = public.resolve_primary_user_id(t.created_by)
    LEFT JOIN filiais f ON f.id = pp.filial_id
    LEFT JOIN primary_role pr ON pr.user_id = public.resolve_primary_user_id(t.created_by)
    WHERE t.task_type = 'checklist'
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (v_seller IS NULL OR public.resolve_primary_user_id(t.created_by) = v_seller)
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

-- D9 — VERSÃO ANTIGA DO RELATÓRIO POR VENDEDOR (mantida, não removida nesta etapa).
--      Consolida por titular; a conta antiga já não entra em approved_sellers
--      (fica inativa e sem cargo), então não gera segunda linha.
CREATE OR REPLACE FUNCTION public.get_performance_by_seller(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, user_name text, user_role text, visitas bigint, checklist bigint, ligacoes bigint, prospects bigint, prospects_value numeric, sales_value numeric, conversion_rate numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH approved_sellers AS (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.name, ur.role
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE p.approval_status = 'approved'
      AND ur.role IN ('consultant', 'manager', 'admin')
      AND NOT EXISTS (SELECT 1 FROM user_account_links l WHERE l.alias_user_id = p.user_id)  -- CONSOLIDA
    ORDER BY p.user_id, p.name
  ),
  task_stats AS (
    SELECT
      public.resolve_primary_user_id(t.created_by) AS created_by,  -- CONSOLIDA
      COUNT(*) FILTER (WHERE t.task_type IN ('prospection', 'visita'))::bigint AS visitas,
      COUNT(*) FILTER (WHERE t.task_type = 'checklist')::bigint AS checklist,
      COUNT(*) FILTER (WHERE t.task_type = 'ligacao')::bigint AS ligacoes,
      COUNT(*) FILTER (WHERE t.is_prospect = true)::bigint AS prospects,
      COALESCE(SUM(t.sales_value) FILTER (WHERE t.is_prospect = true), 0)::numeric AS prospects_value,
      COALESCE(SUM(t.sales_value) FILTER (WHERE t.sales_confirmed = true), 0)::numeric AS sales_value
    FROM tasks t
    JOIN approved_sellers s ON s.user_id = public.resolve_primary_user_id(t.created_by)
    WHERE (p_date_from IS NULL OR t.start_date >= p_date_from)
      AND (p_date_to IS NULL OR t.end_date <= p_date_to)
    GROUP BY 1
  )
  SELECT
    s.user_id,
    s.name::text,
    s.role::text,
    COALESCE(ts.visitas, 0)::bigint,
    COALESCE(ts.checklist, 0)::bigint,
    COALESCE(ts.ligacoes, 0)::bigint,
    COALESCE(ts.prospects, 0)::bigint,
    COALESCE(ts.prospects_value, 0)::numeric,
    COALESCE(ts.sales_value, 0)::numeric,
    CASE WHEN COALESCE(ts.prospects_value, 0) > 0
      THEN ROUND((COALESCE(ts.sales_value, 0) / ts.prospects_value * 100)::numeric, 2)
      ELSE 0::numeric
    END
  FROM approved_sellers s
  LEFT JOIN task_stats ts ON ts.created_by = s.user_id
  ORDER BY COALESCE(ts.sales_value, 0) DESC;
END;
$function$;

-- =========================================================== [E] VALIDAÇÕES
DO $$
DECLARE
  v_alias   uuid := '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4';
  v_primary uuid := '04884288-d6bc-4f40-9857-519abae62605';
  n int; m int; k int;
BEGIN
  -- 1) vínculo do ALIAS único e sem ambiguidade (a tabela pode conter outros vínculos)
  SELECT count(*) INTO n FROM public.user_account_links WHERE alias_user_id = v_alias;
  IF n <> 1 THEN RAISE EXCEPTION 'V1: esperado exatamente 1 vinculo para o alias, encontrado %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_account_links
                  WHERE alias_user_id = v_alias AND primary_user_id = v_primary
                    AND pm_registration = 'PM2064') THEN
    RAISE EXCEPTION 'V1: vinculo do Isac ausente ou divergente';
  END IF;
  IF public.resolve_primary_user_id(v_alias) <> v_primary
     OR public.resolve_primary_user_id(v_primary) <> v_primary THEN
    RAISE EXCEPTION 'V1: resolucao de titular incorreta';
  END IF;

  -- 2) conta corporativa intacta
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE user_id = v_primary AND approval_status = 'approved'
                    AND employment_status = 'active' AND pm_registration = 'PM2064'
                    AND filial_id = (SELECT id FROM public.filiais WHERE nome = 'Água Boa')) THEN
    RAISE EXCEPTION 'V2: conta corporativa alterada ou divergente';
  END IF;

  -- 3) conta antiga inativa e sem acesso operacional
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE user_id = v_alias AND employment_status = 'inactive'
                    AND deactivated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'V3: conta antiga nao foi desativada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_alias)
     OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = v_alias) THEN
    RAISE EXCEPTION 'V3: conta antiga ainda possui cargo/admin';
  END IF;

  -- 4/5) histórico preservado: user_id originais e contagens por conta inalteradas
  --      (comparação com o baseline capturado em tmp_baseline)
  IF EXISTS (
    SELECT 1 FROM tmp_baseline b
    JOIN (SELECT 'tasks' k, count(*) c FROM public.tasks WHERE created_by = v_alias
          UNION ALL SELECT 'followups', count(*) FROM public.task_followups WHERE responsible_user_id = v_alias
          UNION ALL SELECT 'agendamentos', count(*) FROM public.visit_schedules WHERE seller_id = v_alias
          UNION ALL SELECT 'pops', count(*) FROM public.pops_machines WHERE executed_by = v_alias
          UNION ALL SELECT 'validacoes', count(*) FROM public.client_equipment WHERE validated_by = v_alias
          UNION ALL SELECT 'trainings', count(*) FROM public.trainings WHERE user_id = v_alias
          UNION ALL SELECT 'tasks_p', count(*) FROM public.tasks WHERE created_by = v_primary
          UNION ALL SELECT 'followups_p', count(*) FROM public.task_followups WHERE responsible_user_id = v_primary
          UNION ALL SELECT 'agendamentos_p', count(*) FROM public.visit_schedules WHERE seller_id = v_primary
          UNION ALL SELECT 'pops_p', count(*) FROM public.pops_machines WHERE executed_by = v_primary
          UNION ALL SELECT 'validacoes_p', count(*) FROM public.client_equipment WHERE validated_by = v_primary
          UNION ALL SELECT 'trainings_p', count(*) FROM public.trainings WHERE user_id = v_primary) a
      ON a.k = b.k AND a.c <> b.c) THEN
    RAISE EXCEPTION 'V4/V5: contagens historicas por conta mudaram';
  END IF;

  -- 6) uma única linha do Isac na tela de equipe (perfis ativos elegíveis)
  SELECT count(*) INTO n FROM public.profiles p
   WHERE p.approval_status = 'approved' AND p.employment_status = 'active'
     AND p.user_id IN (v_alias, v_primary)
     AND NOT EXISTS (SELECT 1 FROM public.user_account_links l WHERE l.alias_user_id = p.user_id);
  IF n <> 1 THEN RAISE EXCEPTION 'V6: esperado 1 linha do Isac, encontrado %', n; END IF;

  -- 7) consolidado = soma exata das duas contas (recalculado agora)
  SELECT (SELECT count(*) FROM public.tasks WHERE created_by IN (v_alias, v_primary)),
         (SELECT count(*) FROM public.tasks WHERE public.resolve_primary_user_id(created_by) = v_primary)
    INTO n, m;
  IF n <> m THEN RAISE EXCEPTION 'V7: tarefas consolidadas % <> soma das contas %', m, n; END IF;
  SELECT (SELECT count(*) FROM public.task_followups WHERE responsible_user_id IN (v_alias, v_primary)),
         (SELECT count(*) FROM public.task_followups WHERE public.resolve_primary_user_id(responsible_user_id) = v_primary)
    INTO n, m;
  IF n <> m THEN RAISE EXCEPTION 'V7: atividades consolidadas divergem'; END IF;
  SELECT (SELECT count(*) FROM public.visit_schedules WHERE seller_id IN (v_alias, v_primary)),
         (SELECT count(*) FROM public.visit_schedules WHERE public.resolve_primary_user_id(seller_id) = v_primary)
    INTO n, m;
  IF n <> m THEN RAISE EXCEPTION 'V7: agendamentos consolidados divergem'; END IF;
  SELECT (SELECT count(*) FROM public.pops_machines WHERE executed_by IN (v_alias, v_primary)),
         (SELECT count(*) FROM public.pops_machines WHERE public.resolve_primary_user_id(executed_by) = v_primary)
    INTO n, m;
  IF n <> m THEN RAISE EXCEPTION 'V7: POPS consolidados divergem'; END IF;
  SELECT (SELECT count(*) FROM public.client_equipment WHERE validated_by IN (v_alias, v_primary)),
         (SELECT count(*) FROM public.client_equipment WHERE public.resolve_primary_user_id(validated_by) = v_primary)
    INTO n, m;
  IF n <> m THEN RAISE EXCEPTION 'V7: validacoes consolidadas divergem'; END IF;
  SELECT (SELECT count(*) FROM public.trainings WHERE user_id IN (v_alias, v_primary)),
         (SELECT count(*) FROM public.trainings WHERE public.resolve_primary_user_id(user_id) = v_primary)
    INTO n, m;
  IF n <> m THEN RAISE EXCEPTION 'V7: treinamentos consolidados divergem'; END IF;

  -- 8) nenhum outro usuário afetado
  SELECT count(*) INTO n FROM public.profiles p JOIN tmp_baseline_profiles b ON b.user_id = p.user_id
   WHERE p.user_id <> v_alias
     AND (p.employment_status::text <> b.employment_status OR p.approval_status <> b.approval_status
          OR p.filial_id IS DISTINCT FROM b.filial_id OR p.role <> b.role);
  IF n <> 0 THEN RAISE EXCEPTION 'V8: % perfis de outros usuarios alterados', n; END IF;
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id <> v_alias;
  SELECT c INTO m FROM tmp_baseline WHERE tmp_baseline.k = 'roles_outros';
  IF n <> m THEN RAISE EXCEPTION 'V8: cargos de outros usuarios alterados'; END IF;

  -- 8b) nenhum vínculo de outro usuário alterado/removido
  SELECT count(*) INTO n FROM public.user_account_links l
   WHERE l.alias_user_id <> v_alias
     AND NOT EXISTS (SELECT 1 FROM tmp_baseline_links b
                      WHERE b.alias_user_id = l.alias_user_id
                        AND b.primary_user_id = l.primary_user_id);
  SELECT count(*) INTO m FROM tmp_baseline_links b
   WHERE b.alias_user_id <> v_alias
     AND NOT EXISTS (SELECT 1 FROM public.user_account_links l
                      WHERE l.alias_user_id = b.alias_user_id
                        AND l.primary_user_id = b.primary_user_id);
  IF n <> 0 OR m <> 0 THEN RAISE EXCEPTION 'V8: vinculos de outros usuarios alterados'; END IF;

  -- 9) idempotência: repetir vínculo e desativação não gera efeito novo
  --    (sem ON CONFLICT DO UPDATE: nunca troca o titular silenciosamente)
  INSERT INTO public.user_account_links (alias_user_id, primary_user_id, pm_registration, reason, created_by)
  VALUES (v_alias, v_primary, 'PM2064', 'reexecucao', auth.uid())
  ON CONFLICT (alias_user_id) DO NOTHING;
  SELECT count(*) INTO n FROM public.user_account_links WHERE alias_user_id = v_alias;
  IF n <> 1 THEN RAISE EXCEPTION 'V9: vinculo duplicado na reexecucao'; END IF;
  IF (SELECT primary_user_id FROM public.user_account_links WHERE alias_user_id = v_alias) <> v_primary THEN
    RAISE EXCEPTION 'V9: titular do alias mudou na reexecucao';
  END IF;
  UPDATE public.profiles SET employment_status = 'inactive'
   WHERE user_id = v_alias AND employment_status <> 'inactive';
  IF (SELECT count(*) FROM public.profiles WHERE user_id = v_alias) <> 1 THEN
    RAISE EXCEPTION 'V9: perfil antigo duplicado/removido';
  END IF;

  -- V17) Filial Ativa preservada (independente de sessão; roda dentro da transação).
  IF (SELECT filial_id FROM public.profiles WHERE user_id = v_primary)
     IS DISTINCT FROM (SELECT filial_id FROM tmp_baseline_profiles WHERE user_id = v_primary) THEN
    RAISE EXCEPTION 'V17: filial do titular foi alterada';
  END IF;
  SELECT count(*) INTO n FROM public.user_filiais
   WHERE user_id IN (v_alias, v_primary) AND active;
  SELECT c INTO m FROM tmp_baseline WHERE tmp_baseline.k = 'filiais_isac';
  IF n <> m THEN RAISE EXCEPTION 'V17: vinculos de filial adicionais alterados (% vs %)', n, m; END IF;

  RAISE NOTICE 'TODAS AS VALIDACOES PASSARAM';

END $$;

COMMIT;  -- (qualquer RAISE acima aborta a transação => ROLLBACK integral)

-- ============ [F] VALIDAÇÕES DE LEITURA DAS TELAS (APÓS O COMMIT)
-- Exigem sessão administrativa autenticada; NÃO fazem parte da transação acima.
-- Executar exatamente como na simulação. Divergência => informar antes de bloquear o login.

DO $$
DECLARE
  v_alias   uuid := '513dcb05-eab7-4d5c-acfd-d6b1f9bf9ce4';
  v_primary uuid := '04884288-d6bc-4f40-9857-519abae62605';
  n int; m int; k int; b int;
  nv numeric; mv numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'F: sem sessao autenticada — validacoes de leitura ignoradas';
    RETURN;
  END IF;

  -- V10) filtro de consultor em get_performance_by_seller_v2:
  --      alias e titular devem retornar EXATAMENTE o mesmo consolidado.
  SELECT COALESCE(sum(total_activities),0), COALESCE(sum(visitas),0), COALESCE(sum(ligacoes),0)
    INTO n, m, k FROM public.get_performance_by_seller_v2(NULL, NULL, NULL, v_primary);
  SELECT COALESCE(sum(total_activities),0) INTO b
    FROM public.get_performance_by_seller_v2(NULL, NULL, NULL, v_alias);
  IF n <> b THEN
    RAISE EXCEPTION 'V10: filtro pela conta antiga (%) difere do titular (%)', b, n;
  END IF;
  SELECT count(*) INTO b FROM public.task_followups
   WHERE responsible_user_id IN (v_alias, v_primary);
  IF n <> b THEN RAISE EXCEPTION 'V10: atividades consolidadas % <> soma das contas %', n, b; END IF;
  IF (m + k) <> n THEN
    RAISE EXCEPTION 'V10: % atividades <> % visitas + % ligacoes (outros tipos presentes)', n, m, k;
  END IF;
  RAISE NOTICE 'V10 OK — Isac consolidado: % atividades = % visitas + % ligacoes', n, m, k;
  SELECT count(*) INTO b FROM public.get_performance_by_seller_v2(NULL, NULL, NULL, v_primary)
   WHERE responsible_user_id = v_alias;
  IF b <> 0 THEN RAISE EXCEPTION 'V10: conta antiga ainda aparece como linha propria'; END IF;

  -- V11) vendas sem multiplicação por follow-up: contagem = tarefas distintas.
  SELECT COALESCE(sum(sales_total_count),0), COALESCE(sum(sales_partial_count),0)
    INTO n, m FROM public.get_performance_by_seller_v2(NULL, NULL, NULL, v_primary);
  SELECT count(DISTINCT t.id) FILTER (WHERE t.sales_confirmed AND t.sales_type = 'ganho'),
         count(DISTINCT t.id) FILTER (WHERE t.sales_confirmed AND t.sales_type = 'parcial')
    INTO k, b
    FROM public.tasks t
   WHERE t.id IN (SELECT tf.task_id FROM public.task_followups tf
                   WHERE tf.responsible_user_id IN (v_alias, v_primary));
  IF n <> k OR m <> b THEN
    RAISE EXCEPTION 'V11: vendas multiplicadas (total %/% , parcial %/%)', n, k, m, b;
  END IF;

  -- V12) ANÁLISE GERENCIAL > RESUMO POR VENDEDOR: 1 linha, sem alias, clientes únicos.
  SELECT count(*) INTO b FROM public.get_management_seller_summary(NULL, NULL, NULL, NULL, v_alias, NULL);
  SELECT count(*) INTO n FROM public.get_management_seller_summary(NULL, NULL, NULL, NULL, v_primary, NULL);
  IF n <> b THEN RAISE EXCEPTION 'V12: resumo por vendedor difere entre alias e titular'; END IF;
  IF n <> 1 THEN RAISE EXCEPTION 'V12: esperado 1 linha do Isac no resumo, encontrado %', n; END IF;
  SELECT count(*) INTO b FROM public.get_management_seller_summary(NULL, NULL, NULL, NULL, NULL, NULL)
   WHERE seller_id = v_alias;
  IF b <> 0 THEN RAISE EXCEPTION 'V12: conta antiga gera segunda linha no resumo'; END IF;
  SELECT total_atividades, clientes_atendidos INTO n, m
    FROM public.get_management_seller_summary(NULL, NULL, NULL, NULL, v_primary, NULL);
  SELECT count(*), count(DISTINCT COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))))
    INTO k, b FROM public.task_followups tf
   WHERE tf.responsible_user_id IN (v_alias, v_primary);
  IF n <> k THEN RAISE EXCEPTION 'V12: atividades do resumo % <> soma das contas %', n, k; END IF;
  IF m <> b THEN RAISE EXCEPTION 'V12: clientes unicos % <> distintos reais % (soma indevida)', m, b; END IF;
  RAISE NOTICE 'V12 OK — resumo: 1 linha, % atividades, % clientes unicos', n, m;

  -- V13) ANÁLISE GERENCIAL > DETALHE POR CLIENTE: sem alias, cliente individualizado.
  SELECT count(*) INTO b FROM public.get_management_client_details(NULL, NULL, NULL, NULL, NULL, NULL)
   WHERE seller_id = v_alias;
  IF b <> 0 THEN RAISE EXCEPTION 'V13: conta antiga gera linhas no detalhe por cliente'; END IF;
  SELECT COALESCE(sum(total_atividades),0), count(*) INTO n, m
    FROM public.get_management_client_details(NULL, NULL, NULL, NULL, v_primary, NULL);
  SELECT count(*), count(DISTINCT COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))))
    INTO k, b FROM public.task_followups tf
   WHERE tf.responsible_user_id IN (v_alias, v_primary);
  IF n <> k THEN RAISE EXCEPTION 'V13: atividades do detalhe % <> soma das contas %', n, k; END IF;
  IF m <> b THEN RAISE EXCEPTION 'V13: % linhas de cliente <> % clientes distintos', m, b; END IF;
  SELECT count(*) INTO b FROM public.get_management_client_details(NULL, NULL, NULL, NULL, v_alias, NULL);
  IF b <> m THEN RAISE EXCEPTION 'V13: detalhe por cliente difere entre alias e titular'; END IF;

  -- V14) OPORTUNIDADES DE SERVIÇO > RESUMO POR CRIADOR: alias não gera linha.
  SELECT count(*) INTO b FROM jsonb_array_elements(
      (public.get_service_opportunities_summary(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)) -> 'by_seller') e
   WHERE (e ->> 'seller_id')::uuid = v_alias;
  IF b <> 0 THEN RAISE EXCEPTION 'V14: conta antiga gera segunda linha em Oportunidades de Servico'; END IF;
  SELECT count(*) INTO b FROM jsonb_array_elements(
      (public.get_service_opportunities_summary(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)) -> 'by_seller') e
   WHERE (e ->> 'seller_id')::uuid = v_primary;
  IF b > 1 THEN RAISE EXCEPTION 'V14: Isac aparece % vezes em Oportunidades de Servico', b; END IF;
  SELECT (public.get_service_opportunities_summary(NULL,NULL,NULL,NULL,v_alias,NULL,NULL,NULL,NULL)) -> 'kpis' ->> 'oportunidades',
         (public.get_service_opportunities_summary(NULL,NULL,NULL,NULL,v_primary,NULL,NULL,NULL,NULL)) -> 'kpis' ->> 'oportunidades'
    INTO n, m;
  IF COALESCE(n,0) <> COALESCE(m,0) THEN
    RAISE EXCEPTION 'V14: filtro por alias (%) difere do titular (%)', n, m;
  END IF;

  -- V15) versão antiga do relatório por vendedor: alias ausente, titular único.
  SELECT count(*) INTO b FROM public.get_performance_by_seller(NULL, NULL) WHERE user_id = v_alias;
  IF b <> 0 THEN RAISE EXCEPTION 'V15: relatorio antigo ainda lista a conta antiga'; END IF;
  SELECT count(*) INTO b FROM public.get_performance_by_seller(NULL, NULL) WHERE user_id = v_primary;
  IF b > 1 THEN RAISE EXCEPTION 'V15: relatorio antigo duplica o Isac (% linhas)', b; END IF;

  -- V16) agendamentos, POPS (Large/Small), validações e treinamentos consolidados.
  SELECT count(*) INTO n FROM public.visit_schedules
   WHERE public.resolve_primary_user_id(seller_id) = v_primary;
  RAISE NOTICE 'V16 OK — agendamentos consolidados: %', n;
  SELECT count(*),
         count(*) FILTER (WHERE upper(btrim(coalesce(pops_platform,''))) = 'LARGE'),
         count(*) FILTER (WHERE upper(btrim(coalesce(pops_platform,''))) = 'SMALL')
    INTO n, m, k FROM public.pops_machines
   WHERE public.resolve_primary_user_id(executed_by) = v_primary;
  IF (m + k) <> n THEN
    RAISE EXCEPTION 'V16: % POPS <> % Large + % Small (plataforma ausente)', n, m, k;
  END IF;
  RAISE NOTICE 'V16 OK — POPS consolidados: % = % Large + % Small', n, m, k;
  SELECT count(*) INTO n FROM public.get_equipment_validators(NULL) WHERE user_id = v_alias;
  IF n <> 0 THEN RAISE EXCEPTION 'V16: conta antiga ainda aparece como validadora'; END IF;
  SELECT COALESCE(sum(validated_count),0) INTO n
    FROM public.get_equipment_validators(NULL) WHERE user_id = v_primary;
  SELECT count(*) INTO m FROM public.client_equipment WHERE validated_by IN (v_alias, v_primary);
  IF n <> m THEN RAISE EXCEPTION 'V16: validacoes % <> soma das contas %', n, m; END IF;
  RAISE NOTICE 'V16 OK — maquinas validadas: %', n;
  SELECT count(*) INTO n FROM public.trainings
   WHERE public.resolve_primary_user_id(user_id) = v_primary;
  RAISE NOTICE 'V16 OK — treinamentos consolidados: %', n;

  -- V17) Filial Ativa preservada: identidade não altera filial/vínculos do titular.
  IF (SELECT filial_id FROM public.profiles WHERE user_id = v_primary)
     IS DISTINCT FROM (SELECT filial_id FROM tmp_baseline_profiles WHERE user_id = v_primary) THEN
    RAISE EXCEPTION 'V17: filial do titular foi alterada';
  END IF;
  SELECT count(*) INTO n FROM public.user_filiais
   WHERE user_id IN (v_alias, v_primary) AND active;
  SELECT c INTO m FROM tmp_baseline WHERE tmp_baseline.k = 'filiais_isac';
  IF n <> m THEN RAISE EXCEPTION 'V17: vinculos de filial adicionais alterados (% vs %)', n, m; END IF;

  RAISE NOTICE 'TODAS AS VALIDACOES DE LEITURA PASSARAM';
END $$;

COMMIT;  -- (qualquer RAISE acima aborta a transação => ROLLBACK automático)

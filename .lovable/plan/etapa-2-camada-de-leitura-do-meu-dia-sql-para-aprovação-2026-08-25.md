# Etapa 2 — Camada de leitura do "Meu Dia" (SQL para aprovação)

Escopo: criar apenas `public.get_my_day_summary()` e `public.get_my_day_details(...)`, com grants/revokes.
Nenhuma tabela, RLS, dado ou arquivo de frontend é alterado. Nenhum índice novo (justificado adiante).

## 1. SQL completo

```sql
-- =========================================================
-- HELPER INTERNO: contexto do usuário (cargo + datas locais)
-- Reutiliza get_user_role() (mesma prioridade já existente).
-- =========================================================
CREATE OR REPLACE FUNCTION public.my_day_context()
RETURNS TABLE (
  user_id     uuid,
  role        text,
  today       date,
  week_start  date,
  week_end    date,
  is_weekend  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_today date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_uid
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não aprovado ou inativo'
      USING ERRCODE = '42501';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  RETURN QUERY
  SELECT
    v_uid,
    public.get_user_role(),
    v_today,
    (v_today - ((EXTRACT(ISODOW FROM v_today)::int - 1)))::date,          -- segunda
    (v_today - ((EXTRACT(ISODOW FROM v_today)::int - 1)) + 6)::date,      -- domingo
    EXTRACT(ISODOW FROM v_today)::int >= 6;
END;
$$;

-- =========================================================
-- RPC PRINCIPAL
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_my_day_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c              record;
  -- metas
  g_vis          record;
  g_lig          record;
  -- realizados
  v_vis_done     integer := 0;
  v_lig_done     integer := 0;
  -- metas efetivas
  v_vis_target   integer;
  v_lig_target   integer;
  v_result       jsonb;
  v_sched        jsonb;
  v_ret          jsonb;
  v_trn          jsonb;
  v_tasks        jsonb;
BEGIN
  SELECT * INTO c FROM public.my_day_context();

  -- ---------- METAS (única fonte: activity_goal_settings) ----------
  SELECT target_value, period_type, weekdays_only
    INTO g_vis
  FROM public.activity_goal_settings
  WHERE active
    AND activity_type = 'visita'
    AND role::text = c.role;

  SELECT target_value, period_type, weekdays_only
    INTO g_lig
  FROM public.activity_goal_settings
  WHERE active
    AND activity_type = 'ligacao'
    AND role::text = c.role;

  -- ---------- VISITAS REALIZADAS ----------
  IF g_vis.period_type = 'weekly' THEN
    SELECT count(*)::int INTO v_vis_done
    FROM public.tasks t
    WHERE t.created_by = c.user_id
      AND t.task_type IN ('visita', 'technical_visit')
      AND t.start_date >= c.week_start
      AND t.start_date <= c.today;
  ELSE
    SELECT count(*)::int INTO v_vis_done
    FROM public.tasks t
    WHERE t.created_by = c.user_id
      AND t.task_type IN ('visita', 'technical_visit')
      AND t.start_date = c.today;
  END IF;

  -- ---------- LIGAÇÕES/PROSPECÇÕES REALIZADAS (sempre hoje) ----------
  SELECT count(*)::int INTO v_lig_done
  FROM public.tasks t
  WHERE t.created_by = c.user_id
    AND t.task_type IN ('ligacao', 'prospection')
    AND t.start_date = c.today;

  -- ---------- META EFETIVA (weekdays_only) ----------
  v_vis_target := CASE
    WHEN g_vis.target_value IS NULL THEN NULL
    WHEN g_vis.weekdays_only AND c.is_weekend THEN 0
    ELSE g_vis.target_value
  END;

  v_lig_target := CASE
    WHEN g_lig.target_value IS NULL THEN NULL
    WHEN g_lig.weekdays_only AND c.is_weekend THEN 0
    ELSE g_lig.target_value
  END;

  -- ---------- PROGRAMAÇÃO DE VISITAS ----------
  WITH s AS (
    SELECT vs.id, vs.planned_date, vs.client_name, vs.client_code, vs.observation,
           CASE
             WHEN vs.planned_date <  c.today THEN 'overdue'
             WHEN vs.planned_date =  c.today THEN 'today'
             ELSE 'upcoming'
           END AS bucket
    FROM public.visit_schedules vs
    WHERE vs.seller_id = c.user_id
      AND vs.status = 'planejado'
      AND vs.planned_date <= c.today + 7
  ), ranked AS (
    SELECT s.*, row_number() OVER (PARTITION BY bucket ORDER BY planned_date, client_name) AS rn
    FROM s
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY planned_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY planned_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY planned_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_sched
  FROM (
    SELECT bucket, planned_date, rn,
           jsonb_build_object('id', id, 'planned_date', planned_date,
                              'client_name', client_name, 'client_code', client_code,
                              'observation', left(COALESCE(observation, ''), 160)) AS item
    FROM ranked
  ) x;

  -- ---------- RETORNOS ----------
  WITH r AS (
    SELECT f.id, f.client_name, f.client_code, f.next_return_date, f.return_notes, f.filial_id,
           CASE
             WHEN f.next_return_date <  c.today THEN 'overdue'
             WHEN f.next_return_date =  c.today THEN 'today'
             ELSE 'upcoming'
           END AS bucket
    FROM public.task_followups f
    WHERE f.responsible_user_id = c.user_id
      AND f.followup_status = 'pendente'
      AND f.next_return_date IS NOT NULL
      AND f.next_return_date <= c.today + 7
  ), ranked AS (
    SELECT r.*, row_number() OVER (PARTITION BY bucket ORDER BY next_return_date, client_name) AS rn
    FROM r
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY next_return_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY next_return_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY next_return_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_ret
  FROM (
    SELECT bucket, next_return_date, rn,
           jsonb_build_object('id', id, 'client_name', client_name, 'client_code', client_code,
                              'next_return_date', next_return_date, 'filial_id', filial_id,
                              'notes', left(COALESCE(return_notes, ''), 160)) AS item
    FROM ranked
  ) x;

  -- ---------- TREINAMENTOS ----------
  WITH t AS (
    SELECT tr.id, tr.name, tr.training_date, tr.training_time, tr.hours,
           CASE
             WHEN tr.training_date <  c.today THEN 'overdue'
             WHEN tr.training_date =  c.today THEN 'today'
             ELSE 'upcoming'
           END AS bucket
    FROM public.trainings tr
    WHERE tr.user_id = c.user_id
      AND tr.status = 'pendente'
      AND tr.training_date <= c.today + 30
  ), ranked AS (
    SELECT t.*, row_number() OVER (PARTITION BY bucket ORDER BY training_date, training_time) AS rn
    FROM t
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY training_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY training_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY training_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_trn
  FROM (
    SELECT bucket, training_date, rn,
           jsonb_build_object('id', id, 'name', name, 'training_date', training_date,
                              'training_time', training_time, 'hours', hours) AS item
    FROM ranked
  ) x;

  -- ---------- ATIVIDADES ABERTAS (bucket único, prioridade fixa) ----------
  WITH a AS (
    SELECT t.id, t.task_type, t.client, t.clientcode, t.name,
           t.start_date, t.end_date, t.next_action_date,
           CASE
             WHEN t.end_date IS NOT NULL AND t.end_date < c.today THEN 'overdue'
             WHEN t.start_date = c.today OR t.end_date = c.today OR t.next_action_date = c.today THEN 'today'
             WHEN t.start_date > c.today AND t.start_date <= c.today + 7 THEN 'upcoming'
             ELSE NULL
           END AS bucket
    FROM public.tasks t
    WHERE t.created_by = c.user_id
      AND t.status = 'pending'
  ), f AS (
    SELECT * FROM a WHERE bucket IS NOT NULL
  ), ranked AS (
    SELECT f.*, row_number() OVER (PARTITION BY bucket ORDER BY COALESCE(end_date, start_date), start_date) AS rn
    FROM f
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY ord) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY ord) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY ord) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_tasks
  FROM (
    SELECT bucket, rn, COALESCE(end_date, start_date) AS ord,
           jsonb_build_object('id', id, 'task_type', task_type, 'client', client,
                              'clientcode', clientcode, 'title', name,
                              'start_date', start_date, 'end_date', end_date,
                              'next_action_date', next_action_date) AS item
    FROM ranked
  ) x;

  -- ---------- MONTAGEM ----------
  v_result := jsonb_build_object(
    'user', jsonb_build_object(
      'user_id',    c.user_id,
      'role',       c.role,
      'today',      c.today,
      'week_start', c.week_start,
      'week_end',   c.week_end,
      'is_weekend', c.is_weekend
    ),
    'goals', jsonb_build_object(
      'visitas', jsonb_build_object(
        'meta',           v_vis_target,
        'realizado',      v_vis_done,
        'faltam',         CASE WHEN v_vis_target IS NULL THEN NULL ELSE GREATEST(v_vis_target - v_vis_done, 0) END,
        'atingida',       CASE WHEN v_vis_target IS NULL THEN NULL ELSE (v_vis_done >= v_vis_target) END,
        'period_type',    g_vis.period_type,
        'weekdays_only',  g_vis.weekdays_only,
        'sem_meta_hoje',  COALESCE(g_vis.weekdays_only AND c.is_weekend, false)
      ),
      'ligacoes', jsonb_build_object(
        'meta',           v_lig_target,
        'realizado',      v_lig_done,
        'faltam',         CASE WHEN v_lig_target IS NULL THEN NULL ELSE GREATEST(v_lig_target - v_lig_done, 0) END,
        'atingida',       CASE WHEN v_lig_target IS NULL THEN NULL ELSE (v_lig_done >= v_lig_target) END,
        'period_type',    g_lig.period_type,
        'weekdays_only',  g_lig.weekdays_only,
        'sem_meta_hoje',  COALESCE(g_lig.weekdays_only AND c.is_weekend, false)
      )
    ),
    'visit_schedules', v_sched,
    'returns',         v_ret,
    'trainings',       v_trn,
    'open_tasks',      v_tasks
  );

  RETURN v_result;
END;
$$;

-- =========================================================
-- RPC DE DETALHES (paginada)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_my_day_details(
  p_block  text,
  p_bucket text,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total  integer := 0;
  v_items  jsonb   := '[]'::jsonb;
BEGIN
  IF p_block NOT IN ('visit_schedules', 'returns', 'trainings', 'open_tasks') THEN
    RAISE EXCEPTION 'p_block inválido: %', p_block USING ERRCODE = '22023';
  END IF;

  IF p_bucket NOT IN ('overdue', 'today', 'upcoming') THEN
    RAISE EXCEPTION 'p_bucket inválido: %', p_bucket USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.my_day_context();

  IF p_block = 'visit_schedules' THEN
    WITH s AS (
      SELECT vs.id, vs.planned_date, vs.client_name, vs.client_code, vs.observation
      FROM public.visit_schedules vs
      WHERE vs.seller_id = c.user_id
        AND vs.status = 'planejado'
        AND (
          (p_bucket = 'overdue'  AND vs.planned_date <  c.today) OR
          (p_bucket = 'today'    AND vs.planned_date =  c.today) OR
          (p_bucket = 'upcoming' AND vs.planned_date >  c.today AND vs.planned_date <= c.today + 7)
        )
    ), cnt AS (SELECT count(*)::int n FROM s),
    page AS (
      SELECT * FROM s ORDER BY planned_date, client_name LIMIT v_limit OFFSET v_offset
    )
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'planned_date', planned_date, 'client_name', client_name,
              'client_code', client_code, 'observation', left(COALESCE(observation,''),160)
            ) ORDER BY planned_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;

  ELSIF p_block = 'returns' THEN
    WITH r AS (
      SELECT f.id, f.client_name, f.client_code, f.next_return_date, f.return_notes, f.filial_id
      FROM public.task_followups f
      WHERE f.responsible_user_id = c.user_id
        AND f.followup_status = 'pendente'
        AND f.next_return_date IS NOT NULL
        AND (
          (p_bucket = 'overdue'  AND f.next_return_date <  c.today) OR
          (p_bucket = 'today'    AND f.next_return_date =  c.today) OR
          (p_bucket = 'upcoming' AND f.next_return_date >  c.today AND f.next_return_date <= c.today + 7)
        )
    ), cnt AS (SELECT count(*)::int n FROM r),
    page AS (
      SELECT * FROM r ORDER BY next_return_date, client_name LIMIT v_limit OFFSET v_offset
    )
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'client_name', client_name, 'client_code', client_code,
              'next_return_date', next_return_date, 'filial_id', filial_id,
              'notes', left(COALESCE(return_notes,''),160)
            ) ORDER BY next_return_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;

  ELSIF p_block = 'trainings' THEN
    WITH t AS (
      SELECT tr.id, tr.name, tr.training_date, tr.training_time, tr.hours
      FROM public.trainings tr
      WHERE tr.user_id = c.user_id
        AND tr.status = 'pendente'
        AND (
          (p_bucket = 'overdue'  AND tr.training_date <  c.today) OR
          (p_bucket = 'today'    AND tr.training_date =  c.today) OR
          (p_bucket = 'upcoming' AND tr.training_date >  c.today AND tr.training_date <= c.today + 30)
        )
    ), cnt AS (SELECT count(*)::int n FROM t),
    page AS (
      SELECT * FROM t ORDER BY training_date, training_time LIMIT v_limit OFFSET v_offset
    )
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'name', name, 'training_date', training_date,
              'training_time', training_time, 'hours', hours
            ) ORDER BY training_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;

  ELSE -- open_tasks
    WITH a AS (
      SELECT t.id, t.task_type, t.client, t.clientcode, t.name,
             t.start_date, t.end_date, t.next_action_date,
             CASE
               WHEN t.end_date IS NOT NULL AND t.end_date < c.today THEN 'overdue'
               WHEN t.start_date = c.today OR t.end_date = c.today OR t.next_action_date = c.today THEN 'today'
               WHEN t.start_date > c.today AND t.start_date <= c.today + 7 THEN 'upcoming'
               ELSE NULL
             END AS bucket
      FROM public.tasks t
      WHERE t.created_by = c.user_id
        AND t.status = 'pending'
    ), f AS (
      SELECT * FROM a WHERE bucket = p_bucket
    ), cnt AS (SELECT count(*)::int n FROM f),
    page AS (
      SELECT * FROM f ORDER BY COALESCE(end_date, start_date), start_date LIMIT v_limit OFFSET v_offset
    )
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'task_type', task_type, 'client', client, 'clientcode', clientcode,
              'title', name, 'start_date', start_date, 'end_date', end_date,
              'next_action_date', next_action_date
            ) ORDER BY COALESCE(end_date, start_date)) FROM page), '[]'::jsonb)
      INTO v_total, v_items;
  END IF;

  RETURN jsonb_build_object(
    'block', p_block,
    'bucket', p_bucket,
    'today', c.today,
    'limit', v_limit,
    'offset', v_offset,
    'total_count', v_total,
    'items', v_items
  );
END;
$$;

-- =========================================================
-- PERMISSÕES
-- =========================================================
REVOKE ALL ON FUNCTION public.my_day_context()                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_day_summary()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_day_details(text, text, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_day_summary()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_day_details(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_day_context()                              TO authenticated, service_role;
```

## 2. Estrutura final do JSON

`get_my_day_summary()`:

```text
user            -> user_id, role, today, week_start, week_end, is_weekend
goals.visitas   -> meta, realizado, faltam, atingida, period_type, weekdays_only, sem_meta_hoje
goals.ligacoes  -> idem
visit_schedules -> overdue_count, today_count, upcoming_count,
                   overdue_preview[], today_preview[], upcoming_preview[]   (max 5 cada)
returns         -> mesma forma
trainings       -> mesma forma
open_tasks      -> mesma forma
```

`get_my_day_details(...)`: `block, bucket, today, limit, offset, total_count, items[]`.

## 3. Como cada contagem é calculada

| Bloco | Filtro do usuário | Base de pendência | Atrasado | Hoje | Próximos |
|---|---|---|---|---|---|
| Programação | `seller_id = auth.uid()` | `status='planejado'` | `planned_date < hoje` | `= hoje` | `> hoje e <= hoje+7` |
| Retornos | `responsible_user_id = auth.uid()` | `followup_status='pendente'` e `next_return_date` não nulo | `< hoje` | `= hoje` | `> hoje e <= hoje+7` |
| Treinamentos | `user_id = auth.uid()` | `status='pendente'` | `training_date < hoje` | `= hoje` | `> hoje e <= hoje+30` |
| Atividades | `created_by = auth.uid()` | `status='pending'` | `end_date < hoje` | `start_date/end_date/next_action_date = hoje` | `start_date > hoje e <= hoje+7` |

Contagens e previews saem da mesma varredura (uma passagem por bloco, sem `count exact` separado).

## 4. Leitura das metas

Somente `public.activity_goal_settings`, filtrando `active = true`, `role = cargo primário`, `activity_type = 'visita' | 'ligacao'`. A `UNIQUE (role, activity_type)` garante linha única. Nenhum valor de meta existe dentro da função. Sem linha ativa: `meta = null`, `faltam = null`, `atingida = null` e `realizado` normal.

Visitas: `period_type='weekly'` conta de `week_start` até `hoje`; `daily` conta apenas hoje. Ligações: sempre hoje (regra atual é diária).

## 5. Sábado/domingo para RAC/CPA/CSA

Com `weekdays_only = true` e `is_weekend = true` (ISODOW 6 ou 7): `meta = 0`, `atingida = true`, `faltam = 0` e `sem_meta_hoje = true`. O frontend exibe "sem meta hoje" e nada é tratado como atraso, pois não há déficit.

## 6. Não duplicação de atividades

Um único `CASE` sequencial define o bucket por atividade: atrasada → hoje → próxima. Como o `CASE` para no primeiro match, cada tarefa aparece em exatamente um bucket. A `get_my_day_details` usa o mesmo `CASE` e filtra `bucket = p_bucket`, garantindo aderência 1:1 com o resumo.

## 7. Permissões

- Três funções `SECURITY DEFINER`, `STABLE`, apenas leitura (nenhum DML).
- `REVOKE` de `PUBLIC` e `anon`; `EXECUTE` para `authenticated` e `service_role`.
- Validação no início: `auth.uid()` obrigatório e perfil `approved` + `active`, caso contrário erro `42501`.
- Todos os filtros são pelo próprio `auth.uid()`. Admin/manager/supervisor veem apenas suas próprias pendências. Nenhuma visão de time.

## 8. EXPLAIN ANALYZE (consultas equivalentes já medidas)

- Visitas do usuário em `tasks`: Index Scan em `idx_tasks_created_by_created_at` — Execution Time **0,088 ms**.
- Programação: `idx_visit_schedules_seller_date` cobre `seller_id + planned_date`.
- Retornos: `idx_task_followups_responsible` / `idx_task_followups_next_return` cobrem o filtro.
- Treinamentos: `idx_trainings_user_id` + `idx_trainings_status`.

Somatório estimado bem abaixo dos 300 ms. Após aplicar, rodarei `EXPLAIN ANALYZE` na RPC real e reportarei os tempos.

## 9. Índices

Nenhum índice novo nesta etapa. Todos os acessos já usam índices existentes por usuário/data. Se o `EXPLAIN ANALYZE` pós-aplicação mostrar seq scan relevante em `tasks` para `status='pending'`, proporei então um índice parcial `(created_by, status)` — só com ganho comprovado.

## 10. Riscos identificados

1. `get_user_role()` pode retornar `'none'` (usuário sem linha em `user_roles`). Por isso a comparação de cargo é feita como `role::text = c.role`, evitando erro de cast para `app_role`; nesse caso simplesmente não há meta.
2. `next_action_date` no bucket "hoje" pode incluir tarefas com `start_date` futuro — comportamento intencional conforme a regra 9.
3. Atividades `pending` sem `end_date` e com `start_date` passado não entram em nenhum bucket (a regra de atraso é baseada em `end_date`).
4. `SECURITY DEFINER` ignora RLS por definição; o escopo é garantido pelos filtros por `auth.uid()` dentro das funções.
5. Tarefas do tipo `checklist` não contam para metas de visita nem de ligação, conforme a especificação.

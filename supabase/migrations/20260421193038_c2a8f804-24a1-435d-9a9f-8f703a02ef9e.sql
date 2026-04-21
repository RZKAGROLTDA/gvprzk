
-- 1) Recriar índice único SEM predicado parcial
DROP INDEX IF EXISTS public.uq_task_followups_task_id;
CREATE UNIQUE INDEX uq_task_followups_task_id
  ON public.task_followups (task_id);

-- 2) Backfill das tasks elegíveis criadas hoje sem followup
INSERT INTO public.task_followups (
  task_id, client_name, client_code, activity_type, activity_date,
  responsible_user_id, created_by, filial_id, notes, followup_status, priority
)
SELECT
  t.id, t.client, t.clientcode,
  public.map_task_type_to_followup_activity(t.task_type),
  COALESCE(t.created_at, now()),
  t.created_by, t.created_by,
  (SELECT id FROM public.filiais WHERE lower(nome) = lower(t.filial) LIMIT 1),
  t.observations,
  public.map_task_status_to_followup_status(t.status),
  'media'::public.followup_priority
FROM public.tasks t
LEFT JOIN public.task_followups tf ON tf.task_id = t.id
WHERE tf.id IS NULL
  AND t.task_type IN ('prospection','ligacao','checklist')
  AND t.created_at >= '2026-04-21 00:00:00+00';

-- 3) Limpeza do diagnóstico
DROP TABLE IF EXISTS public.diag_results;
DROP FUNCTION IF EXISTS public.diag_try_followup_insert(uuid);

WITH eligible AS (
  SELECT
    t.id              AS task_id,
    t.client          AS client_name,
    t.clientcode      AS client_code,
    t.task_type,
    t.sales_type,
    t.status,
    t.observations,
    t.created_by,
    t.filial,
    COALESCE(t.created_at, now())                AS activity_date,
    COALESCE(t.created_at, now())::date          AS activity_day,
    public.map_task_type_to_followup_activity(t.task_type) AS activity_type
  FROM public.tasks t
  WHERE t.task_type IN ('prospection','ligacao','checklist')
    AND COALESCE(t.created_at, now()) >= (now() - interval '30 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.task_followups f WHERE f.task_id = t.id
    )
),
resolved AS (
  SELECT
    e.*,
    (SELECT id FROM public.filiais
       WHERE lower(nome) = lower(e.filial) LIMIT 1) AS filial_id,
    CASE
      WHEN lower(coalesce(e.sales_type,'')) = 'ganho'    THEN 'concluido'::public.followup_status
      WHEN lower(coalesce(e.sales_type,'')) = 'perdido'  THEN 'cancelado'::public.followup_status
      WHEN lower(coalesce(e.sales_type,'')) IN ('prospect','parcial') THEN 'pendente'::public.followup_status
      ELSE public.map_task_status_to_followup_status(e.status)
    END AS followup_status,
    CASE
      WHEN lower(coalesce(e.sales_type,'')) IN ('ganho','perdido') THEN NULL::date
      WHEN lower(coalesce(e.sales_type,'')) = 'prospect'
           AND e.activity_day >= (now()::date - 7)
        THEN e.activity_day + CASE lower(e.task_type)
                                WHEN 'ligacao'     THEN 2
                                WHEN 'checklist'   THEN 3
                                WHEN 'prospection' THEN 5
                                ELSE 5
                              END
      WHEN lower(coalesce(e.sales_type,'')) = 'parcial'
           AND e.activity_day >= (now()::date - 7)
        THEN e.activity_day + 3
      ELSE NULL::date
    END AS next_return_date
  FROM eligible e
)
INSERT INTO public.task_followups (
  task_id, client_name, client_code, activity_type, activity_date,
  responsible_user_id, created_by, filial_id, notes,
  followup_status, priority, next_return_date
)
SELECT
  r.task_id,
  r.client_name,
  r.client_code,
  r.activity_type,
  r.activity_date,
  r.created_by,
  r.created_by,
  r.filial_id,
  r.observations,
  r.followup_status,
  'media'::public.followup_priority,
  r.next_return_date
FROM resolved r
WHERE r.activity_type IS NOT NULL
ON CONFLICT (task_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.get_weekly_followups_agenda(
  p_start_date date,
  p_end_date date,
  p_responsible_user_id uuid DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL
)
RETURNS TABLE (
  day date,
  total_activities bigint,
  visitas bigint,
  ligacoes bigint,
  checklists bigint,
  unique_clients bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date AS day
  ),
  filtered AS (
    SELECT *
    FROM public.task_followups f
    WHERE f.activity_date >= p_start_date
      AND f.activity_date <= p_end_date
      AND (p_responsible_user_id IS NULL OR f.responsible_user_id = p_responsible_user_id)
      AND (p_filial_id IS NULL OR f.filial_id = p_filial_id)
  )
  SELECT
    d.day,
    COUNT(f.id)::bigint AS total_activities,
    COUNT(f.id) FILTER (WHERE f.activity_type = 'visita')::bigint AS visitas,
    COUNT(f.id) FILTER (WHERE f.activity_type = 'ligacao')::bigint AS ligacoes,
    COUNT(f.id) FILTER (WHERE f.activity_type = 'checklist')::bigint AS checklists,
    COUNT(DISTINCT COALESCE(
      NULLIF(LOWER(TRIM(f.client_code)), ''),
      LOWER(TRIM(f.client_name))
    ))::bigint AS unique_clients
  FROM days d
  LEFT JOIN filtered f
    ON f.activity_date = d.day
  GROUP BY d.day
  ORDER BY d.day;
$$;
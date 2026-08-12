ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';

ALTER TABLE public.trainings
  DROP CONSTRAINT IF EXISTS trainings_status_check;

ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_status_check
  CHECK (status IN ('pendente', 'realizado', 'nao_realizado'));

CREATE INDEX IF NOT EXISTS idx_trainings_status ON public.trainings(status);

CREATE OR REPLACE FUNCTION public.get_trainings_stats(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT t.status, t.hours, t.user_id
    FROM public.trainings t
    WHERE (p_start_date IS NULL OR t.training_date >= p_start_date)
      AND (p_end_date IS NULL OR t.training_date <= p_end_date)
      AND (p_user_id IS NULL OR t.user_id = p_user_id)
      AND (p_filial_id IS NULL OR t.filial_id = p_filial_id)
      AND (p_status IS NULL OR t.status = p_status)
  )
  SELECT jsonb_build_object(
    'scheduled_count', COUNT(*),
    'done_count', COUNT(*) FILTER (WHERE status = 'realizado'),
    'pending_count', COUNT(*) FILTER (WHERE status = 'pendente'),
    'not_done_count', COUNT(*) FILTER (WHERE status = 'nao_realizado'),
    'scheduled_hours', COALESCE(SUM(hours), 0),
    'done_hours', COALESCE(SUM(hours) FILTER (WHERE status = 'realizado'), 0),
    'pending_hours', COALESCE(SUM(hours) FILTER (WHERE status = 'pendente'), 0),
    'trained_users', COUNT(DISTINCT user_id) FILTER (WHERE status = 'realizado'),
    'execution_rate', CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE status = 'realizado'))::numeric * 100 / COUNT(*)::numeric, 1) END
  )
  FROM filtered;
$$;

GRANT EXECUTE ON FUNCTION public.get_trainings_stats(date, date, uuid, uuid, text) TO authenticated;
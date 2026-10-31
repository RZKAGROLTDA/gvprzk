CREATE INDEX IF NOT EXISTS tasks_checklist_chassis_norm_idx
  ON public.tasks (public.normalize_chassis(checklist_machine->>'chassi_serie'), start_date, id)
  WHERE task_type = 'checklist';

CREATE OR REPLACE FUNCTION public.jd_audit_status_of(p_task_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN n.ch = '' THEN 'sem_chassi'
    WHEN EXISTS (
      SELECT 1 FROM tasks o
      WHERE o.task_type = 'checklist'
        AND public.normalize_chassis(o.checklist_machine->>'chassi_serie') = n.ch
        AND (COALESCE(o.start_date, 'infinity'::date), o.id) < (n.sd, n.id)
    ) THEN 'duplicado'
    ELSE 'ok'
  END
  FROM (
    SELECT t.id, COALESCE(t.start_date, 'infinity'::date) AS sd,
           public.normalize_chassis(t.checklist_machine->>'chassi_serie') AS ch
    FROM tasks t WHERE t.id = p_task_id AND t.task_type = 'checklist'
  ) n
$$;
REVOKE ALL ON FUNCTION public.jd_audit_status_of(uuid) FROM PUBLIC, anon, authenticated;
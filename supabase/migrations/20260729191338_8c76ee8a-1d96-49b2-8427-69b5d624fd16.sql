ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS submission_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_submission_id_unique ON public.tasks (submission_id) WHERE submission_id IS NOT NULL;
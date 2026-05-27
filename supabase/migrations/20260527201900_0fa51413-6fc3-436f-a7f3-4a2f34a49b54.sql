ALTER TYPE public.followup_activity_type ADD VALUE IF NOT EXISTS 'visita_tecnica';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS technical_visit_data jsonb,
  ADD COLUMN IF NOT EXISTS technical_funnel_stage text;

CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON public.tasks (task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_technical_funnel_stage ON public.tasks (technical_funnel_stage);
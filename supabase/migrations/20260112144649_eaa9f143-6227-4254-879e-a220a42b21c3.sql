-- Create performance indexes on tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON public.tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_filial ON public.tasks (filial);
CREATE INDEX IF NOT EXISTS idx_profiles_filial_approval ON public.profiles (filial_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_opportunities_task_id ON public.opportunities (task_id);
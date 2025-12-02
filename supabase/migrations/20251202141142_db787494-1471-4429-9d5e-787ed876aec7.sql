-- Índices para otimizar queries na tabela opportunities
-- Os RLS policies fazem JOINs com tasks e profiles que estão causando lentidão

-- Índice no task_id (usado em JOINs frequentes)
CREATE INDEX IF NOT EXISTS idx_opportunities_task_id ON public.opportunities(task_id);

-- Índice no filial (usado em filtros de supervisor)
CREATE INDEX IF NOT EXISTS idx_opportunities_filial ON public.opportunities(filial);

-- Índice no status (usado em filtros frequentes)
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.opportunities(status);

-- Índice no created_at para ordenação
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON public.opportunities(created_at DESC);

-- Índice composto para queries comuns
CREATE INDEX IF NOT EXISTS idx_opportunities_task_filial ON public.opportunities(task_id, filial);

-- Índices para tabela tasks (também nas slow queries)
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_filial ON public.tasks(filial);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- Índice composto para tasks
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_filial ON public.tasks(created_by, filial);

-- Índices para profiles (usado nos JOINs de RLS)
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_filial_id ON public.profiles(filial_id);
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);

-- Índice composto para verificação de supervisor
CREATE INDEX IF NOT EXISTS idx_profiles_user_filial_status ON public.profiles(user_id, filial_id, approval_status);
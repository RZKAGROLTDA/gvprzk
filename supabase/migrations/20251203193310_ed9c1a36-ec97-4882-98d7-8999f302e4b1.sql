-- Limpar opportunities órfãs primeiro
DELETE FROM public.opportunity_items 
WHERE opportunity_id IN (
  SELECT o.id FROM public.opportunities o
  WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = o.task_id)
);

DELETE FROM public.opportunities 
WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = opportunities.task_id);

-- Adicionar FK faltante: opportunities.task_id -> tasks.id
ALTER TABLE public.opportunities 
ADD CONSTRAINT fk_opportunities_task 
FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

-- Adicionar FK faltante: user_invitations.used_by -> auth.users.id
ALTER TABLE public.user_invitations 
ADD CONSTRAINT fk_user_invitations_used_by 
FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Adicionar índice para opportunities.task_id
CREATE INDEX IF NOT EXISTS idx_opportunities_task_id ON public.opportunities(task_id);
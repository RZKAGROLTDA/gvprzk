-- Corrigir política RLS para task_creation_log permitir INSERT
CREATE POLICY "Users can insert task creation logs" 
ON public.task_creation_log 
FOR INSERT 
WITH CHECK (((auth.uid())::text = created_by) OR ((auth.jwt() ->> 'role'::text) = 'manager'::text));
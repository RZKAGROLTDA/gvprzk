-- Criar política mais permissiva para managers/admins verem dados de todas as filiais
CREATE POLICY "Managers and admins can view all tasks" 
ON public.tasks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('manager', 'admin')
  )
);
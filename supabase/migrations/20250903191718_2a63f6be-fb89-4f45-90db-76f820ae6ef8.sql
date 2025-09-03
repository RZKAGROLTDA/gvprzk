-- Create RLS policies for opportunities table
-- Users can view opportunities for tasks they have access to
CREATE POLICY "Users can view opportunities for accessible tasks" 
ON public.opportunities 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = opportunities.task_id 
    AND (
      t.created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      )
    )
  )
);

-- Users can create opportunities for their own tasks
CREATE POLICY "Users can create opportunities for their tasks" 
ON public.opportunities 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = opportunities.task_id 
    AND t.created_by = auth.uid()
  )
);

-- Users can update opportunities for their tasks
CREATE POLICY "Users can update opportunities for their tasks" 
ON public.opportunities 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = opportunities.task_id 
    AND (
      t.created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = opportunities.task_id 
    AND (
      t.created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      )
    )
  )
);

-- Users can delete opportunities for their tasks (managers only)
CREATE POLICY "Managers can delete opportunities" 
ON public.opportunities 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);
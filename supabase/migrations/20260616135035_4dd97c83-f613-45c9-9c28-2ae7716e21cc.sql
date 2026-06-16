
ALTER POLICY secure_task_insert ON public.tasks TO authenticated;
ALTER POLICY secure_task_select_enhanced ON public.tasks TO authenticated;
ALTER POLICY secure_task_update ON public.tasks TO authenticated;

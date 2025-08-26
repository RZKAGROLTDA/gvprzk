-- Enable Row Level Security on secure_tasks_view
ALTER TABLE public.secure_tasks_view ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies for secure_tasks_view matching tasks table security
CREATE POLICY "Enhanced secure task view access control" 
ON public.secure_tasks_view 
FOR SELECT 
USING (
  -- User can see their own tasks
  (auth.uid() = created_by) OR
  -- Managers can see all tasks
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  )) OR
  -- Supervisors can see tasks from their filial
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = secure_tasks_view.created_by
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  )) OR
  -- Same filial users can see limited data (low-value tasks only)
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p2.user_id = secure_tasks_view.created_by
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
    AND COALESCE(secure_tasks_view.sales_value, 0) <= 25000
  ))
);

-- Log access to the secure view for monitoring
CREATE OR REPLACE FUNCTION public.log_secure_view_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log access attempts to secure view
  PERFORM public.secure_log_security_event(
    'secure_tasks_view_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'requesting_user', auth.uid()
    ),
    2
  );
  RETURN NULL;
END;
$$;

-- Create trigger to monitor access to secure view
CREATE TRIGGER monitor_secure_view_access
  AFTER SELECT ON public.secure_tasks_view
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.log_secure_view_access();
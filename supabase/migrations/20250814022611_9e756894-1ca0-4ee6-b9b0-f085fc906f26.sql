-- Complete fix for RLS policies - recreate all necessary functions
-- Drop problematic policies first
DROP POLICY IF EXISTS "Users can view profiles from same filial" ON public.profiles;
DROP POLICY IF EXISTS "Users can view tasks from their filial" ON public.tasks;

-- Recreate the current_user_is_admin function that was missing
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$$;

-- Create a safe function to check if users are from the same filial
CREATE OR REPLACE FUNCTION public.user_can_view_profile(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = target_user_id
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  );
$$;

-- Create a safe function to check if user can view tasks
CREATE OR REPLACE FUNCTION public.user_can_view_task(task_created_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT current_user_is_admin() OR EXISTS (
    SELECT 1 
    FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = task_created_by
    AND p1.filial_id = p2.filial_id
  );
$$;

-- Recreate policies using the safe functions
CREATE POLICY "Users can view profiles from same filial" 
ON public.profiles 
FOR SELECT 
USING (user_can_view_profile(user_id));

CREATE POLICY "Users can view tasks from their filial" 
ON public.tasks 
FOR SELECT 
USING (user_can_view_task(created_by));
-- Final fix for infinite recursion in RLS policies
-- The problem is the "Users can view profiles from same filial" policy is still causing recursion
-- because it directly queries the profiles table within the policy

-- Drop the problematic policy that's still causing recursion
DROP POLICY IF EXISTS "Users can view profiles from same filial" ON public.profiles;

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

-- Recreate the policy using the safe function
CREATE POLICY "Users can view profiles from same filial" 
ON public.profiles 
FOR SELECT 
USING (user_can_view_profile(user_id));

-- Also fix the tasks policy to use the same safe approach
DROP POLICY IF EXISTS "Users can view tasks from their filial" ON public.tasks;

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

-- Recreate tasks policy using the safe function
CREATE POLICY "Users can view tasks from their filial" 
ON public.tasks 
FOR SELECT 
USING (user_can_view_task(created_by));
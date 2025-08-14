-- Final RLS fix - create functions without recursion
-- Drop problematic policies
DROP POLICY IF EXISTS "Users can view profiles from same filial" ON public.profiles;
DROP POLICY IF EXISTS "Users can view tasks from their filial" ON public.tasks;

-- Create admin check function
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

-- Create function to check same filial without admin check to avoid recursion
CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
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

-- Recreate policies without recursion issues
CREATE POLICY "Users can view profiles from same filial" 
ON public.profiles 
FOR SELECT 
USING (user_same_filial(user_id));

-- For tasks, create a simple policy without calling admin function inside
CREATE POLICY "Users can view tasks from their filial" 
ON public.tasks 
FOR SELECT 
USING (user_same_filial(created_by));
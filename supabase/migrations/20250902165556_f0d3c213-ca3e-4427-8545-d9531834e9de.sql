-- CRITICAL SECURITY FIX: Secure Task Deletion and User Management
-- Phase 1: Server-side authorization for delete operations

-- 1. Create secure task deletion function with audit logging
CREATE OR REPLACE FUNCTION public.secure_delete_task(task_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
  target_task record;
  result jsonb;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Get current user's role
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- Only managers can delete tasks
  IF current_user_role != 'manager' THEN
    PERFORM public.secure_log_security_event(
      'unauthorized_task_deletion_attempt',
      auth.uid(),
      jsonb_build_object(
        'task_id', task_id_param,
        'user_role', current_user_role,
        'blocked', true
      ),
      5 -- Critical risk
    );
    RAISE EXCEPTION 'Access denied: Only managers can delete tasks';
  END IF;
  
  -- Get task details for audit logging
  SELECT t.* INTO target_task
  FROM public.tasks t
  WHERE t.id = task_id_param;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  
  -- Log the deletion attempt for audit
  PERFORM public.secure_log_security_event(
    'secure_task_deletion',
    auth.uid(),
    jsonb_build_object(
      'task_id', task_id_param,
      'client', target_task.client,
      'property', target_task.property,
      'sales_value', target_task.sales_value,
      'original_creator', target_task.created_by,
      'deleted_by', auth.uid(),
      'deletion_timestamp', now()
    ),
    4 -- High risk score for task deletion
  );
  
  -- Delete related records first (foreign key constraints)
  DELETE FROM public.products WHERE task_id = task_id_param;
  DELETE FROM public.reminders WHERE task_id = task_id_param;
  
  -- Delete the task
  DELETE FROM public.tasks WHERE id = task_id_param;
  
  -- Return success with audit info
  result := jsonb_build_object(
    'success', true,
    'message', 'Task deleted successfully',
    'task_id', task_id_param,
    'client', target_task.client,
    'deleted_at', now()
  );
  
  RETURN result;
END;
$$;

-- 2. Create secure profile management function
CREATE OR REPLACE FUNCTION public.secure_update_profile(
  profile_id_param uuid,
  updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
  target_profile record;
  old_values jsonb;
  is_role_change boolean := false;
  is_approval_change boolean := false;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Get current user's role
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- Get target profile
  SELECT p.* INTO target_profile
  FROM public.profiles p
  WHERE p.id = profile_id_param;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  
  -- Store old values for audit
  old_values := to_jsonb(target_profile);
  
  -- Check if this is a role or approval change
  is_role_change := (updates ? 'role' AND updates->>'role' != target_profile.role);
  is_approval_change := (updates ? 'approval_status' AND updates->>'approval_status' != target_profile.approval_status);
  
  -- Authorization checks
  IF target_profile.user_id = auth.uid() THEN
    -- Users can update their own profile but not role or approval status
    IF is_role_change OR is_approval_change THEN
      PERFORM public.secure_log_security_event(
        'unauthorized_self_privilege_escalation',
        auth.uid(),
        jsonb_build_object(
          'attempted_changes', updates,
          'blocked', true
        ),
        5 -- Critical risk
      );
      RAISE EXCEPTION 'Cannot change your own role or approval status';
    END IF;
  ELSIF current_user_role = 'manager' THEN
    -- Managers can update any profile
    NULL; -- Allow all changes
  ELSE
    -- Non-managers cannot update other profiles
    PERFORM public.secure_log_security_event(
      'unauthorized_profile_modification_attempt',
      auth.uid(),
      jsonb_build_object(
        'target_profile_id', profile_id_param,
        'target_user_id', target_profile.user_id,
        'user_role', current_user_role,
        'attempted_changes', updates,
        'blocked', true
      ),
      5 -- Critical risk
    );
    RAISE EXCEPTION 'Access denied: Insufficient privileges';
  END IF;
  
  -- Log the profile update
  PERFORM public.secure_log_security_event(
    'secure_profile_update',
    auth.uid(),
    jsonb_build_object(
      'target_profile_id', profile_id_param,
      'target_user_id', target_profile.user_id,
      'old_values', old_values,
      'new_values', updates,
      'is_role_change', is_role_change,
      'is_approval_change', is_approval_change,
      'updater_role', current_user_role
    ),
    CASE 
      WHEN is_role_change OR is_approval_change THEN 4
      ELSE 2
    END
  );
  
  -- Perform the update
  UPDATE public.profiles
  SET
    name = COALESCE(updates->>'name', name),
    email = COALESCE(updates->>'email', email),
    role = COALESCE(updates->>'role', role),
    approval_status = COALESCE(updates->>'approval_status', approval_status),
    filial_id = COALESCE((updates->>'filial_id')::uuid, filial_id),
    updated_at = now()
  WHERE id = profile_id_param;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Profile updated successfully',
    'profile_id', profile_id_param
  );
END;
$$;

-- 3. Enhanced RLS policies for tasks table (strengthen delete authorization)
DROP POLICY IF EXISTS "MAXIMUM_SECURITY_LOCKDOWN" ON public.tasks;

-- Separate policies for better control
CREATE POLICY "secure_task_select" ON public.tasks
FOR SELECT USING (
  (auth.uid() = created_by) OR 
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ))
);

CREATE POLICY "secure_task_insert" ON public.tasks
FOR INSERT WITH CHECK (
  auth.uid() = created_by
);

CREATE POLICY "secure_task_update" ON public.tasks
FOR UPDATE USING (
  (auth.uid() = created_by) OR 
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ))
) WITH CHECK (
  (auth.uid() = created_by) OR 
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ))
);

-- CRITICAL: Restrict task deletion to managers only through function
CREATE POLICY "secure_task_delete_manager_only" ON public.tasks
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 4. Enhanced RLS policies for profiles table
DROP POLICY IF EXISTS "Allow users to view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;
DROP POLICY IF EXISTS "Allow admin to view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow admin to manage all profiles" ON public.profiles;

-- Separate detailed policies for profiles
CREATE POLICY "profile_select_own" ON public.profiles
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "profile_select_manager" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

CREATE POLICY "profile_insert_own" ON public.profiles
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update non-sensitive fields of their own profile
CREATE POLICY "profile_update_own_safe_fields" ON public.profiles
FOR UPDATE USING (user_id = auth.uid()) 
WITH CHECK (
  user_id = auth.uid() AND
  -- Prevent users from changing their own role or approval status
  role = (SELECT role FROM profiles WHERE id = profiles.id) AND
  approval_status = (SELECT approval_status FROM profiles WHERE id = profiles.id)
);

-- Managers can update any profile (including sensitive fields)
CREATE POLICY "profile_update_manager_all" ON public.profiles
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 5. Create function to check if user can perform administrative actions
CREATE OR REPLACE FUNCTION public.can_perform_admin_action()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  );
$$;
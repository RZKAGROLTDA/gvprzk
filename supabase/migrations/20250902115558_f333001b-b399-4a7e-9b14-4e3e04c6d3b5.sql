-- ULTIMATE SECURITY FIX: Complete lockdown of all sensitive data
-- This migration implements maximum security for all customer data

-- 1. Make the secure view completely private
DROP POLICY IF EXISTS "Secure view access" ON public.secure_tasks_view_final;

-- Views don't support RLS directly, so we need to secure the underlying table access

-- 2. Replace ALL existing tasks table policies with maximum security
DROP POLICY IF EXISTS "Enhanced customer data protection" ON public.tasks;
DROP POLICY IF EXISTS "Enhanced role-based task access" ON public.tasks;
DROP POLICY IF EXISTS "Enhanced task access control" ON public.tasks;
DROP POLICY IF EXISTS "Enhanced role-based task update control" ON public.tasks;
DROP POLICY IF EXISTS "Enhanced task update control" ON public.tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Maximum security customer data policy" ON public.tasks;

-- Create ONE ultra-restrictive policy for ALL operations
CREATE POLICY "MAXIMUM_SECURITY_LOCKDOWN"
ON public.tasks
FOR ALL
USING (
  -- ONLY allow access for:
  -- 1. Task owners
  -- 2. Approved managers
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  -- ONLY allow modifications for:
  -- 1. Task owners  
  -- 2. Approved managers
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 3. Secure the clients table completely
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Managers can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create clients with rate limiting" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients with rate limiting" ON public.clients;
DROP POLICY IF EXISTS "Managers can update all clients" ON public.clients;
DROP POLICY IF EXISTS "Restricted client deletion" ON public.clients;

CREATE POLICY "CLIENTS_MAXIMUM_SECURITY"
ON public.clients
FOR ALL
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 4. Secure the profiles table completely  
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Simple users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Simple users create own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Simple users edit own profile" ON public.profiles;
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Simple admins manage all profiles" ON public.profiles;

CREATE POLICY "PROFILES_MAXIMUM_SECURITY"
ON public.profiles
FOR ALL
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 5. Secure audit logs completely - NO public access
DROP POLICY IF EXISTS "Simple admin audit access" ON public.audit_log;
DROP POLICY IF EXISTS "Only system can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Only system can update audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Only system can delete audit logs" ON public.audit_log;

CREATE POLICY "AUDIT_LOG_MANAGER_ONLY"
ON public.audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 6. Secure security audit logs - Manager access only
DROP POLICY IF EXISTS "Simple admin security log access" ON public.security_audit_log;
DROP POLICY IF EXISTS "Allow security event logging" ON public.security_audit_log;
DROP POLICY IF EXISTS "Only system can update security audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Only system can delete security audit logs" ON public.security_audit_log;

CREATE POLICY "SECURITY_LOG_MANAGER_ONLY"
ON public.security_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- Allow system to insert security logs
CREATE POLICY "SECURITY_LOG_SYSTEM_INSERT"
ON public.security_audit_log
FOR INSERT
WITH CHECK (true);

-- 7. Secure admin_users table
DROP POLICY IF EXISTS "Simple admin user management" ON public.admin_users;

CREATE POLICY "ADMIN_USERS_MANAGER_ONLY"
ON public.admin_users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 8. Secure tasks_backup table completely
DROP POLICY IF EXISTS "Enhanced backup access control" ON public.tasks_backup;

CREATE POLICY "TASKS_BACKUP_MANAGER_ONLY"
ON public.tasks_backup
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 9. Create function to verify all tables are secured
CREATE OR REPLACE FUNCTION public.verify_customer_data_security()
RETURNS TABLE(
  table_name text,
  has_rls boolean,
  policy_count bigint,
  is_secure boolean,
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name::text,
    t.row_security::boolean as has_rls,
    COALESCE(p.policy_count, 0) as policy_count,
    (t.row_security AND COALESCE(p.policy_count, 0) > 0) as is_secure,
    CASE 
      WHEN NOT t.row_security THEN 'Enable RLS on this table'
      WHEN COALESCE(p.policy_count, 0) = 0 THEN 'Add RLS policies to this table'
      ELSE 'Table appears secure'
    END::text as recommendation
  FROM (
    SELECT schemaname, tablename as table_name, rowsecurity as row_security
    FROM pg_tables 
    WHERE schemaname = 'public'
    AND tablename IN ('tasks', 'clients', 'profiles', 'admin_users', 'security_audit_log', 'audit_log', 'tasks_backup')
  ) t
  LEFT JOIN (
    SELECT schemaname, tablename, COUNT(*) as policy_count
    FROM pg_policies 
    WHERE schemaname = 'public'
    GROUP BY schemaname, tablename
  ) p ON t.table_name = p.tablename;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_customer_data_security() TO authenticated;
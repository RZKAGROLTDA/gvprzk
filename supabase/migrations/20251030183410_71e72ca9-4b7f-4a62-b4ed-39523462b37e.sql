-- =====================================================
-- CRITICAL SECURITY FIX: Privilege Escalation Prevention
-- =====================================================
-- This migration fixes 3 critical security vulnerabilities:
-- 1. Prevents users from modifying their own role in profiles table
-- 2. Replaces JWT role claims with secure has_role() function
-- 3. Migrates all RLS policies from profiles.role to user_roles table

-- =====================================================
-- FIX 1: Prevent role self-modification in profiles table
-- =====================================================

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" 
ON profiles
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() 
  AND role = (SELECT role FROM profiles WHERE user_id = auth.uid())
  AND filial_id = (SELECT filial_id FROM profiles WHERE user_id = auth.uid())
  AND approval_status = (SELECT approval_status FROM profiles WHERE user_id = auth.uid())
);

-- =====================================================
-- FIX 2: Replace JWT role claims with has_role() function
-- =====================================================

-- Fix task_creation_log SELECT policy
DROP POLICY IF EXISTS "Users can view their own task creation logs" ON task_creation_log;

CREATE POLICY "Users can view their own task creation logs" 
ON task_creation_log 
FOR SELECT 
USING (
  (auth.uid()::text = created_by) 
  OR 
  public.has_role(auth.uid(), 'manager')
);

-- Fix task_creation_log INSERT policy
DROP POLICY IF EXISTS "Users can insert task creation logs" ON task_creation_log;

CREATE POLICY "Users can insert task creation logs" 
ON task_creation_log 
FOR INSERT 
WITH CHECK (
  (auth.uid()::text = created_by) 
  OR 
  public.has_role(auth.uid(), 'manager')
);

-- =====================================================
-- FIX 3: Migrate all RLS policies from profiles.role to has_role()
-- =====================================================

-- TASKS TABLE POLICIES
DROP POLICY IF EXISTS "secure_task_update" ON tasks;
CREATE POLICY "secure_task_update" 
ON tasks
FOR UPDATE 
USING (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
);

DROP POLICY IF EXISTS "secure_task_select_enhanced" ON tasks;
CREATE POLICY "secure_task_select_enhanced" 
ON tasks
FOR SELECT 
USING (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
  OR (
    -- Supervisor from same filial
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = tasks.created_by
        AND p1.filial_id = p2.filial_id
        AND public.has_role(auth.uid(), 'supervisor')
        AND p1.approval_status = 'approved'
    )
  )
  OR (
    -- RAC/Consultant from same filial with sales_value <= 10000
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = tasks.created_by
        AND p1.filial_id = p2.filial_id
        AND p1.approval_status = 'approved'
        AND COALESCE(tasks.sales_value, 0) <= 10000
    )
  )
);

-- CLIENTS TABLE POLICIES
DROP POLICY IF EXISTS "enhanced_clients_update" ON clients;
CREATE POLICY "enhanced_clients_update" 
ON clients
FOR UPDATE 
USING (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
  OR (
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = clients.created_by
        AND p1.filial_id = p2.filial_id
        AND public.has_role(auth.uid(), 'supervisor')
        AND p1.approval_status = 'approved'
    )
  )
)
WITH CHECK (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
  OR (
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = clients.created_by
        AND p1.filial_id = p2.filial_id
        AND public.has_role(auth.uid(), 'supervisor')
        AND p1.approval_status = 'approved'
    )
  )
);

DROP POLICY IF EXISTS "enhanced_clients_delete" ON clients;
CREATE POLICY "enhanced_clients_delete" 
ON clients
FOR DELETE 
USING (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
);

DROP POLICY IF EXISTS "secure_clients_select_contact_protected" ON clients;
CREATE POLICY "secure_clients_select_contact_protected" 
ON clients
FOR SELECT 
USING (
  auth.uid() = created_by 
  OR public.has_role(auth.uid(), 'manager')
  OR (
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = clients.created_by
        AND p1.filial_id = p2.filial_id
        AND public.has_role(auth.uid(), 'supervisor')
        AND p1.approval_status = 'approved'
    )
  )
);

-- OPPORTUNITIES TABLE POLICIES
DROP POLICY IF EXISTS "Users can update opportunities for their tasks" ON opportunities;
CREATE POLICY "Users can update opportunities for their tasks" 
ON opportunities
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
);

DROP POLICY IF EXISTS "Managers can delete opportunities" ON opportunities;
CREATE POLICY "Managers can delete opportunities" 
ON opportunities
FOR DELETE 
USING (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;
CREATE POLICY "Users can view opportunities for accessible tasks" 
ON opportunities
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
);

-- OPPORTUNITY_ITEMS TABLE POLICIES
DROP POLICY IF EXISTS "Users can view opportunity items for accessible tasks" ON opportunity_items;
CREATE POLICY "Users can view opportunity items for accessible tasks" 
ON opportunity_items
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM opportunities o
    JOIN tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
);

DROP POLICY IF EXISTS "Users can update opportunity items for accessible tasks" ON opportunity_items;
CREATE POLICY "Users can update opportunity items for accessible tasks" 
ON opportunity_items
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM opportunities o
    JOIN tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM opportunities o
    JOIN tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
);

DROP POLICY IF EXISTS "Users can delete opportunity items for accessible tasks" ON opportunity_items;
CREATE POLICY "Users can delete opportunity items for accessible tasks" 
ON opportunity_items
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM opportunities o
    JOIN tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
      )
  )
);

-- PRODUCTS TABLE POLICIES
DROP POLICY IF EXISTS "Users can create products for their tasks" ON products;
CREATE POLICY "Users can create products for their tasks" 
ON products
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = products.task_id
      AND (
        t.created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'manager')
        OR (
          EXISTS (
            SELECT 1 FROM profiles p1, profiles p2
            WHERE p1.user_id = auth.uid()
              AND p2.user_id = t.created_by
              AND p1.filial_id = p2.filial_id
              AND public.has_role(auth.uid(), 'supervisor')
              AND p1.approval_status = 'approved'
          )
        )
      )
  )
);

-- AUDIT_LOG TABLE POLICY
DROP POLICY IF EXISTS "AUDIT_LOG_MANAGER_ONLY" ON audit_log;
CREATE POLICY "AUDIT_LOG_MANAGER_ONLY" 
ON audit_log
FOR SELECT 
USING (public.has_role(auth.uid(), 'manager'));

-- SECURITY_AUDIT_LOG TABLE POLICY
DROP POLICY IF EXISTS "SECURITY_LOG_MANAGER_ONLY" ON security_audit_log;
CREATE POLICY "SECURITY_LOG_MANAGER_ONLY" 
ON security_audit_log
FOR SELECT 
USING (public.has_role(auth.uid(), 'manager'));

-- Add comment documenting the security fix
COMMENT ON POLICY "profiles_update_own" ON profiles IS 
  'Security fix: Prevents users from self-escalating privileges by modifying role, filial_id, or approval_status';

COMMENT ON POLICY "Users can view their own task creation logs" ON task_creation_log IS 
  'Security fix: Uses has_role() instead of JWT claims to prevent stale authorization';

COMMENT ON POLICY "Users can insert task creation logs" ON task_creation_log IS 
  'Security fix: Uses has_role() instead of JWT claims to prevent stale authorization';
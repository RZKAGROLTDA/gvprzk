-- ============================================
-- CRITICAL SECURITY FIX: Address Two Error-Level Issues
-- 1. Drop secure_clients_view (views can't have RLS - use RPC functions instead)
-- 2. Create proper user_roles architecture
-- ============================================

-- ============================================
-- PART 1: Handle secure_clients_view
-- ============================================

-- Drop the view since it cannot have RLS policies
-- The clients table already has proper RLS policies
-- Use get_secure_clients_enhanced() function for masked access instead
DROP VIEW IF EXISTS secure_clients_view CASCADE;

-- ============================================
-- PART 2: Create proper user_roles architecture
-- ============================================

-- Create enum for roles (if not exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'manager',
    'supervisor', 
    'rac',
    'consultant',
    'sales_consultant',
    'technical_consultant',
    'admin'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create user_roles table with proper security
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Add indexes for performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_manager" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_manager" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_manager" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_manager" ON public.user_roles;

-- Create SECURITY DEFINER function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
  )
$$;

-- Create helper function to check if user is manager
CREATE OR REPLACE FUNCTION public.is_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
    AND ur.role = 'manager'
    AND p.approval_status = 'approved'
  )
$$;

-- RLS policies for user_roles - users can see their own roles
CREATE POLICY "user_roles_select_own" ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Only managers can see all roles
CREATE POLICY "user_roles_select_manager" ON public.user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'manager'
    AND p.approval_status = 'approved'
  )
);

-- Only managers can insert/update/delete roles
CREATE POLICY "user_roles_insert_manager" ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'manager'
    AND p.approval_status = 'approved'
  )
);

CREATE POLICY "user_roles_update_manager" ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'manager'
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'manager'
    AND p.approval_status = 'approved'
  )
);

CREATE POLICY "user_roles_delete_manager" ON public.user_roles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'manager'
    AND p.approval_status = 'approved'
  )
);

-- Migrate existing roles from profiles to user_roles
-- This safely handles any roles that might be invalid
INSERT INTO public.user_roles (user_id, role, created_at)
SELECT 
  user_id,
  role::app_role,
  created_at
FROM public.profiles
WHERE role IS NOT NULL
  AND approval_status = 'approved'
  AND role IN ('manager', 'supervisor', 'rac', 'consultant', 'sales_consultant', 'technical_consultant', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create updated_at trigger for user_roles
CREATE OR REPLACE FUNCTION public.update_user_roles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_updated_at ON public.user_roles;
CREATE TRIGGER user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_user_roles_updated_at();

-- Drop and recreate the update_user_role_secure function to use user_roles table
DROP FUNCTION IF EXISTS public.update_user_role_secure(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_user_role_secure(
  target_user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calling_user_role TEXT;
BEGIN
  -- Check if caller is a manager
  SELECT role INTO calling_user_role
  FROM public.profiles
  WHERE user_id = auth.uid() AND approval_status = 'approved'
  LIMIT 1;
  
  IF calling_user_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can update user roles';
  END IF;
  
  -- Validate the new role
  IF new_role NOT IN ('manager', 'supervisor', 'rac', 'consultant', 'sales_consultant', 'technical_consultant', 'admin') THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;
  
  -- Update both profiles (for backwards compatibility) and user_roles
  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE user_id = target_user_id;
  
  -- Delete old roles
  DELETE FROM public.user_roles
  WHERE user_id = target_user_id;
  
  -- Insert new role
  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (target_user_id, new_role::app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log the role change
  PERFORM public.secure_log_security_event(
    'user_role_updated',
    auth.uid(),
    jsonb_build_object(
      'target_user_id', target_user_id,
      'new_role', new_role,
      'updated_by', auth.uid()
    ),
    3
  );
END;
$$;

-- Log the migration
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM public.user_roles;
  
  RAISE NOTICE '=== CRITICAL SECURITY FIXES APPLIED ===';
  RAISE NOTICE '1. ✅ Dropped secure_clients_view (views cannot have RLS)';
  RAISE NOTICE '   → Use get_secure_clients_enhanced() function for secure client data access';
  RAISE NOTICE '2. ✅ Created user_roles table with proper security architecture';
  RAISE NOTICE '   → Created app_role enum type';
  RAISE NOTICE '   → Created user_roles table with RLS enabled';
  RAISE NOTICE '   → Created has_role() and is_manager() SECURITY DEFINER functions';
  RAISE NOTICE '   → Migrated % existing roles to user_roles table', migrated_count;
  RAISE NOTICE '   → Updated update_user_role_secure() to manage both tables';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT NOTES:';
  RAISE NOTICE '   - Role column kept in profiles for backwards compatibility';
  RAISE NOTICE '   - Both profiles.role and user_roles will be kept in sync';
  RAISE NOTICE '   - Future migrations can gradually transition to user_roles only';
  RAISE NOTICE '   - The profiles_update_own policy will be updated in a future migration';
END $$;
-- CRITICAL SECURITY FIXES MIGRATION
-- Phase 1: Database Security Hardening

-- 1. Fix Security Audit Log Tampering (CRITICAL)
-- Remove public insert policy and create secure logging function
DROP POLICY IF EXISTS "SECURITY_LOG_SYSTEM_INSERT" ON security_audit_log;

-- Create secure logging function with proper validation
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type_param text,
  user_id_param uuid DEFAULT auth.uid(),
  metadata_param jsonb DEFAULT '{}',
  risk_score_param integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate event type
  IF event_type_param IS NULL OR LENGTH(event_type_param) = 0 THEN
    RAISE EXCEPTION 'Event type cannot be null or empty';
  END IF;
  
  -- Validate risk score
  IF risk_score_param < 1 OR risk_score_param > 5 THEN
    RAISE EXCEPTION 'Risk score must be between 1 and 5';
  END IF;
  
  -- Insert security event with validation
  INSERT INTO security_audit_log (
    event_type,
    user_id,
    metadata,
    risk_score,
    created_at,
    user_agent,
    ip_address
  ) VALUES (
    event_type_param,
    user_id_param,
    metadata_param || jsonb_build_object(
      'logged_at', now(),
      'function_call', 'secure_log_security_event'
    ),
    risk_score_param,
    now(),
    current_setting('request.headers', true)::json->>'user-agent',
    inet_client_addr()
  );
END;
$$;

-- Create new secure insert policy for security_audit_log
CREATE POLICY "SECURITY_LOG_SECURE_INSERT" ON security_audit_log
FOR INSERT 
WITH CHECK (false); -- Only allow inserts through the secure function

-- Grant execute on secure logging function
GRANT EXECUTE ON FUNCTION public.secure_log_security_event TO authenticated;

-- 2. Fix Auto-Approval Vulnerability (CRITICAL)
-- Change default approval_status from 'approved' to 'pending'
ALTER TABLE profiles ALTER COLUMN approval_status SET DEFAULT 'pending';

-- Create secure profile creation function
CREATE OR REPLACE FUNCTION public.create_secure_profile(
  user_id_param uuid,
  name_param text,
  email_param text,
  role_param text DEFAULT 'rac',
  filial_id_param uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  profile_id uuid;
  default_filial_id uuid;
BEGIN
  -- Validate required parameters
  IF user_id_param IS NULL OR name_param IS NULL OR email_param IS NULL THEN
    RAISE EXCEPTION 'User ID, name, and email are required';
  END IF;
  
  -- Get default filial if none provided
  IF filial_id_param IS NULL THEN
    SELECT id INTO default_filial_id FROM filiais LIMIT 1;
    filial_id_param := default_filial_id;
  END IF;
  
  -- Insert profile with pending approval
  INSERT INTO profiles (
    user_id,
    name,
    email,
    role,
    filial_id,
    approval_status,
    registration_date
  ) VALUES (
    user_id_param,
    name_param,
    email_param,
    role_param,
    filial_id_param,
    'pending', -- Always pending for security
    now()
  ) RETURNING id INTO profile_id;
  
  -- Log profile creation for security monitoring
  PERFORM public.secure_log_security_event(
    'profile_created',
    user_id_param,
    jsonb_build_object(
      'profile_id', profile_id,
      'email', email_param,
      'role', role_param,
      'approval_status', 'pending'
    ),
    2
  );
  
  RETURN profile_id;
END;
$$;

-- Grant execute on secure profile creation function
GRANT EXECUTE ON FUNCTION public.create_secure_profile TO authenticated;

-- 3. Strengthen Admin Function (MEDIUM)
-- Create enhanced admin check function
CREATE OR REPLACE FUNCTION public.simple_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
    AND p.created_at < now() - interval '1 hour' -- Prevent immediate admin escalation
  ) OR EXISTS (
    SELECT 1
    FROM admin_users au
    WHERE au.user_id = auth.uid()
    AND au.is_active = true
  );
$$;

-- 4. Add Customer Data Access Logging Function
CREATE OR REPLACE FUNCTION public.log_customer_data_access(
  access_type text DEFAULT 'view',
  customer_count integer DEFAULT 0,
  masked_count integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.secure_log_security_event(
    'customer_data_access',
    auth.uid(),
    jsonb_build_object(
      'access_type', access_type,
      'customer_count', customer_count,
      'masked_count', masked_count,
      'timestamp', now(),
      'user_role', (SELECT role FROM profiles WHERE user_id = auth.uid())
    ),
    CASE 
      WHEN access_type = 'bulk_export' THEN 4
      WHEN masked_count = 0 AND customer_count > 10 THEN 3
      ELSE 2
    END
  );
END;
$$;

-- Grant execute on customer data access logging
GRANT EXECUTE ON FUNCTION public.log_customer_data_access TO authenticated;

-- 5. Add performance indexes for security functions
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_event 
ON security_audit_log(user_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_user_approval 
ON profiles(user_id, approval_status, role);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.secure_log_security_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_secure_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_customer_data_access TO authenticated;
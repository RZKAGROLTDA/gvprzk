-- PHASE 1: CRITICAL DATABASE SECURITY FIXES

-- 1. Fix Database Functions Security - Add proper search_path to all functions
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type_param text, 
  user_id_param uuid DEFAULT auth.uid(), 
  metadata_param jsonb DEFAULT '{}'::jsonb, 
  risk_score_param integer DEFAULT 1
)
RETURNS void
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
    COALESCE(current_setting('request.headers', true)::json->>'user-agent', 'unknown'),
    inet_client_addr()
  );
END;
$$;

-- 2. Strengthen RLS Policies for Customer Data Protection

-- Enhanced tasks table RLS with hierarchical access
DROP POLICY IF EXISTS "secure_task_select" ON public.tasks;
CREATE POLICY "secure_task_select" ON public.tasks
FOR SELECT TO authenticated
USING (
  -- Owner can see their own tasks
  auth.uid() = created_by OR
  -- Managers can see all tasks
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ) OR
  -- Supervisors can see tasks from their filial
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = tasks.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  ) OR
  -- Consultants can see limited tasks from same filial (low value sales only)
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = tasks.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p1.approval_status = 'approved'
    AND COALESCE(tasks.sales_value, 0) <= 25000
  )
);

-- Enhanced clients table RLS (CRITICAL - was missing proper protection)
DROP POLICY IF EXISTS "CLIENTS_MAXIMUM_SECURITY" ON public.clients;
CREATE POLICY "secure_clients_access" ON public.clients
FOR ALL TO authenticated
USING (
  -- Owner can access their own clients
  created_by = auth.uid() OR
  -- Managers can access all clients
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  -- Only owner or manager can modify
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 3. Add Customer Data Access Audit Trigger
CREATE OR REPLACE FUNCTION public.log_sensitive_customer_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log access to high-value sales or sensitive customer data
  IF TG_OP = 'SELECT' AND (
    COALESCE(NEW.sales_value, OLD.sales_value, 0) > 50000 OR
    (NEW.email IS NOT NULL AND NEW.email != '') OR
    (NEW.phone IS NOT NULL AND NEW.phone != '')
  ) THEN
    PERFORM public.secure_log_security_event(
      'sensitive_customer_data_access',
      auth.uid(),
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'has_email', (NEW.email IS NOT NULL AND NEW.email != ''),
        'has_phone', (NEW.phone IS NOT NULL AND NEW.phone != ''),
        'sales_value', COALESCE(NEW.sales_value, OLD.sales_value),
        'is_high_value', COALESCE(NEW.sales_value, OLD.sales_value, 0) > 50000
      ),
      CASE 
        WHEN COALESCE(NEW.sales_value, OLD.sales_value, 0) > 100000 THEN 5
        WHEN COALESCE(NEW.sales_value, OLD.sales_value, 0) > 50000 THEN 4
        ELSE 3
      END
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply trigger to tasks table
DROP TRIGGER IF EXISTS sensitive_customer_access_trigger ON public.tasks;
CREATE TRIGGER sensitive_customer_access_trigger
  AFTER SELECT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sensitive_customer_access();

-- Apply trigger to clients table  
DROP TRIGGER IF EXISTS sensitive_client_access_trigger ON public.clients;
CREATE TRIGGER sensitive_client_access_trigger
  AFTER SELECT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sensitive_customer_access();

-- 4. Enhanced Rate Limiting Function
CREATE OR REPLACE FUNCTION public.check_advanced_rate_limit(
  operation_type text DEFAULT 'general',
  time_window interval DEFAULT '1 hour'::interval,
  max_attempts integer DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recent_attempts integer;
BEGIN
  -- Count recent attempts for this operation type
  SELECT COUNT(*) INTO recent_attempts
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type LIKE '%' || operation_type || '%'
    AND created_at > now() - time_window;
    
  -- Check if limit exceeded
  IF recent_attempts >= max_attempts THEN
    -- Log rate limit violation
    PERFORM public.secure_log_security_event(
      'rate_limit_exceeded',
      auth.uid(),
      jsonb_build_object(
        'operation_type', operation_type,
        'attempts', recent_attempts,
        'max_attempts', max_attempts,
        'time_window', time_window::text
      ),
      4
    );
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 5. Create Customer Data Protection View with Enhanced Masking
CREATE OR REPLACE VIEW public.secure_customer_data_view AS
SELECT 
  t.id,
  t.name,
  t.responsible,
  -- Enhanced client name masking
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR t.created_by = auth.uid() THEN t.client
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid()
      AND p2.user_id = t.created_by
      AND p1.filial_id = p2.filial_id
      AND p1.role = 'supervisor'
      AND p1.approval_status = 'approved'
    ) THEN t.client
    ELSE LEFT(t.client, 1) || '***' || RIGHT(t.client, 1)
  END as client,
  -- Enhanced email masking
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR t.created_by = auth.uid() THEN t.email
    WHEN t.email IS NOT NULL AND t.email != '' THEN
      LEFT(t.email, 1) || '***@***.' || 
      CASE 
        WHEN POSITION('.' IN REVERSE(t.email)) > 0 THEN 
          RIGHT(t.email, POSITION('.' IN REVERSE(t.email)) - 1)
        ELSE 'com'
      END
    ELSE NULL
  END as email,
  -- Enhanced phone masking
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR t.created_by = auth.uid() THEN t.phone
    WHEN t.phone IS NOT NULL AND t.phone != '' THEN
      '(***) ***-' || RIGHT(t.phone, 4)
    ELSE NULL
  END as phone,
  -- Sales value protection
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR t.created_by = auth.uid() THEN t.sales_value
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid()
      AND p2.user_id = t.created_by
      AND p1.filial_id = p2.filial_id
      AND p1.role = 'supervisor'
      AND p1.approval_status = 'approved'
    ) THEN t.sales_value
    WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.sales_value
    ELSE NULL
  END as sales_value,
  -- Non-sensitive fields
  t.start_date,
  t.end_date,
  t.status,
  t.priority,
  t.task_type,
  t.created_at,
  t.created_by,
  t.filial
FROM public.tasks t
WHERE (
  -- Apply same access rules as tasks table
  auth.uid() = t.created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = t.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = t.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p1.approval_status = 'approved'
    AND COALESCE(t.sales_value, 0) <= 25000
  )
);

-- 6. Performance Indexes for Security
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_event_time 
ON public.security_audit_log (user_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_risk_score_time 
ON public.security_audit_log (risk_score, created_at) 
WHERE risk_score >= 3;

CREATE INDEX IF NOT EXISTS idx_tasks_sensitive_data 
ON public.tasks (created_by, sales_value) 
WHERE sales_value > 25000;

-- 7. Security Alert Function for High-Risk Events
CREATE OR REPLACE FUNCTION public.check_security_threats()
RETURNS TABLE(
  threat_level text,
  threat_type text,
  event_count bigint,
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check for excessive high-risk events in last hour
  RETURN QUERY
  SELECT 
    'CRITICAL'::text,
    'High-risk security events'::text,
    COUNT(*)::bigint,
    'Immediate investigation required - potential security breach'::text
  FROM public.security_audit_log
  WHERE risk_score >= 4
    AND created_at > now() - interval '1 hour'
  HAVING COUNT(*) > 10;
  
  -- Check for rapid customer data access
  RETURN QUERY
  SELECT 
    'HIGH'::text,
    'Rapid customer data access'::text,
    COUNT(*)::bigint,
    'Monitor user for potential data harvesting'::text
  FROM public.security_audit_log
  WHERE event_type LIKE '%customer%'
    AND created_at > now() - interval '15 minutes'
  GROUP BY user_id
  HAVING COUNT(*) > 20;
  
  -- Check for failed authentication attempts
  RETURN QUERY
  SELECT 
    'MEDIUM'::text,
    'Multiple failed login attempts'::text,
    COUNT(*)::bigint,
    'Consider implementing account lockout'::text
  FROM public.security_audit_log
  WHERE event_type LIKE '%login%'
    AND metadata->>'success' = 'false'
    AND created_at > now() - interval '1 hour'
  HAVING COUNT(*) > 5;
END;
$$;
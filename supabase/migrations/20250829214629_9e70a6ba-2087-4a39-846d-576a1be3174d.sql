-- CRITICAL SECURITY FIXES - Phase 1 (Corrected): Business Intelligence Data Protection

-- 1. Since we can't apply RLS to views directly, we need to secure the underlying tables
-- The vw_oportunidades_kpis view uses opportunities and tasks_new tables
-- Let's ensure those tables have proper RLS policies

-- First, let's check and enhance RLS on opportunities table (already has policies but let's strengthen them)
DROP POLICY IF EXISTS "Opportunities: Access control" ON public.opportunities;
CREATE POLICY "Enhanced opportunities access control" 
ON public.opportunities 
FOR SELECT 
USING (
  -- Managers have full access
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'manager' OR
  
  -- Users can see opportunities for tasks they created
  task_id IN (
    SELECT id FROM public.tasks_new 
    WHERE vendedor_id = auth.uid()
  ) OR
  
  -- Supervisors can see opportunities from their filial
  (
    (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'supervisor' AND
    task_id IN (
      SELECT t.id FROM public.tasks_new t
      JOIN public.profiles p1 ON p1.user_id = auth.uid()
      JOIN public.profiles p2 ON p2.user_id = t.vendedor_id
      WHERE p1.filial_id = p2.filial_id
    )
  ) OR
  
  -- Other roles can only see low-value opportunities from same filial
  (
    (SELECT role FROM public.profiles WHERE user_id = auth.uid()) IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') AND
    COALESCE(valor_total_oportunidade, 0) <= 25000 AND
    task_id IN (
      SELECT t.id FROM public.tasks_new t
      JOIN public.profiles p1 ON p1.user_id = auth.uid()
      JOIN public.profiles p2 ON p2.user_id = t.vendedor_id
      WHERE p1.filial_id = p2.filial_id
    )
  )
);

-- 2. Fix Security Definer functions by adding proper search_path
CREATE OR REPLACE FUNCTION public.get_secure_business_intelligence()
RETURNS TABLE(id uuid, filial text, cliente_nome text, status text, valor_total_oportunidade numeric, valor_venda_fechada numeric, conversao_pct numeric, data_criacao timestamp with time zone, data_fechamento timestamp with time zone, vendedor_id uuid, tipo_task text, access_level text, is_masked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required for business intelligence data';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log business intelligence access with high risk level
  PERFORM secure_log_security_event(
    'business_intelligence_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_timestamp', NOW(),
      'data_type', 'sales_performance_metrics'
    ),
    4  -- High risk level for BI data
  );
  
  -- Return data based on strict role-based access control
  RETURN QUERY
  SELECT 
    v.id,
    v.filial,
    
    -- CRITICAL: Mask customer names for unauthorized users
    CASE 
      WHEN current_user_role = 'manager' THEN v.cliente_nome
      WHEN auth.uid() = v.vendedor_id THEN v.cliente_nome
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.cliente_nome
      ELSE LEFT(v.cliente_nome, 3) || '***'
    END as cliente_nome,
    
    v.status,
    
    -- CRITICAL: Mask high-value sales data (>R$25k)
    CASE 
      WHEN current_user_role = 'manager' THEN v.valor_total_oportunidade
      WHEN auth.uid() = v.vendedor_id THEN v.valor_total_oportunidade
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_total_oportunidade
      -- Hide high-value opportunities from regular users
      WHEN v.valor_total_oportunidade > 25000 THEN NULL
      ELSE v.valor_total_oportunidade
    END as valor_total_oportunidade,
    
    CASE 
      WHEN current_user_role = 'manager' THEN v.valor_venda_fechada
      WHEN auth.uid() = v.vendedor_id THEN v.valor_venda_fechada
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_venda_fechada
      -- Hide high-value sales from regular users
      WHEN v.valor_venda_fechada > 25000 THEN NULL
      ELSE v.valor_venda_fechada
    END as valor_venda_fechada,
    
    -- Mask conversion rates for competitive intelligence protection
    CASE 
      WHEN current_user_role = 'manager' THEN v.conversao_pct
      WHEN auth.uid() = v.vendedor_id THEN v.conversao_pct
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.conversao_pct
      ELSE NULL
    END as conversao_pct,
    
    v.data_criacao,
    v.data_fechamento,
    v.vendedor_id,
    v.tipo_task,
    
    -- Access level indicator
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = v.vendedor_id THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN 'supervisor'
      ELSE 'limited'
    END as access_level,
    
    -- Masking indicator for UI
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = v.vendedor_id OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ))
    ) as is_masked
    
  FROM vw_oportunidades_kpis v
  WHERE 
    -- Apply strict access control filters
    (current_user_role = 'manager') OR
    (auth.uid() = v.vendedor_id) OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p2 
      WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
    )) OR
    -- Limited access for other roles (only low-value sales from same filial)
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM profiles p2 
       WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
     ) AND COALESCE(v.valor_total_oportunidade, 0) <= 25000);
END;
$function$;

-- 3. Fix other Security Definer functions with search_path
CREATE OR REPLACE FUNCTION public.get_secure_bi_summary()
RETURNS TABLE(total_opportunities bigint, total_sales_value numeric, average_conversion_rate numeric, period_start timestamp with time zone, period_end timestamp with time zone, access_level text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log aggregated BI access
  PERFORM secure_log_security_event(
    'business_intelligence_summary_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_type', 'aggregated_summary'
    ),
    3
  );
  
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as total_opportunities,
    
    -- Mask high-value aggregations for non-managers
    CASE 
      WHEN current_user_role = 'manager' THEN SUM(v.valor_venda_fechada)
      WHEN current_user_role = 'supervisor' THEN SUM(
        CASE WHEN EXISTS (
          SELECT 1 FROM profiles p2 
          WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
        ) THEN v.valor_venda_fechada ELSE 0 END
      )
      ELSE SUM(
        CASE WHEN v.vendedor_id = auth.uid() THEN v.valor_venda_fechada ELSE 0 END
      )
    END as total_sales_value,
    
    CASE 
      WHEN current_user_role = 'manager' THEN AVG(v.conversao_pct)
      ELSE NULL
    END as average_conversion_rate,
    
    MIN(v.data_criacao) as period_start,
    MAX(v.data_criacao) as period_end,
    
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN current_user_role = 'supervisor' THEN 'filial'
      ELSE 'personal'
    END as access_level
    
  FROM vw_oportunidades_kpis v
  WHERE 
    (current_user_role = 'manager') OR
    (auth.uid() = v.vendedor_id) OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p2 
      WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
    ));
END;
$function$;

-- 4. Fix remaining functions missing search_path
CREATE OR REPLACE FUNCTION public.check_security_alerts()
RETURNS TABLE(alert_type text, severity text, count bigint, description text, recommendation text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check for high-risk security events in last 24 hours
  RETURN QUERY
  SELECT 
    'High Risk Events'::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 'CRITICAL'
      WHEN COUNT(*) > 50 THEN 'HIGH'
      WHEN COUNT(*) > 10 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' high-risk security events in the last 24 hours')::text,
    'Investigate and address high-risk security events immediately'::text
  FROM security_audit_log
  WHERE risk_score >= 4 AND created_at > now() - interval '24 hours';
  
  -- Check for unauthorized customer email access attempts
  RETURN QUERY
  SELECT 
    'Customer Email Access'::text,
    CASE 
      WHEN COUNT(*) > 50 THEN 'HIGH'
      WHEN COUNT(*) > 20 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' customer email access attempts in the last 24 hours')::text,
    'Review customer email access patterns for unauthorized attempts'::text
  FROM security_audit_log
  WHERE event_type LIKE '%customer_data%' AND created_at > now() - interval '24 hours';
  
  -- Check for high-value sales access patterns
  RETURN QUERY
  SELECT 
    'High Value Sales Access'::text,
    CASE 
      WHEN COUNT(*) > 30 THEN 'HIGH'
      WHEN COUNT(*) > 10 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' high-value sales access events in the last 24 hours')::text,
    'Monitor high-value sales data access for compliance'::text
  FROM security_audit_log
  WHERE event_type LIKE '%high_value%' AND created_at > now() - interval '24 hours';
END;
$function$;

-- 5. Fix the check_suspicious_login_pattern function with search_path
CREATE OR REPLACE FUNCTION public.check_suspicious_login_pattern(user_email text, ip_addr inet)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recent_logins integer;
  different_ips integer;
BEGIN
  -- Count recent logins from different IPs
  SELECT COUNT(DISTINCT ip_address) INTO different_ips
  FROM security_audit_log
  WHERE event_type = 'login_attempt'
    AND metadata->>'email' = user_email
    AND created_at > now() - interval '1 hour';
  
  -- If more than 3 different IPs in 1 hour, flag as suspicious
  IF different_ips > 3 THEN
    PERFORM secure_log_security_event(
      'suspicious_login_pattern',
      NULL,
      jsonb_build_object(
        'email', user_email,
        'different_ips_count', different_ips,
        'time_window', '1 hour'
      ),
      4
    );
    RETURN true;
  END IF;
  
  RETURN false;
END;
$function$;

-- 6. Add comprehensive audit logging for BI data access with proper search_path
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type text,
  target_user_id uuid,
  metadata jsonb DEFAULT '{}',
  risk_score integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata,
    risk_score,
    created_at
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    metadata,
    risk_score,
    now()
  );
END;
$function$;

-- 7. Create a secure wrapper function to access BI data
CREATE OR REPLACE FUNCTION public.get_secure_bi_view_data()
RETURNS TABLE(id uuid, filial text, cliente_nome text, status text, valor_total_oportunidade numeric, valor_venda_fechada numeric, conversao_pct numeric, data_criacao timestamp with time zone, data_fechamento timestamp with time zone, vendedor_id uuid, tipo_task text, access_level text, is_masked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log BI view access
  PERFORM secure_log_security_event(
    'bi_view_data_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_timestamp', NOW()
    ),
    3
  );
  
  -- Return filtered and masked data
  RETURN QUERY
  SELECT 
    v.id,
    v.filial,
    
    -- Mask customer names based on access level
    CASE 
      WHEN current_user_role = 'manager' THEN v.cliente_nome
      WHEN auth.uid() = v.vendedor_id THEN v.cliente_nome
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.cliente_nome
      ELSE LEFT(v.cliente_nome, 3) || '***'
    END as cliente_nome,
    
    v.status,
    
    -- Mask high-value sales data
    CASE 
      WHEN current_user_role = 'manager' THEN v.valor_total_oportunidade
      WHEN auth.uid() = v.vendedor_id THEN v.valor_total_oportunidade
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_total_oportunidade
      WHEN COALESCE(v.valor_total_oportunidade, 0) > 25000 THEN NULL
      ELSE v.valor_total_oportunidade
    END as valor_total_oportunidade,
    
    CASE 
      WHEN current_user_role = 'manager' THEN v.valor_venda_fechada
      WHEN auth.uid() = v.vendedor_id THEN v.valor_venda_fechada
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_venda_fechada
      WHEN COALESCE(v.valor_venda_fechada, 0) > 25000 THEN NULL
      ELSE v.valor_venda_fechada
    END as valor_venda_fechada,
    
    CASE 
      WHEN current_user_role = 'manager' THEN v.conversao_pct
      WHEN auth.uid() = v.vendedor_id THEN v.conversao_pct
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.conversao_pct
      ELSE NULL
    END as conversao_pct,
    
    v.data_criacao,
    v.data_fechamento,
    v.vendedor_id,
    v.tipo_task,
    
    -- Access level indicator
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = v.vendedor_id THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN 'supervisor'
      ELSE 'limited'
    END as access_level,
    
    -- Masking indicator
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = v.vendedor_id OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ))
    ) as is_masked
    
  FROM vw_oportunidades_kpis v
  WHERE 
    -- Apply access control at query level
    (current_user_role = 'manager') OR
    (auth.uid() = v.vendedor_id) OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p2 
      WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM profiles p2 
       WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
     ) AND COALESCE(v.valor_total_oportunidade, 0) <= 25000);
END;
$function$;
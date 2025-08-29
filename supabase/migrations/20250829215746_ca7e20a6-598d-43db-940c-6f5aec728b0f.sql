-- SECURITY FIXES - Phase 1: Critical Security Fixes (View-Compatible Approach)

-- 1. CRITICAL: Since we can't add RLS to views, create a secure function to access BI data
CREATE OR REPLACE FUNCTION public.get_secure_bi_data_with_access_control()
 RETURNS TABLE(
   id uuid, 
   valor_total_oportunidade numeric, 
   valor_venda_fechada numeric, 
   conversao_pct numeric, 
   data_criacao timestamp with time zone, 
   data_fechamento timestamp with time zone, 
   vendedor_id uuid, 
   filial text, 
   cliente_nome text, 
   status text, 
   tipo_task text,
   access_level text,
   is_masked boolean
 )
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
    RAISE EXCEPTION 'Access denied: Authentication required for BI data';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log BI data access attempt
  PERFORM secure_log_security_event(
    'secure_bi_data_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_timestamp', NOW(),
      'data_type', 'bi_dashboard_query'
    ),
    CASE WHEN current_user_role = 'manager' THEN 2 ELSE 3 END
  );
  
  -- Return data with strict role-based access control and masking
  RETURN QUERY
  SELECT 
    v.id,
    
    -- Mask high-value sales data based on role and access level
    CASE 
      WHEN current_user_role = 'manager' THEN v.valor_total_oportunidade
      WHEN auth.uid() = v.vendedor_id THEN v.valor_total_oportunidade
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_total_oportunidade
      WHEN COALESCE(v.valor_total_oportunidade, 0) > 25000 THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_total_oportunidade
      ELSE NULL
    END as valor_total_oportunidade,
    
    CASE 
      WHEN current_user_role = 'manager' THEN v.valor_venda_fechada
      WHEN auth.uid() = v.vendedor_id THEN v.valor_venda_fechada
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_venda_fechada
      WHEN COALESCE(v.valor_venda_fechada, 0) > 25000 THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN v.valor_venda_fechada
      ELSE NULL
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

-- 2. Fix remaining SECURITY DEFINER functions - add SET search_path
CREATE OR REPLACE FUNCTION public.calculate_task_partial_sales_value(task_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_sales_type TEXT;
  task_sales_confirmed BOOLEAN;
  calculated_value DECIMAL(10,2) := 0;
BEGIN
  -- Get task sales info
  SELECT sales_type, sales_confirmed 
  INTO task_sales_type, task_sales_confirmed
  FROM tasks 
  WHERE id = task_id;
  
  -- Only calculate for confirmed partial sales
  IF task_sales_type = 'parcial' AND task_sales_confirmed = true THEN
    -- Try to calculate from products table if it exists
    SELECT COALESCE(SUM(
      CASE 
        WHEN selected = true 
        THEN (COALESCE(quantity, 0) * COALESCE(price, 0))
        ELSE 0 
      END
    ), 0)
    INTO calculated_value
    FROM products p
    WHERE p.task_id = calculate_task_partial_sales_value.task_id;
  END IF;
  
  RETURN calculated_value;
EXCEPTION
  WHEN undefined_table THEN
    -- If products table doesn't exist, return 0
    RETURN 0;
END;
$function$;

-- 3. Create function to detect unauthorized BI access patterns
CREATE OR REPLACE FUNCTION public.detect_unauthorized_bi_access()
 RETURNS TABLE(
   user_id uuid, 
   violation_count bigint, 
   last_violation timestamp with time zone,
   risk_details jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Detect users accessing high-value BI data they shouldn't see
  RETURN QUERY
  SELECT 
    logs.user_id,
    COUNT(*) as violation_count,
    MAX(logs.created_at) as last_violation,
    jsonb_build_object(
      'violation_type', 'unauthorized_high_value_bi_access',
      'time_window', '24 hours',
      'recommendation', 'Review user permissions and investigate potential data breach'
    ) as risk_details
  FROM security_audit_log logs
  WHERE logs.event_type = 'high_value_bi_access'
    AND logs.metadata->>'unauthorized_access' = 'true'
    AND logs.created_at > now() - interval '24 hours'
  GROUP BY logs.user_id
  HAVING COUNT(*) >= 3;
END;
$function$;

-- 4. Create security alert function for real-time monitoring
CREATE OR REPLACE FUNCTION public.check_bi_security_alerts()
 RETURNS TABLE(
   alert_type text, 
   severity text, 
   count bigint, 
   description text, 
   recommendation text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check for unauthorized BI access attempts
  RETURN QUERY
  SELECT 
    'Unauthorized BI Access'::text,
    CASE 
      WHEN COUNT(*) > 50 THEN 'CRITICAL'
      WHEN COUNT(*) > 20 THEN 'HIGH'
      WHEN COUNT(*) > 5 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' unauthorized BI access attempts in the last 24 hours')::text,
    'Immediately review user permissions and investigate potential security breach'::text
  FROM security_audit_log
  WHERE event_type = 'high_value_bi_access' 
    AND metadata->>'unauthorized_access' = 'true'
    AND created_at > now() - interval '24 hours';
    
  -- Check for excessive BI data access
  RETURN QUERY
  SELECT 
    'Excessive BI Data Access'::text,
    CASE 
      WHEN COUNT(*) > 1000 THEN 'HIGH'
      WHEN COUNT(*) > 500 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' BI data access events in the last 24 hours')::text,
    'Monitor for unusual access patterns and potential data exfiltration'::text
  FROM security_audit_log
  WHERE event_type LIKE '%bi_%' 
    AND created_at > now() - interval '24 hours';
END;
$function$;

-- 5. Create a secure BI summary function with proper access control
CREATE OR REPLACE FUNCTION public.get_secure_bi_summary_enhanced()
 RETURNS TABLE(
   total_opportunities bigint, 
   total_sales_value numeric, 
   average_conversion_rate numeric, 
   period_start timestamp with time zone, 
   period_end timestamp with time zone, 
   access_level text,
   data_mask_applied boolean
 )
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
    END as access_level,
    
    (current_user_role != 'manager') as data_mask_applied
    
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
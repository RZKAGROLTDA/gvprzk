-- SECURITY FIXES - Phase 1: Critical BI Data Protection & Search Path Fixes (CORRECTED)

-- 1. CRITICAL: Add RLS policies to vw_oportunidades_kpis view
ALTER TABLE vw_oportunidades_kpis ENABLE ROW LEVEL SECURITY;

-- Policy for managers - full access
CREATE POLICY "Managers can view all BI data"
ON vw_oportunidades_kpis
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid() AND role = 'manager'
  )
);

-- Policy for supervisors - only their filial's data
CREATE POLICY "Supervisors can view their filial BI data"
ON vw_oportunidades_kpis
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = vw_oportunidades_kpis.vendedor_id
    AND p1.filial_id = p2.filial_id
    AND p1.filial_id IS NOT NULL
  )
);

-- Policy for users - only their own task data
CREATE POLICY "Users can view their own BI data"
ON vw_oportunidades_kpis
FOR SELECT
USING (auth.uid() = vendedor_id);

-- Policy for consultants - limited access to low-value data only
CREATE POLICY "Consultants can view limited BI data"
ON vw_oportunidades_kpis
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p2.user_id = vw_oportunidades_kpis.vendedor_id
    AND p1.filial_id = p2.filial_id
    AND p1.filial_id IS NOT NULL
    AND COALESCE(vw_oportunidades_kpis.valor_total_oportunidade, 0) <= 25000
  )
);

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

-- 5. Enhanced logging for BI data access (trigger approach without SELECT trigger)
CREATE OR REPLACE FUNCTION public.log_bi_data_access(
  accessed_data jsonb,
  access_type text DEFAULT 'query'
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  is_high_value boolean;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM profiles 
  WHERE user_id = auth.uid();
  
  -- Determine if this is high-value data
  is_high_value := (
    COALESCE((accessed_data->>'valor_total_oportunidade')::numeric, 0) > 25000 OR 
    COALESCE((accessed_data->>'valor_venda_fechada')::numeric, 0) > 25000
  );
  
  -- Log the access attempt
  PERFORM secure_log_security_event(
    'bi_data_access_attempt',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_type', access_type,
      'high_value_access', is_high_value,
      'timestamp', now(),
      'data_summary', jsonb_build_object(
        'cliente_nome_masked', CASE 
          WHEN accessed_data->>'cliente_nome' IS NOT NULL 
          THEN LEFT(accessed_data->>'cliente_nome', 3) || '***'
          ELSE NULL
        END,
        'valor_range', CASE 
          WHEN is_high_value THEN 'high_value'
          ELSE 'standard'
        END
      )
    ),
    CASE WHEN is_high_value THEN 4 ELSE 2 END
  );
  
  -- Additional logging for high-value access
  IF is_high_value THEN
    PERFORM secure_log_security_event(
      'high_value_bi_access',
      COALESCE((accessed_data->>'vendedor_id')::uuid, auth.uid()),
      jsonb_build_object(
        'valor_total_oportunidade', accessed_data->>'valor_total_oportunidade',
        'valor_venda_fechada', accessed_data->>'valor_venda_fechada',
        'user_role', current_user_role,
        'unauthorized_access', CASE 
          WHEN current_user_role NOT IN ('manager', 'supervisor') AND 
               auth.uid()::text != accessed_data->>'vendedor_id'
          THEN true 
          ELSE false 
        END
      ),
      5
    );
  END IF;
END;
$function$;
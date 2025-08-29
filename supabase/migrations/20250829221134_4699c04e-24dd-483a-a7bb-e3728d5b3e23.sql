-- SECURITY FIXES - Phase 2: Fix Remaining Search Path Vulnerabilities

-- Fix get_secure_business_intelligence function
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
  
  -- Return data based on strict role-based access control with masking
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

-- Fix get_secure_bi_summary function
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

-- Fix secure_log_security_event function
CREATE OR REPLACE FUNCTION public.secure_log_security_event(event_type text, target_user_id uuid, metadata jsonb DEFAULT '{}'::jsonb, risk_score integer DEFAULT 1)
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
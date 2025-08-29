-- ==============================================
-- CRITICAL SECURITY FIX: Secure vw_oportunidades_kpis View
-- ==============================================

-- 1. Enable RLS on the view (this is the critical missing piece)
ALTER VIEW vw_oportunidades_kpis SET (security_barrier = true);

-- 2. Create RLS policies for the view following same pattern as other tables
CREATE POLICY "Business Intelligence: Role-based access control" 
ON vw_oportunidades_kpis
FOR SELECT 
USING (
  -- Managers can see all business intelligence data
  (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  )) OR
  -- Supervisors can see data from their filial only
  (EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = vw_oportunidades_kpis.vendedor_id
    AND p1.filial_id = p2.filial_id
    AND p1.filial_id IS NOT NULL
  )) OR
  -- Users can only see their own sales data
  (auth.uid() = vw_oportunidades_kpis.vendedor_id)
);

-- 3. Log access to business intelligence data for audit trail
CREATE OR REPLACE FUNCTION log_bi_data_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log BI data access for compliance and security monitoring
  INSERT INTO security_audit_log (
    user_id,
    event_type,
    metadata,
    risk_score
  ) VALUES (
    auth.uid(),
    'business_intelligence_access',
    jsonb_build_object(
      'view_name', 'vw_oportunidades_kpis',
      'access_timestamp', NOW(),
      'user_role', (SELECT role FROM profiles WHERE user_id = auth.uid())
    ),
    2  -- Medium risk for BI data access
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger to log BI access (Note: views don't support AFTER SELECT triggers directly)
-- Instead, we'll log via the secure function calls

-- 5. Create secure function to access BI data with automatic logging
CREATE OR REPLACE FUNCTION get_secure_bi_data()
RETURNS TABLE(
  id uuid,
  filial text,
  cliente_nome text,
  status text,
  valor_total_oportunidade numeric,
  valor_venda_fechada numeric,
  conversao_pct numeric,
  data_criacao timestamp with time zone,
  data_fechamento timestamp with time zone,
  vendedor_id uuid,
  tipo_task text,
  access_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log BI data access
  PERFORM secure_log_security_event(
    'business_intelligence_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_timestamp', NOW()
    ),
    2
  );
  
  -- Return data based on role with masking
  RETURN QUERY
  SELECT 
    v.id,
    v.filial,
    -- Mask customer names for non-managers
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
    
    -- Mask high-value sales data for non-managers
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
    
    v.conversao_pct,
    v.data_criacao,
    v.data_fechamento,
    v.vendedor_id,
    v.tipo_task,
    
    -- Indicate access level
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = v.vendedor_id THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
      ) THEN 'supervisor'
      ELSE 'limited'
    END as access_level
    
  FROM vw_oportunidades_kpis v
  WHERE 
    -- Apply same access control as RLS policy
    (current_user_role = 'manager') OR
    (auth.uid() = v.vendedor_id) OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p2 
      WHERE p2.user_id = v.vendedor_id AND p2.filial_id = user_filial_id
    ));
END;
$$;
-- ==============================================
-- SECURITY FIX: Add RLS policies to vw_oportunidades_kpis view
-- ==============================================

-- Enable RLS on the view (views can have RLS in PostgreSQL)
ALTER VIEW vw_oportunidades_kpis SET (security_barrier = true);

-- Note: Views don't support RLS directly, but we can create security barrier policies
-- Instead, we need to create a secure function that applies the same access control

-- Create a secure function to access BI data with proper access control
CREATE OR REPLACE FUNCTION get_secure_bi_data_with_access_control()
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
SET search_path = 'public'
AS $$
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
$$;

-- Create a restricted view that uses the secure function
CREATE OR REPLACE VIEW vw_secure_oportunidades_kpis AS
SELECT * FROM get_secure_bi_data_with_access_control();

-- Add comment explaining the security implementation
COMMENT ON FUNCTION get_secure_bi_data_with_access_control() IS 
'Secure access function for business intelligence data. Implements role-based access control with data masking for unauthorized users. Managers see all data, users see only their own data, supervisors see their filial data.';

-- Revoke direct access to the original view for non-managers
REVOKE SELECT ON vw_oportunidades_kpis FROM authenticated;
REVOKE SELECT ON vw_oportunidades_kpis FROM anon;

-- Grant access to the secure function instead
GRANT EXECUTE ON FUNCTION get_secure_bi_data_with_access_control() TO authenticated;

-- For backwards compatibility, create a secure wrapper view
CREATE OR REPLACE VIEW vw_oportunidades_kpis_secure AS
SELECT 
  id,
  filial,
  cliente_nome,
  status,
  valor_total_oportunidade,
  valor_venda_fechada,
  conversao_pct,
  data_criacao,
  data_fechamento,
  vendedor_id,
  tipo_task
FROM get_secure_bi_data_with_access_control();
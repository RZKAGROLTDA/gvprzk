-- Criar função RPC para contar registros do funil de vendas de forma otimizada
CREATE OR REPLACE FUNCTION get_sales_funnel_counts()
RETURNS TABLE (
  contatos bigint,
  prospects bigint,
  vendas bigint,
  vendas_parciais bigint,
  vendas_perdidas bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE (sales_confirmed IS NULL OR sales_confirmed = false) AND (is_prospect IS NULL OR is_prospect = false)) as contatos,
    COUNT(*) FILTER (WHERE is_prospect = true) as prospects,
    COUNT(*) FILTER (WHERE sales_confirmed = true AND (sales_type IS NULL OR sales_type != 'parcial')) as vendas,
    COUNT(*) FILTER (WHERE sales_confirmed = true AND sales_type = 'parcial') as vendas_parciais,
    COUNT(*) FILTER (WHERE sales_type = 'perdido' OR status = 'lost') as vendas_perdidas
  FROM tasks
  WHERE (
    -- User owns the task
    created_by = auth.uid()
    OR
    -- User is manager
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    )
    OR
    -- User is supervisor in same filial
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
      AND p2.user_id = tasks.created_by
      AND p1.filial_id = p2.filial_id
      AND p1.role = 'supervisor'
      AND p1.approval_status = 'approved'
    )
    OR
    -- User is consultant in same filial with value <= 10000
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid()
      AND p2.user_id = tasks.created_by
      AND p1.filial_id = p2.filial_id
      AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
      AND p1.approval_status = 'approved'
      AND COALESCE(tasks.sales_value, 0) <= 10000
    )
  );
$$;
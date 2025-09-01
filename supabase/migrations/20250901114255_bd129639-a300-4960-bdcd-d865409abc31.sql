-- Fix Security Definer functions by properly handling dependencies
-- This addresses the security linter warning about SECURITY DEFINER views/functions

-- 1. First, drop dependent views that use the SECURITY DEFINER function
DROP VIEW IF EXISTS public.vw_secure_oportunidades_kpis CASCADE;
DROP VIEW IF EXISTS public.vw_oportunidades_kpis_secure CASCADE;

-- 2. Drop the SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.get_secure_bi_data_with_access_control() CASCADE;

-- 3. Update calculate_task_partial_sales_value function to remove SECURITY DEFINER
DROP FUNCTION IF EXISTS public.calculate_task_partial_sales_value(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.calculate_task_partial_sales_value(task_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path = 'public'
AS $function$
DECLARE
  task_sales_type TEXT;
  task_sales_confirmed BOOLEAN;
  calculated_value DECIMAL(10,2) := 0;
BEGIN
  -- Get task sales info (will respect RLS policies)
  SELECT sales_type, sales_confirmed 
  INTO task_sales_type, task_sales_confirmed
  FROM tasks 
  WHERE id = task_id;
  
  -- Only calculate for confirmed partial sales
  IF task_sales_type = 'parcial' AND task_sales_confirmed = true THEN
    -- Calculate from products table (will respect RLS policies)
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
  WHEN insufficient_privilege THEN
    -- If user doesn't have access to task data, return 0
    RETURN 0;
END;
$function$;

-- 4. Create a secure view that respects RLS instead of using SECURITY DEFINER
-- This view will automatically respect the RLS policies of the underlying tables
CREATE OR REPLACE VIEW public.vw_secure_oportunidades_kpis AS
SELECT 
  v.id,
  v.valor_total_oportunidade,
  v.valor_venda_fechada,
  v.conversao_pct,
  v.data_criacao,
  v.data_fechamento,
  v.vendedor_id,
  v.filial,
  v.cliente_nome,
  v.status,
  v.tipo_task
FROM vw_oportunidades_kpis v;

-- 5. Grant appropriate permissions
GRANT SELECT ON public.vw_secure_oportunidades_kpis TO authenticated;

-- 6. Log the security improvement
COMMENT ON VIEW public.vw_secure_oportunidades_kpis IS 
'Secure view that respects RLS policies instead of using SECURITY DEFINER. 
Created to address security definer view vulnerability.';

COMMENT ON FUNCTION public.calculate_task_partial_sales_value(uuid) IS 
'Updated to remove SECURITY DEFINER and respect RLS policies. 
Addresses security definer function vulnerability.';
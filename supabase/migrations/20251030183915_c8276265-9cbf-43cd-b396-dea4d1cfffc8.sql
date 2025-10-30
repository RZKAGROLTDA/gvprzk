-- Fix function search_path security issue
-- Add SET search_path TO 'public' to functions missing this security setting

-- Fix: get_sales_funnel_counts (SECURITY DEFINER - CRITICAL)
CREATE OR REPLACE FUNCTION public.get_sales_funnel_counts()
 RETURNS TABLE(contatos bigint, prospects bigint, vendas bigint, vendas_parciais bigint, vendas_perdidas bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Fix: calculate_workflow_dates (Trigger function)
CREATE OR REPLACE FUNCTION public.calculate_workflow_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If session_date is NULL, set preview_date, gallery_date, and voucher_date to NULL
  IF NEW.session_date IS NULL THEN
    NEW.preview_date := NULL;
    NEW.gallery_date := NULL;
    NEW.voucher_date := NULL;
  ELSE
    -- Calculate workflow dates based on session_date when it's filled
    NEW.preview_date := NEW.session_date + INTERVAL '1 day';  -- D+1
    NEW.gallery_date := NEW.session_date + INTERVAL '7 days'; -- D+7
    NEW.voucher_date := NEW.session_date + INTERVAL '30 days'; -- D+30
  END IF;
  
  -- FIXED: Calculate return_date as D+2 (budget_date + 2 days) instead of D+15
  IF NEW.budget_date IS NOT NULL THEN
    NEW.return_date := NEW.budget_date + INTERVAL '2 days';  -- Changed from 15 to 2 days
  ELSE
    NEW.return_date := NULL;
  END IF;
  
  RETURN NEW;
END;
$function$;
-- Fix Security Definer View issue by removing SECURITY DEFINER from problematic views
-- This ensures views use the querying user's permissions instead of view creator's permissions

-- First, let's check what views exist with SECURITY DEFINER
SELECT schemaname, viewname, definition 
FROM pg_views 
WHERE schemaname = 'public' 
AND definition ILIKE '%security definer%';

-- Drop and recreate secure_tasks_view_final without SECURITY DEFINER
DROP VIEW IF EXISTS public.secure_tasks_view_final;

-- Create a regular view without SECURITY DEFINER for secure_tasks_view_final
-- This view will respect the querying user's RLS policies
CREATE VIEW public.secure_tasks_view_final AS
SELECT 
  t.id,
  t.name,
  t.responsible,
  t.client,
  t.property,
  t.filial,
  t.email,
  t.phone,
  t.status,
  t.priority,
  t.task_type,
  t.observations,
  t.sales_value,
  t.start_date,
  t.end_date,
  t.created_at,
  t.created_by,
  t.updated_at,
  t.is_prospect,
  t.sales_confirmed,
  t.equipment_quantity,
  t.equipment_list,
  t.propertyhectares,
  t.initial_km,
  t.final_km,
  t.check_in_location,
  t.clientcode,
  t.sales_type,
  t.start_time,
  t.end_time,
  t.prospect_notes,
  t.family_product,
  t.photos,
  t.documents,
  t.partial_sales_value
FROM public.tasks t;

-- Enable RLS on the view (this will inherit the RLS policies from the underlying tasks table)
ALTER VIEW public.secure_tasks_view_final SET (security_barrier = true);

-- Add a comment explaining the security approach
COMMENT ON VIEW public.secure_tasks_view_final IS 'Secure view of tasks that respects user RLS policies without using SECURITY DEFINER';
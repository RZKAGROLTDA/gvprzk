
-- Função de debug para testar acesso a opportunities
CREATE OR REPLACE FUNCTION public.test_supervisor_opportunity_access(
  p_supervisor_id uuid
)
RETURNS TABLE (
  opportunity_id uuid,
  cliente_nome text,
  filial text,
  task_creator_id uuid,
  task_creator_name text,
  supervisor_filial uuid,
  task_creator_filial uuid,
  has_role_supervisor boolean,
  filials_match boolean,
  both_approved boolean,
  should_see boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id as opportunity_id,
    o.cliente_nome,
    o.filial,
    t.created_by as task_creator_id,
    p_creator.name as task_creator_name,
    p_supervisor.filial_id as supervisor_filial,
    p_creator.filial_id as task_creator_filial,
    has_role(p_supervisor_id, 'supervisor'::app_role) as has_role_supervisor,
    (p_supervisor.filial_id = p_creator.filial_id) as filials_match,
    (p_supervisor.approval_status = 'approved' AND p_creator.approval_status = 'approved') as both_approved,
    (
      has_role(p_supervisor_id, 'manager'::app_role) OR
      (t.created_by = p_supervisor_id) OR
      (
        has_role(p_supervisor_id, 'supervisor'::app_role) AND
        p_supervisor.filial_id = p_creator.filial_id AND
        p_supervisor.approval_status = 'approved' AND
        p_creator.approval_status = 'approved'
      )
    ) as should_see
  FROM opportunities o
  JOIN tasks t ON t.id = o.task_id
  JOIN profiles p_creator ON p_creator.user_id = t.created_by
  CROSS JOIN profiles p_supervisor
  WHERE p_supervisor.user_id = p_supervisor_id
  ORDER BY o.created_at DESC;
END;
$$;

-- Testar com o Robson Gil
SELECT * FROM test_supervisor_opportunity_access('9772f518-1f3e-49db-8536-2648d1ca1959')
WHERE supervisor_filial = '9244b8f2-50cc-4939-9b29-980c926a04da'
LIMIT 10;

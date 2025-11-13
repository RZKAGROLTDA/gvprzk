-- Função SECURITY DEFINER para verificar acesso a opportunities
-- Isso evita problemas de RLS circular quando policies fazem JOIN com outras tabelas que têm RLS
CREATE OR REPLACE FUNCTION public.can_view_opportunity(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_task_creator_id uuid;
  v_current_user_id uuid;
  v_task_creator_filial uuid;
  v_current_user_filial uuid;
  v_task_creator_approved boolean;
  v_current_user_approved boolean;
BEGIN
  -- Obter user ID atual
  v_current_user_id := auth.uid();
  
  -- Se for manager, pode ver tudo
  IF has_role(v_current_user_id, 'manager'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Buscar task_id e creator da opportunity
  SELECT task_id INTO v_task_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_task_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Buscar creator da task
  SELECT created_by INTO v_task_creator_id
  FROM tasks
  WHERE id = v_task_id;
  
  -- Se o usuário atual é o criador da task, pode ver
  IF v_task_creator_id = v_current_user_id THEN
    RETURN true;
  END IF;
  
  -- Se for supervisor, verificar se está na mesma filial que o criador da task
  IF has_role(v_current_user_id, 'supervisor'::app_role) THEN
    -- Buscar filial e approval status do criador da task
    SELECT filial_id, approval_status = 'approved'
    INTO v_task_creator_filial, v_task_creator_approved
    FROM profiles
    WHERE user_id = v_task_creator_id;
    
    -- Buscar filial e approval status do supervisor atual
    SELECT filial_id, approval_status = 'approved'
    INTO v_current_user_filial, v_current_user_approved
    FROM profiles
    WHERE user_id = v_current_user_id;
    
    -- Se ambos estão approved e na mesma filial, pode ver
    IF v_task_creator_filial IS NOT NULL 
       AND v_current_user_filial IS NOT NULL
       AND v_task_creator_filial = v_current_user_filial
       AND v_task_creator_approved
       AND v_current_user_approved THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Dropar policies existentes
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;
DROP POLICY IF EXISTS "Users can update opportunities for their tasks" ON opportunities;

-- Nova política de SELECT usando a função SECURITY DEFINER
CREATE POLICY "Users can view opportunities for accessible tasks"
ON opportunities
FOR SELECT
TO authenticated
USING (can_view_opportunity(id));

-- Nova política de UPDATE usando a mesma função
CREATE POLICY "Users can update opportunities for their tasks"
ON opportunities
FOR UPDATE
TO authenticated
USING (can_view_opportunity(id))
WITH CHECK (can_view_opportunity(id));
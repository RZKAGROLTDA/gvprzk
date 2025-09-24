-- Primeiro, criar índices para otimizar performance das queries
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_filial ON public.tasks(filial);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_filial_id ON public.profiles(filial_id);
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);

-- Criar função ultra-simplificada para carregamento rápido
CREATE OR REPLACE FUNCTION public.get_tasks_optimized()
RETURNS TABLE(
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  status text,
  priority text,
  task_type text,
  start_date date,
  end_date date,
  created_at timestamp with time zone,
  created_by uuid,
  sales_value numeric,
  access_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role text;
  user_filial uuid;
BEGIN
  -- Verificação rápida de autenticação
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Query única e otimizada para pegar role e filial
  SELECT p.role, p.filial_id 
  INTO user_role, user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- Se não tem perfil aprovado, retorna vazio
  IF user_role IS NULL THEN
    RETURN;
  END IF;
  
  -- Query simplificada - apenas campos essenciais
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Mascaramento simples baseado apenas em role
    CASE 
      WHEN user_role = 'manager' OR t.created_by = auth.uid() THEN t.client
      ELSE '[Cliente Protegido]'
    END,
    CASE 
      WHEN user_role = 'manager' OR t.created_by = auth.uid() THEN t.property
      ELSE '[Propriedade Protegida]'
    END,
    t.filial,
    t.status,
    t.priority,
    t.task_type,
    t.start_date,
    t.end_date,
    t.created_at,
    t.created_by,
    CASE 
      WHEN user_role = 'manager' OR t.created_by = auth.uid() THEN t.sales_value
      ELSE NULL
    END,
    CASE 
      WHEN user_role = 'manager' THEN 'full'
      WHEN t.created_by = auth.uid() THEN 'owner'
      ELSE 'limited'
    END
  FROM public.tasks t
  WHERE (
    -- Controle de acesso simplificado
    user_role = 'manager' OR
    t.created_by = auth.uid() OR
    (user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by 
      AND p2.filial_id = user_filial
    ))
  )
  ORDER BY t.created_at DESC
  LIMIT 1000; -- Limite para performance
END;
$$;

-- Função para carregar detalhes sob demanda (lazy loading)
CREATE OR REPLACE FUNCTION public.get_task_details(task_id_param uuid)
RETURNS TABLE(
  email text,
  phone text,
  observations text,
  photos text[],
  documents text[],
  equipment_list jsonb,
  check_in_location jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role text;
  task_owner uuid;
BEGIN
  -- Verificar autenticação
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Verificar role do usuário
  SELECT p.role INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- Verificar dono da task
  SELECT t.created_by INTO task_owner
  FROM public.tasks t
  WHERE t.id = task_id_param;
  
  -- Verificar permissão
  IF user_role = 'manager' OR task_owner = auth.uid() THEN
    RETURN QUERY
    SELECT 
      t.email,
      t.phone,
      t.observations,
      t.photos,
      t.documents,
      t.equipment_list,
      t.check_in_location
    FROM public.tasks t
    WHERE t.id = task_id_param;
  END IF;
END;
$$;
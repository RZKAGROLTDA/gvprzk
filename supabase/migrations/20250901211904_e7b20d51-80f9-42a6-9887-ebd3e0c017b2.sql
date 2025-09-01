-- COMPREHENSIVE SECURITY FIXES FOR CUSTOMER DATA PROTECTION

-- 1. Criar função RPC segura para carregar usuários de uma filial
CREATE OR REPLACE FUNCTION public.get_filial_users(filial_uuid uuid)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role text,
  approval_status text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verificar se o usuário atual é admin
  IF NOT simple_is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: permissões de administrador necessárias';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.email,
    p.role,
    p.approval_status,
    p.created_at
  FROM public.profiles p
  WHERE p.filial_id = filial_uuid
  ORDER BY p.name ASC;
END;
$$;

-- 2. Criar função segura para acessar dados de clientes com mascaramento
CREATE OR REPLACE FUNCTION public.get_secure_clients_enhanced()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  phone text,
  stage text,
  notes text,
  session_date date,
  created_at timestamp with time zone,
  created_by uuid,
  is_masked boolean,
  access_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
  current_user_filial uuid;
BEGIN
  -- Obter role e filial do usuário atual
  SELECT p.role, p.filial_id INTO current_user_role, current_user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  AND p.approval_status = 'approved';
  
  IF current_user_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: perfil não aprovado ou inexistente';
  END IF;

  -- Log do acesso aos dados
  PERFORM public.secure_log_security_event(
    'secure_client_data_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_type', 'bulk_client_view'
    ),
    2
  );

  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.email
      ELSE SUBSTRING(c.email FROM 1 FOR 1) || '***@' || SPLIT_PART(c.email, '@', 2)
    END as email,
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.phone
      ELSE '***-***-' || RIGHT(COALESCE(c.phone, ''), 4)
    END as phone,
    c.stage,
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.notes
      ELSE '[Dados Protegidos]'
    END as notes,
    c.session_date,
    c.created_at,
    c.created_by,
    (current_user_role != 'manager' AND c.created_by != auth.uid()) as is_masked,
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN c.created_by = auth.uid() THEN 'owner'
      ELSE 'limited'
    END as access_level
  FROM public.clients c
  WHERE c.archived = false
  AND (
    c.created_by = auth.uid() OR
    current_user_role = 'manager' OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = c.created_by 
      AND p2.filial_id = current_user_filial
    ))
  );
END;
$$;

-- 3. Melhorar função de acesso seguro a tasks com mascaramento aprimorado
CREATE OR REPLACE FUNCTION public.get_secure_tasks_enhanced(
  limit_count integer DEFAULT 100,
  offset_count integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  email text,
  phone text,
  sales_value numeric,
  sales_type text,
  is_masked boolean,
  access_level text,
  start_date date,
  end_date date,
  status text,
  priority text,
  task_type text,
  observations text,
  created_at timestamp with time zone,
  created_by uuid,
  is_prospect boolean,
  sales_confirmed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  high_value_threshold numeric := 25000;
BEGIN
  -- Verificar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: autenticação necessária';
  END IF;

  -- Obter role e filial do usuário atual
  SELECT p.role, p.filial_id INTO current_user_role, current_user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  AND p.approval_status = 'approved';
  
  IF current_user_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: perfil não aprovado';
  END IF;

  -- Log de acesso aos dados
  PERFORM public.secure_log_security_event(
    'secure_task_bulk_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'limit_count', limit_count,
      'offset_count', offset_count
    ),
    CASE WHEN limit_count > 50 THEN 3 ELSE 2 END
  );

  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Mascarar dados do cliente baseado no role e valor da venda
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.client
      WHEN COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.client
      ELSE '***'
    END as client,
    -- Mascarar propriedade
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.property
      WHEN COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.property
      ELSE '***'
    END as property,
    t.filial,
    -- Mascarar email
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.email
      WHEN COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.email
      ELSE '***@***.***'
    END as email,
    -- Mascarar telefone
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.phone
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.phone
      WHEN COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.phone
      ELSE '***'
    END as phone,
    -- Mascarar valor de vendas
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.sales_value
      ELSE NULL
    END as sales_value,
    t.sales_type,
    -- Indicador de mascaramento
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN false
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN false
      WHEN COALESCE(t.sales_value, 0) <= high_value_threshold THEN false
      ELSE true
    END as is_masked,
    -- Nível de acesso
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN t.created_by = auth.uid() THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN 'supervisor'
      ELSE 'limited'
    END as access_level,
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    t.observations,
    t.created_at,
    t.created_by,
    t.is_prospect,
    t.sales_confirmed
  FROM public.tasks t
  WHERE (
    -- Manager vê tudo
    current_user_role = 'manager' OR
    -- Usuário vê suas próprias tasks
    t.created_by = auth.uid() OR
    -- Supervisor vê tasks da mesma filial
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = t.created_by 
      AND p.filial_id = current_user_filial
    )) OR
    -- Consultants vêem tasks de baixo valor da mesma filial
    (current_user_role IN ('consultant', 'rac', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p 
       WHERE p.user_id = t.created_by 
       AND p.filial_id = current_user_filial
     ) 
     AND COALESCE(t.sales_value, 0) <= high_value_threshold)
  )
  ORDER BY t.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;

-- 4. Função para monitorar acesso a dados de alto valor
CREATE OR REPLACE FUNCTION public.monitor_high_value_access()
RETURNS TABLE(
  event_type text,
  user_count bigint,
  risk_level text,
  last_24h bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Apenas administradores podem acessar
  IF NOT simple_is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: permissões de administrador necessárias';
  END IF;

  -- Acessos a dados de alto valor
  RETURN QUERY
  SELECT 
    'high_value_data_access'::text,
    COUNT(DISTINCT user_id)::bigint,
    CASE 
      WHEN COUNT(*) > 100 THEN 'critical'
      WHEN COUNT(*) > 50 THEN 'high'
      WHEN COUNT(*) > 20 THEN 'medium'
      ELSE 'low'
    END::text,
    COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::bigint
  FROM public.security_audit_log
  WHERE event_type LIKE '%high_value%'
  AND created_at > now() - interval '7 days';

  -- Tentativas de acesso não autorizado
  RETURN QUERY
  SELECT 
    'unauthorized_access_attempts'::text,
    COUNT(DISTINCT user_id)::bigint,
    CASE 
      WHEN COUNT(*) > 50 THEN 'critical'
      WHEN COUNT(*) > 20 THEN 'high'
      WHEN COUNT(*) > 10 THEN 'medium'
      ELSE 'low'
    END::text,
    COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::bigint
  FROM public.security_audit_log
  WHERE risk_score >= 4
  AND created_at > now() - interval '7 days';
END;
$$;

-- 5. Melhorar políticas RLS para tasks_backup (proteção adicional)
DROP POLICY IF EXISTS "Simple admin backup access" ON public.tasks_backup;

CREATE POLICY "Enhanced backup access control" 
ON public.tasks_backup 
FOR ALL 
USING (
  simple_is_admin() AND 
  -- Log de acesso aos backups
  (
    SELECT public.secure_log_security_event(
      'backup_data_access',
      auth.uid(),
      jsonb_build_object('table', 'tasks_backup'),
      3
    ) IS NOT NULL OR true
  )
);

-- 6. Adicionar índices para melhorar performance das consultas de segurança
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_event_time 
ON public.security_audit_log(user_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_risk_time 
ON public.security_audit_log(risk_score, created_at) 
WHERE risk_score >= 3;

CREATE INDEX IF NOT EXISTS idx_tasks_sales_value_masked 
ON public.tasks(sales_value, created_by) 
WHERE sales_value > 25000;

-- 7. Função para limpar logs antigos de segurança (retenção de dados)
CREATE OR REPLACE FUNCTION public.cleanup_old_security_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Apenas administradores podem executar
  IF NOT simple_is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: permissões de administrador necessárias';
  END IF;

  -- Manter apenas logs dos últimos 90 dias
  DELETE FROM public.security_audit_log 
  WHERE created_at < now() - interval '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log da operação de limpeza
  PERFORM public.secure_log_security_event(
    'security_log_cleanup',
    auth.uid(),
    jsonb_build_object(
      'deleted_records', deleted_count,
      'retention_days', 90
    ),
    2
  );
  
  RETURN deleted_count;
END;
$$;
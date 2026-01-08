
-- =====================================================
-- LIMPEZA DE USUÁRIOS DE TESTE
-- Deleta todos os usuários com email começando com 'teste'
-- =====================================================

-- 1. Deletar roles dos usuários de teste
DELETE FROM public.user_roles 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'teste%'
);

-- 2. Deletar logs de auditoria de segurança
DELETE FROM public.security_audit_log 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'teste%'
);

-- 3. Deletar logs de criação de tarefas
DELETE FROM public.task_creation_log 
WHERE created_by IN (
  SELECT id::text FROM auth.users WHERE email LIKE 'teste%'
);

-- 4. Deletar cache de diretório de usuários
DELETE FROM public.user_directory_cache 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'teste%'
);

-- 5. Deletar profiles dos usuários de teste
DELETE FROM public.profiles 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'teste%'
);

-- 6. Deletar usuários da tabela auth.users
-- NOTA: Isso requer permissão de service_role, então usamos a função admin
-- Os usuários serão deletados: teste@teste.com, teste4@teste.com, teste5@hotmail.com
DELETE FROM auth.users WHERE email LIKE 'teste%';

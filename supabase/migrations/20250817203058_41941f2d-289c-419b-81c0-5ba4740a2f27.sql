-- Limpar todos os dados das tabelas para liberar ferramenta para vendedores
-- Mantém a estrutura das tabelas mas remove todos os dados de teste

-- Remover lembretes
DELETE FROM public.reminders;

-- Remover produtos
DELETE FROM public.products;

-- Remover tarefas
DELETE FROM public.tasks;

-- Remover convites de usuários
DELETE FROM public.user_invitations;

-- Resetar sequências se existirem
-- (Como usamos UUIDs, não há sequências para resetar)

-- Confirmar limpeza
SELECT 
  'tasks' as tabela, 
  COUNT(*) as registros_restantes 
FROM public.tasks
UNION ALL
SELECT 
  'products' as tabela, 
  COUNT(*) as registros_restantes 
FROM public.products
UNION ALL
SELECT 
  'reminders' as tabela, 
  COUNT(*) as registros_restantes 
FROM public.reminders
UNION ALL
SELECT 
  'user_invitations' as tabela, 
  COUNT(*) as registros_restantes 
FROM public.user_invitations;
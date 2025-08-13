-- Limpar dados dos formulários para preparar a ferramenta para o time de vendas

-- Limpar produtos relacionados às tarefas
DELETE FROM public.products;

-- Limpar lembretes das tarefas  
DELETE FROM public.reminders;

-- Limpar todas as tarefas
DELETE FROM public.tasks;

-- Limpar convites de usuários pendentes
DELETE FROM public.user_invitations WHERE status = 'pending';

-- Resetar sequências se necessário (opcional)
-- Como estamos usando UUIDs, não há sequências para resetar

-- Confirmar limpeza
SELECT 'Dados limpos com sucesso!' as status;
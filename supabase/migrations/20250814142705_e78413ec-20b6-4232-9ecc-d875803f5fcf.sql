-- Limpar todos os dados dos formulários para reset da ferramenta
-- Manter estruturas das tabelas e usuários do sistema

-- Deletar reminders primeiro (devido às dependências)
DELETE FROM public.reminders;

-- Deletar produtos
DELETE FROM public.products;

-- Deletar todas as tarefas
DELETE FROM public.tasks;

-- Limpar convites de usuários pendentes (opcional - manter apenas se necessário)
DELETE FROM public.user_invitations WHERE status = 'pending';

-- Reset dos sequences se necessário
-- As tabelas usam UUID então não há sequences para resetar

-- Mensagem de confirmação
SELECT 'Dados dos formulários limpos com sucesso. Sistema pronto para o time de vendas.' as resultado;
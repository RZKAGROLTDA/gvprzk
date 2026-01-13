-- Adicionar coluna filial_atendida na tabela tasks
-- Este campo é para registrar qual filial foi atendida em ligações (pode ser diferente da filial do usuário)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS filial_atendida TEXT;

-- Criar índice para performance em consultas que filtram por filial_atendida
CREATE INDEX IF NOT EXISTS idx_tasks_filial_atendida ON public.tasks(filial_atendida) WHERE filial_atendida IS NOT NULL;

-- Adicionar comentário na coluna para documentação
COMMENT ON COLUMN public.tasks.filial_atendida IS 'Filial atendida durante a ligação. Diferente do campo filial que é a filial do usuário.';
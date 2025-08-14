-- Habilitar realtime para a tabela tasks
ALTER TABLE public.tasks REPLICA IDENTITY FULL;

-- Adicionar tabela à publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
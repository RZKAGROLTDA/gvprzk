-- Adicionar coluna clientCode na tabela tasks para armazenar código do cliente
ALTER TABLE public.tasks 
ADD COLUMN clientCode text;
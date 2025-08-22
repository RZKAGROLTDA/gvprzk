-- Adicionar campos email e propertyHectares na tabela tasks
ALTER TABLE public.tasks 
ADD COLUMN email text,
ADD COLUMN propertyHectares integer;
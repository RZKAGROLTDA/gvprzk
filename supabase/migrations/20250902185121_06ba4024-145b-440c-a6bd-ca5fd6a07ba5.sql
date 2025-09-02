-- Fix para corrigir tasks sem filial
-- Atualiza o campo filial das tasks usando a filial do usuário que criou a task

UPDATE public.tasks 
SET filial = f.nome,
    updated_at = now()
FROM public.profiles p
JOIN public.filiais f ON p.filial_id = f.id
WHERE tasks.created_by = p.user_id
  AND (tasks.filial IS NULL OR tasks.filial = '' OR tasks.filial = 'Filial')
  AND p.filial_id IS NOT NULL;

-- Log para verificar quantos registros foram atualizados
-- (Esta query só será executada se a anterior funcionar)
DO $$
DECLARE
  updated_count integer;
BEGIN
  -- Contar registros que ainda precisam ser corrigidos
  SELECT COUNT(*) INTO updated_count
  FROM public.tasks t
  LEFT JOIN public.profiles p ON t.created_by = p.user_id
  WHERE (t.filial IS NULL OR t.filial = '' OR t.filial = 'Filial')
    AND p.filial_id IS NOT NULL;
    
  RAISE NOTICE 'Restam % tasks sem filial que poderiam ser corrigidas', updated_count;
END $$;
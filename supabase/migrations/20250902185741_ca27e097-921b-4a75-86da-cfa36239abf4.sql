-- Correção para tasks com filial vazia (string vazia)
-- O problema é que algumas tasks têm filial = '' (string vazia) que não foi capturada na primeira migração

UPDATE public.tasks 
SET filial = f.nome,
    updated_at = now()
FROM public.profiles p
JOIN public.filiais f ON p.filial_id = f.id
WHERE tasks.created_by = p.user_id
  AND tasks.filial = ''  -- Focar especificamente em string vazia
  AND p.filial_id IS NOT NULL;

-- Verificar se ainda existem registros problemáticos
DO $$
DECLARE
  remaining_count integer;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM public.tasks t
  LEFT JOIN public.profiles p ON t.created_by = p.user_id
  WHERE (t.filial IS NULL OR t.filial = '' OR t.filial = 'Filial');
    
  RAISE NOTICE 'Após correção, restam % tasks sem filial', remaining_count;
END $$;
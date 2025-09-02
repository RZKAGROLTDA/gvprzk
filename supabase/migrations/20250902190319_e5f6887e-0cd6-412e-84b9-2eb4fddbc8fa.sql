-- Correção completa para todos os problemas de filial
-- 1. Corrigir registros com "Não informado"
-- 2. Corrigir registros com UUID ao invés do nome
-- 3. Verificar qualquer outro caso problemático

-- Primeiro, corrigir registros com "Não informado"
UPDATE public.tasks 
SET filial = f.nome,
    updated_at = now()
FROM public.profiles p
JOIN public.filiais f ON p.filial_id = f.id
WHERE tasks.created_by = p.user_id
  AND tasks.filial = 'Não informado'
  AND p.filial_id IS NOT NULL;

-- Segundo, corrigir registros que têm UUID como filial
UPDATE public.tasks 
SET filial = f.nome,
    updated_at = now()
FROM public.profiles p
JOIN public.filiais f ON p.filial_id = f.id
WHERE tasks.created_by = p.user_id
  AND tasks.filial ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND p.filial_id IS NOT NULL;

-- Terceiro, corrigir qualquer outro caso problemático (NULL, vazio, "Filial")
UPDATE public.tasks 
SET filial = f.nome,
    updated_at = now()
FROM public.profiles p
JOIN public.filiais f ON p.filial_id = f.id
WHERE tasks.created_by = p.user_id
  AND (tasks.filial IS NULL OR tasks.filial = '' OR tasks.filial = 'Filial')
  AND p.filial_id IS NOT NULL;

-- Relatório final
DO $$
DECLARE
  total_nao_informado integer;
  total_uuid integer;
  total_problematicos integer;
BEGIN
  -- Contar registros que ainda têm problemas
  SELECT COUNT(*) INTO total_nao_informado
  FROM public.tasks 
  WHERE filial = 'Não informado';
  
  SELECT COUNT(*) INTO total_uuid
  FROM public.tasks 
  WHERE filial ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  
  SELECT COUNT(*) INTO total_problematicos
  FROM public.tasks 
  WHERE filial IS NULL OR filial = '' OR filial = 'Filial' OR filial = 'Não informado' OR filial ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    
  RAISE NOTICE 'Após correção completa:';
  RAISE NOTICE '- Registros com "Não informado": %', total_nao_informado;
  RAISE NOTICE '- Registros com UUID: %', total_uuid;
  RAISE NOTICE '- Total de registros problemáticos: %', total_problematicos;
END $$;
CREATE OR REPLACE FUNCTION public.map_checklist_item_to_service(p_item text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE LOWER(TRIM(COALESCE(p_item, '')))
    WHEN 'verificação de pneus' THEN 'Pneus'
    WHEN 'verificação de líquidos' THEN 'Fluidos / Arrefecimento'
    WHEN 'verificação de luzes' THEN 'Sistema Elétrico'
    WHEN 'verificação de óleo do motor' THEN 'Lubrificação / Motor'
    WHEN 'nível de óleo da transmissão' THEN 'Transmissão'
    WHEN 'teste de bateria' THEN 'Baterias'
    WHEN 'inspeção de suspensão' THEN 'Suspensão'
    WHEN 'limpeza geral' THEN NULL
    WHEN '' THEN NULL
    ELSE 'Outros Serviços'
  END;
$$;
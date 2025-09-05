-- Normalize filial names in tasks table to match filiais table
-- Fix inconsistencies like "AGUA BOA" -> "Água Boa"

UPDATE tasks 
SET filial = 'Água Boa' 
WHERE filial = 'AGUA BOA';

-- Update any other potential inconsistencies
UPDATE tasks 
SET filial = 'São José do Xingu' 
WHERE filial = 'São Jose do Xingu';

-- Add a check to see what other inconsistencies might exist
-- (This will show us if there are tasks with filial names not in the filiais table)
DO $$
BEGIN
    RAISE NOTICE 'Tasks with filial names not found in filiais table:';
    FOR rec IN 
        SELECT DISTINCT t.filial
        FROM tasks t
        LEFT JOIN filiais f ON t.filial = f.nome
        WHERE t.filial IS NOT NULL 
        AND f.nome IS NULL
        AND t.filial != 'Não informado'
    LOOP
        RAISE NOTICE 'Unmatched filial: %', rec.filial;
    END LOOP;
END $$;
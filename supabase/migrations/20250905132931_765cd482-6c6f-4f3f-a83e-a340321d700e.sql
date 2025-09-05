-- Fix inconsistency: São Jose do Xingu -> São José do Xingu
UPDATE filiais 
SET nome = 'São José do Xingu' 
WHERE nome = 'São Jose do Xingu';
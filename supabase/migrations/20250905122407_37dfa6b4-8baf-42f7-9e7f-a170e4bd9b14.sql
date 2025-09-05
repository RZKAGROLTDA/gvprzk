-- Complete normalization of filial names in tasks table
UPDATE tasks 
SET filial = CASE 
  WHEN filial = 'AGUA BOA' THEN 'Água Boa'
  WHEN filial = 'São Jose do Xingu' THEN 'São José do Xingu'
  ELSE filial
END
WHERE filial IN ('AGUA BOA', 'São Jose do Xingu');
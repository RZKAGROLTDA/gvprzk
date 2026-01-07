-- Deletar registro de auditoria que bloqueia a deleção do usuário
DELETE FROM security_audit_log 
WHERE id = 'cfca5371-e4f2-447b-8853-ed5de32b19a6';
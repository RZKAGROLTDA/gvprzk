-- Deletar registro de auditoria que bloqueia a deleção do usuário com typo no email (.bt)
DELETE FROM security_audit_log 
WHERE id = '5aa04a1f-4543-41e6-b9d3-804f224c13f1';
# Testes planejados (executar em transação com ROLLBACK, após autorização)
1. Aprovar consultor pendente -> user_roles = sales_consultant.
2. Aprovar supervisor pendente -> user_roles = supervisor.
3. Trocar cargo consultor -> supervisor -> registro antigo removido, novo criado.
4. Desativar -> cargos operacionais removidos; approval vira rejected (regra atual).
5. Reativar e reaprovar -> cargo operacional do perfil restaurado.
6. Perfil com role manager/admin aprovado -> nenhum registro criado.
7. Usuário com manager em user_roles e perfil operacional -> manager preservado.
8. Usuário comum tentando mudar o próprio role -> bloqueado pelos gatilhos existentes; nada concedido.
9. Os 21 regularizados e Ramon/Bruno/Elton permanecem idênticos.

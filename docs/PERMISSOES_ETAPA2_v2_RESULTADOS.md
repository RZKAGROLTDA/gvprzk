# Etapa 2 v2 — Resultado dos testes (transação desfeita ao final)

Ajuste v2: o diretório de usuários do Supervisor mostra somente colaboradores das filiais autorizadas (filial principal + vínculos adicionais ativos). Quem não tem filial autorizada é bloqueado.

Resultado: 13/13 casos aprovados (58 verificações).
- T1 nível de acesso pelo cargo registrado (6/6)
- T2 lista: Admin/Gerente veem 26.391; Bruno/Elton 0
- T3 vendedor vê só as próprias
- T4 David: 0 atividades de terceiros fora das filiais; vínculo adicional aceito; filial não vinculada bloqueada
- T5 atividade de outra filial: só Admin/Gerente abrem
- T6 David abre atividade de colaborador da filial vinculada com e-mail e telefone mascarados (sem atividade de equipe na filial principal; testado com vínculo temporário)
- T7/T8 exportação: Admin/Gerente OK; David só filiais autorizadas; filial não autorizada, vendedor, Bruno e Elton bloqueados
- T9 diretório: Admin 132 completos; David 11 mascarados, 0 fora das filiais, inclui Ana Júlia e Rharisom e os 8 do vínculo adicional; vendedor/Bruno/Elton bloqueados
- T10 busca de clientes exige cargo registrado (Bruno/Elton sem acesso)
- T11 anônimo sem acesso a tudo
- T12 função interna inacessível pelo aplicativo
- T13 Ramon, Bruno, Elton e total de atividades idênticos

Pós-teste: nenhuma função alterada, vínculo temporário inexistente, 26.391 atividades.

# Testes v4 — todos em BEGIN ... ROLLBACK (nada permanece)
Cada teste: BEGIN; SET LOCAL role authenticated; SET LOCAL request.jwt.claims (sub do usuário de teste); ação; conferência; ROLLBACK.
Usuários de teste criados dentro da transação. Ramon, Bruno e Elton nunca são usados.
**Conferência C** (após cada teste): todo perfil ativo/aprovado tem em user_roles exatamente o cargo do perfil; 0 casos de elevado+operacional; 0 casos de 2 operacionais.

| # | Cenário | Esperado |
|---|---|---|
| 1 | Admin aprova consultor pendente | user_roles = consultant; C ok |
| 2 | Gerente troca Supervisor -> RAC (UPDATE direto) | só rac; C ok |
| 3 | Gerente desativa supervisor | operacional removido |
| 4 | Gerente reativa + reaprova | operacional restaurado; C ok |
| 5 | Usuário muda o próprio cargo | bloqueado; nada muda |
| 6 | Usuário se autoaprova | bloqueado |
| 7 | Usuário cria o próprio perfil "approved" | gravado como pending, sem cargo |
| 8 | Usuário cria perfil para outro user_id | erro GVPS |
| 9 | Criação anônima | sem permissão |
| 10 | Sessão authenticated sem sub cria perfil aprovado | erro GVPS |
| 11 | Admin cria perfil aprovado de supervisor | user_roles = supervisor |
| 12 | Admin tenta criar perfil já como Gerente | erro GVPS |
| 13 | service_role cria perfil aprovado operacional | cargo gravado; C ok |
| 14 | **Supervisor -> Gerente por UPDATE direto (por Gerente e por Admin)** | operação inteira bloqueada; profiles.role continua supervisor; user_roles continua supervisor |
| 15 | Gerente (user_roles) -> Supervisor por UPDATE direto | bloqueado; manager intacto |
| 16 | Admin: Supervisor -> Gerente via update_user_role_secure | profile=manager e user_roles só manager (atômico) |
| 17 | Admin: Gerente -> Supervisor via função | só supervisor; C ok |
| 18 | **Gerente tenta conceder Administrador** | erro; nada muda |
| 19 | Gerente tenta conceder Gerente | erro; nada muda |
| 20 | Gerente altera cargo de um Administrador | erro; nada muda |
| 21 | Gerente concede Supervisor/RAC/CPA/CSA/Consultor | sucesso; C ok |
| 22 | **Gerente inativo** chama a função | erro "aprovado e ativo" |
| 23 | **Gerente não aprovado (pending)** chama a função | erro |
| 24 | Usuário com profiles.role=manager mas sem user_roles chama a função | erro (cargo do perfil não vale) |
| 25 | Admin altera o próprio cargo via função | erro |
| 26 | **Manipulação da marca:** set_config('gvps.authorized_role_change', id) e UPDATE para manager | bloqueado (marca ignorada) |
| 27 | **Manipulação da autorização:** INSERT/SELECT em gvps_private.role_change_grants como authenticated | permissão negada |
| 28 | Chamada direta de gvps_has_role_change_grant / gvps_actor_level / funções de trigger | permissão negada |
| 29 | Falha no meio da função (ex.: cargo inválido após UPDATE simulado) | nada parcial persiste; C ok |
| 30 | Após a função: tabela de autorizações vazia | 0 linhas |
| 31 | Usuário comum insere em user_roles | negado por RLS |
| 32 | Após ROLLBACK: contagens e hash de profiles/user_roles iguais às de antes | iguais |

# Roadmap

## M3 — Acesso Multi-Filial

- [x] Etapa 1 — Base de filiais do usuário (useUserFiliais, estado por sessão)
- [x] Etapa 2 — Seletor de filial ativa no cabeçalho
- [x] Etapa 3A — POPS, Agenda, Programação (listagem), Retornos
- [x] Etapa 3B — Carteira (RPC get_clients_overview_v2 multi-filial validado 12/12), Treinamentos, listas de consultores
- [ ] M3 Gestão Administrativa de Filiais Adicionais — interface em Gerenciar Usuários
  - Implementar campo Filiais Adicionais (dialog + hook), salvar via set_user_filiais
  - Bateria de testes reversível (inclui validação temporária Diogo Caiapônia+Planalto Verde, sem gravar permanente)
- [ ] Aguardando autorização: primeiro acesso multi-filial real (Diogo)

- [ ] M3 Filial Ativa efetiva: revisar arquitetura A (user_active_filial no banco) x B (sessão + parâmetro validado) e minimizar alterações de RLS antes de implementar E1
- [ ] M3 E1 (arquitetura B aprovada): POPS usando Filial Ativa como filial efetiva + validacao no banco, sem alterar RLS
- [ ] M3 E1: revisao final antes de aplicar (validar filial existente/ativa, mapear todas as chamadas POPS, Excel e consultas diretas)
- [ ] M3 E1 aplicar versao final + bateria completa (Diogo Caiaponia/Planalto Verde, Excel, 42501)

## M3 / E2 — Filial Ativa nos módulos (aprovado 18/09)
- [x] Parque de Máquinas (lista, KPIs, Excel) restrito à Filial Ativa para todos
- [x] Validação do Parque (resumo + validadores) restrito à Filial Ativa
- [x] Regularização (pendências, contadores, máquinas por cliente, lotes/PDF/cancelamento/reenvio/finalização) sem misturar filiais
- [x] Carteira/CRM somente Filial Ativa (nunca soma) — E3 concluída (banco + telas validados)
- [ ] Bateria Caiapônia ↔ Planalto Verde ↔ volta, filial única e filial não autorizada

## E2 — Regularização (concluída)
- [x] 9 funções da Regularização com Filial Ativa (effective_filial_ids) + assert_batch_filial
- [x] Lote legado sem filial: somente admin/gestor em contexto global
- [x] Frontend: Regularização parte da Filial Ativa, sem "Sem filial" para usuário comum
- [x] Bateria em BEGIN/ROLLBACK
- [x] Revisão comparativa (status/permissões) antes de aplicar a Regularização

## E4 — Meu Dia, Filial Ativa (diagnóstico aprovado; proposta ajustada, aguardando autorização)
- [ ] Banco: my_day_assert_target(p_user_id, p_filial_id DEFAULT NULL) assinatura única (sem overload); validar filial via effective_filial_ids ANTES do caso self (filial não autorizada → 42501 mesmo para self); get_my_day_team_summary via effective_filial_ids; get_my_day_user_summary/user_details com p_filial_id
- [ ] Frontend: filialId nas chamadas e queryKeys de equipe/individual (useMyDay.ts, MyDay.tsx, UserDayDialog.tsx); bloqueio por isScopeReady
- [ ] Meu Dia pessoal 100% intacto (summary/details/context/builders/queryKeys)
- [ ] Bateria: supervisor principal/adicional/volta sem soma, 42501 não autorizada e consultor comum, admin global/restrito, troca sem reload
- [ ] Depois: diagnóstico específico de useTasks/offline

## Etapa 1 — Filial das prioridades pendentes Nível A (aguardando aprovação do SQL ajustado)
- [ ] SQL ajustado: todas as auxiliares como TEMP, execução atômica em uma transação, COMMIT só se todas as validações passarem
- [ ] Seleção recalculada no momento da execução (sem número fixo)
- [ ] Após COMMIT: confirmar que não restam auxiliares em public e reler os números persistidos

- [x] POPS: conclusao de servico autoriza por Filial Ativa + filiais autorizadas (effective_filial_ids), com Supervisor incluido; aplicado no banco (pops_complete_machine com p_filial_id) e na tela (usePops/PopsMachineDrawer/Pops).

## Consolidacao de contas — Isac Manso Stanke (aguardando aplicacao)
- [ ] Infra user_account_links + resolve_primary_user_id (aprovada conceitualmente)
- [ ] Vinculo alias 513dcb05 -> titular 04884288 (PM2064), idempotente e com guarda de divergencia
- [ ] Desativacao da conta antiga pelo procedimento oficial (historico 100% preservado)
- [ ] Consolidacao de TODOS os indicadores por colaborador: get_performance_by_seller_v2, get_activity_metrics_v2, get_my_day_team_summary (tela da duplicidade), get_equipment_validators, pops_executor_results
- [ ] Transacao unica com validacoes 1..9 + idempotencia; falha => ROLLBACK
- [ ] Nao aplicar a Robson, Diogo, Deibdy

## Consolidacao Isac — revisao solicitada (simulacao reversivel, sem COMMIT)
- [ ] V1/V9 validam apenas o vinculo do alias (nao a tabela inteira)
- [ ] Guarda contra remapeamento do alias (alias -> outro titular => abortar)
- [ ] created_by do vinculo: usar auth.uid() administrativo quando existir; documentar quando NULL
- [ ] get_performance_by_seller_v2: vendas contadas uma vez por task (sem duplicacao por followup) e sem repetir valor entre filiais
- [ ] Mapear todas as RPCs/telas que agrupam por created_by/responsible_user_id/seller_id/executed_by/validated_by/user_id e listar nao cobertas
- [ ] Validar Filial Ativa intacta (identidade != escopo)
- [ ] Numeros reais A e P + consolidado esperado; idempotencia; ROLLBACK integral

- [ ] Consolidação Isac: aplicar migration (BEGIN/COMMIT + validações E) e depois rodar V10–V17 em sessão autenticada; só então usar o botão Desativar.

- [ ] Consolidação Isac: aplicar definitivo, validar pós-COMMIT em sessão admin e bloquear login da conta antiga

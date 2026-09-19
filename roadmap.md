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
- [ ] Carteira/CRM somente Filial Ativa (nunca soma)
- [ ] My Day: visão de equipe acompanha a Filial Ativa
- [ ] Bateria Caiapônia ↔ Planalto Verde ↔ volta, filial única e filial não autorizada

## E2 — Regularização (concluída)
- [x] 9 funções da Regularização com Filial Ativa (effective_filial_ids) + assert_batch_filial
- [x] Lote legado sem filial: somente admin/gestor em contexto global
- [x] Frontend: Regularização parte da Filial Ativa, sem "Sem filial" para usuário comum
- [x] Bateria em BEGIN/ROLLBACK
- [x] Revisão comparativa (status/permissões) antes de aplicar a Regularização

## E3 Carteira/CRM — Filial Ativa (aprovada, em aplicação)
- [ ] Aplicar 9 RPCs com effective_filial_ids (clients_overview, activity/funnel/reports/tasks metrics, consolidated, performance seller/filial, weekly agenda)
- [ ] Frontend CRM + funil + relatórios: Filial Ativa + filialId nas queryKeys (useTasks FORA; useFollowups aguarda filial)
- [ ] Bateria BEGIN/ROLLBACK Diogo/Jhonatan/admin + tabela de resultados
- [ ] Depois: Meu Dia (etapa separada) e diagnóstico específico de useTasks/offline

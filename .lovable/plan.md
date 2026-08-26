# POPS — Auditoria e Arquitetura Proposta

Meta do programa: **1.000 máquinas serviçadas**. Regra imutável: **1 máquina = 1 OS = 1 realizado POPS**.

Nada foi alterado: sem migration, sem mudança de banco, dados ou frontend.

## 0. O que já existe (auditoria)

- `public.client_equipment`: **19.916 máquinas**, 3.448 clientes, 14 filiais, 19.528 ativas. Já traz cliente, código, filial, tipo, modelo, chassi/série, horímetro, status, validação e histórico de transferência. Serve como fonte única da máquina — POPS não duplica esses dados.
- Parque de Máquinas: leitura sempre via `get_equipment_park_paginated`; edição liberada para qualquer usuário aprovado/ativo (`can_view_equipment_park`). Nada disso será alterado.
- Cargos: 14 usuários em `rac`/`cpa`/`csa`. `RAC = CPA = CSA` em permissões, mas o POPS será atribuído **explicitamente por usuário**, então CPA/CSA só entram se receberem carteira (sem premissa de participação).
- Escopo por cargo já resolvido em outros módulos por funções como `my_day_scope()` / `get_supervisor_filial_id()` — o POPS reaproveita o mesmo padrão.
- Já existe "Oportunidades Potenciais" (checklists) — módulo distinto, não será misturado.

## 1. Arquitetura recomendada

Módulo próprio, isolado: rota `/pops`, tabelas `pops_*`, RPCs `pops_*`. Zero acoplamento com Tarefas, Meu Dia, Programa de Visitas, Retornos, Checklists e Funil. Não cria task por máquina.

Modelo em 3 camadas:
1. **Programa + base**: quais máquinas participam e de quem é cada uma.
2. **Execução**: o que aconteceu na máquina (visita, validação, amostra) + oportunidades comerciais.
3. **Fechamento**: a OS — única coisa que transforma a máquina em "serviçada".

## 2. Tabelas novas

| Tabela | Função |
|---|---|
| `pops_programs` | O programa (nome, meta = 1000, período, ativo). Permite POPS 2027 no futuro. |
| `pops_services` | Os 3 serviços configuráveis (nome, código, ordem, ativo). Nomes cadastrados pela gestão — nada hardcoded. |
| `pops_machines` | A base POPS: `program_id` + `equipment_id` (FK `client_equipment.id`), RAC responsável, status, `last_activity_at`. **UNIQUE (program_id, equipment_id)**. |
| `pops_executions` | Cada passagem do RAC na máquina: localizada, validada, data execução, horímetro, amostra sim/não, data coleta, observação. Append-only (histórico). |
| `pops_opportunities` | Oportunidade por máquina + serviço: identificado, ofertado, interesse (interessado / não interessado / sem resposta), observação. |
| `pops_work_orders` | OS manual: número, data abertura, RAC, máquina POPS, serviço relacionado, observação, `attachments` (preparado para evidência futura). **UNIQUE (program_id, pops_machine_id)** e UNIQUE do número por programa. |
| `pops_machine_events` | Trilha de auditoria: quem, quando, o que mudou (jsonb), tipo de evento. Nunca sobrescrito. |

Campos comuns: `created_by`, `created_at`, `updated_at` + trigger de `updated_at`. Todas com `GRANT` explícito + RLS.

## 3. Relacionamento com client_equipment

`pops_machines.equipment_id → client_equipment.id` (`ON DELETE RESTRICT`). Nenhum dado de máquina é copiado; cliente/modelo/chassi/horímetro/filial vêm sempre por join na leitura. `client_equipment` não recebe coluna nova, trigger nova nem mudança de RLS — Parque de Máquinas segue idêntico.

Exceção pragmática: gravar `client_code` e `filial_id` desnormalizados em `pops_machines` **apenas como colunas de recorte de performance/RLS**, preenchidas na entrada da máquina e atualizáveis por RPC (não fonte de verdade).

## 4. Como a base POPS é criada (opção C — as duas)

- **A) Seleção no app**: tela "Base POPS" (admin/manager) filtra o Parque (filial, tipo, cliente, status) e adiciona as máquinas selecionadas ao programa.
- **B) Importação por planilha**: colunas `client_code`, `serial_chassis`, `model` (opcional `filial`, `rac_email`). Matching por chassi normalizado primeiro, depois código do cliente + modelo. Retorna relatório: inseridas / já existentes / não encontradas / ambíguas. Máquinas não encontradas **não** são criadas automaticamente no Parque nesta etapa — vão para uma lista de pendência para decisão.
- Anti-duplicidade: `UNIQUE (program_id, equipment_id)` + `ON CONFLICT DO NOTHING`, tornando a importação idempotente e reexecutável.

## 5. Atribuição de máquinas aos RACs

Campo `pops_machines.responsible_user_id`. Formas de atribuir:
- em lote por filtro (filial / cliente / tipo) na tela de gestão;
- via coluna `rac_email` na planilha;
- individualmente na linha da máquina.
Máquina sem RAC fica no bucket "Não atribuídas", visível para gestão. Reatribuição gera evento em `pops_machine_events` (histórico preservado).

## 6. Carteira do RAC

Duas visões da mesma RPC paginada:
- **Por cliente (padrão)**: cliente → nº de máquinas POPS, pendentes, serviçadas. Expandir mostra as máquinas. É a visão de "onde eu preciso ir".
- **Por máquina**: tabela plana com cliente, código, filial, tipo, modelo, chassi, horímetro, status POPS, última movimentação.

Busca por cliente, código do cliente, modelo, chassi/série e filial (filial só quando o cargo permite). Filtros rápidos: Pendentes / Trabalhadas / Serviçadas.

## 7. Fluxo operacional (simplificado)

Status persistidos em `pops_machines.status` — apenas **4**:

```text
FOCO  →  EM ANDAMENTO  →  OS ABERTA  →  SERVICADA
```

Visitada, validada, amostra coletada e oportunidade identificada **não são status** — são eventos/campos (`pops_executions`, `pops_opportunities`), exibidos como selos na linha da máquina. Isso evita 7 status e mantém o RAC com decisão binária: registrei execução? registrei OS?

- Primeiro registro de execução → `EM ANDAMENTO`.
- OS registrada → `OS ABERTA` e, sendo a OS a validação final, imediatamente `SERVICADA` (mantidos como dois status para permitir, no futuro, exigir conferência antes de contar).

## 8. Serviços configuráveis

`pops_services` alimenta o formulário e os filtros. Cadastro pela gestão (nome, ativo, ordem). Frontend nunca lista nomes fixos; se houver 0 serviços cadastrados o bloco de oportunidades aparece desabilitado com aviso. Alterar nome de serviço não reescreve histórico (referência por `service_id`).

## 9. Regra técnica 1 máquina = 1 realizado

- `pops_work_orders` com **UNIQUE (program_id, pops_machine_id)** — o banco impede a segunda OS na mesma máquina do mesmo programa.
- Todos os KPIs de "serviçadas" contam `COUNT(DISTINCT pops_machine_id)` em `pops_work_orders`, nunca linhas de oportunidade ou execução.
- Oportunidades e execuções são N por máquina, mas não influenciam a meta.
- Nada de visita/validação/amostra conta como serviçada.

## 10. Proteção contra duplicidade

Camadas: UNIQUE de máquina no programa; UNIQUE de OS por máquina; UNIQUE de número de OS por programa; matching normalizado do chassi na importação; `ON CONFLICT DO NOTHING`; toda escrita por RPC `SECURITY DEFINER` com validação de escopo (nada de INSERT direto do cliente em tabelas de meta).

## 11. Registro manual da OS

Campos: número da OS (obrigatório), data de abertura (obrigatória, não futura), RAC responsável (default = usuário), máquina POPS, cliente (derivado), serviço relacionado (opcional, de `pops_services`), observação, `attachments jsonb` reservado para evidência futura. Sem integração com o sistema de OS nesta etapa.

## 12. Histórico e auditoria

`pops_machine_events` grava: entrada na base, atribuição/reatribuição de RAC, cada execução, cada oportunidade, registro/correção de OS e a transição para SERVICADA — com autor, timestamp e payload jsonb. `pops_executions` é append-only. Correção de OS não apaga a anterior: registra evento de correção com valor antigo e novo.

## 13. KPIs do RAC

Máquinas atribuídas, pendentes, trabalhadas hoje, trabalhadas na semana, amostras coletadas, oportunidades identificadas, OS abertas, máquinas serviçadas, % concluído da carteira. Acima dos KPIs, um bloco "O que fazer hoje": clientes com máquinas pendentes ordenados por volume.

## 14. KPIs gerenciais

Bloco de meta: META 1.000 / SERVIÇADAS X / FALTAM X / ATINGIMENTO X%. Mais: máquinas foco, trabalhadas, amostras, oportunidades, OS abertas, serviçadas. Recortes: Hoje, Semana, Mês, Acumulado; e por RAC, Filial, Cliente e Serviço.

## 15. Acompanhamento diário e ritmo

Série diária de máquinas serviçadas (data da OS) + linha de ritmo necessário: `(1000 − serviçadas) / dias úteis restantes`, com comparação entre ritmo realizado e ritmo requerido e projeção de chegada. Tabela de produtividade por RAC: atribuídas, pendentes, trabalhadas, amostras, oportunidades, OS, serviçadas, % da carteira, última atividade — com drill-down RAC → Clientes → Máquinas → situação.

## 16. Permissões

| Cargo | Escopo |
|---|---|
| RAC (e CPA/CSA que receberem carteira) | Vê e trabalha **apenas** as máquinas POPS atribuídas a si. |
| Supervisor | Leitura do POPS dos RACs da própria filial. |
| Manager / Admin | Visão global + gestão da base, atribuições e serviços. |

Validação sempre no banco (função `pops_scope()` no mesmo padrão de `my_day_scope()`), não no frontend. RLS apenas nas novas tabelas `pops_*`; **nenhuma policy existente é alterada**.

## 17. RPCs necessárias

- `pops_get_my_portfolio(p_group_by, p_search, p_status, p_page, p_size)` — carteira paginada (por cliente ou máquina).
- `pops_get_my_kpis()` — KPIs do RAC.
- `pops_get_client_machines(p_client_code)` — máquinas POPS do cliente na execução em campo.
- `pops_register_execution(...)` — execução + eventos + transição de status.
- `pops_register_opportunities(...)` — oportunidades da máquina.
- `pops_register_work_order(...)` — OS, unicidade e marcação de SERVICADA.
- `pops_get_dashboard(p_period, p_filial_id, p_rac_id, p_service_id)` — KPIs gerenciais + série diária + ritmo.
- `pops_get_rac_productivity(...)` — tabela de produtividade.
- `pops_get_machine_history(p_pops_machine_id)` — trilha completa.
- `pops_admin_add_machines(...)` / `pops_admin_assign_rac(...)` — gestão da base.
- Importação de planilha: Edge Function `pops-import-machines` (lotes, matching, relatório), no padrão de `import-clients-master`.

## 18. Frontend

- `src/pages/Pops.tsx` — abas: Minha Carteira | Painel | Gestão (por cargo).
- `src/components/pops/PopsPortfolio.tsx`, `PopsClientGroup.tsx`, `PopsMachineRow.tsx`.
- `PopsExecutionDialog.tsx` (execução + amostra), `PopsOpportunitiesBlock.tsx`, `PopsWorkOrderDialog.tsx`.
- `PopsRacKpis.tsx`, `PopsDashboard.tsx` (meta + ritmo + série diária), `PopsProductivityTable.tsx`, `PopsMachineHistory.tsx`.
- Gestão: `PopsBaseManager.tsx` (seleção do Parque), `PopsImportDialog.tsx`, `PopsServicesSettings.tsx`.
- Hooks: `src/hooks/usePops.ts`; utilitários e tipos em `src/lib/pops.ts`.
- Menu lateral: novo item "POPS". Reaproveita `roles.ts`, `parseLocalDate/formatDateDisplay`, React Query com staleTime 5–10 min e `refetchOnWindowFocus: false`.

## 19. Performance

Nenhuma leitura de base completa no frontend. Tudo por RPC paginada com agregação no banco (padrão já validado no Parque de Máquinas e no Meu Dia). Sem `count: 'exact'` em páginas subsequentes. Índices previstos: `pops_machines(program_id, responsible_user_id, status)`, `pops_machines(program_id, client_code)`, `pops_machines(equipment_id)`, `pops_work_orders(program_id, created_at)`, `pops_executions(pops_machine_id, executed_at)`. Nenhum índice novo em `client_equipment` sem antes validar com `EXPLAIN ANALYZE`.

## 20. Riscos e decisões pendentes

1. **Nomes dos 3 serviços** — ficam pendentes de cadastro; estrutura já aceita.
2. **Máquina da planilha sem correspondência no Parque** — criar no Parque automaticamente ou deixar pendente? (proposta: pendente, com aprovação).
3. **CPA/CSA** — participam do POPS? (proposta: só se receberem carteira).
4. **Máquina do POPS transferida para outro cliente** no Parque — mantém no programa e no mesmo RAC, ou realoca? (proposta: mantém, registra evento e sinaliza para gestão).
5. **OS abre = serviçada imediatamente?** (proposta: sim; a separação de status deixa a porta aberta para conferência).
6. **A meta de 1.000 é global ou distribuída por RAC/filial?** (proposta: global agora, com campo de meta individual previsto).
7. **Cancelamento/estorno de OS** — quem pode e o que acontece com a contagem? (proposta: apenas manager/admin, com evento e reversão de status).
8. **Base maior que a meta**: se a base POPS tiver mais de 1.000 máquinas, o atingimento é sobre 1.000 (meta), e a carteira mostra % sobre a própria carteira.

## Etapas de implementação sugeridas

1. Banco: tabelas, RLS, `pops_scope()`, serviços e programa inicial.
2. Base POPS: seleção no app + importação por planilha + atribuição de RAC.
3. Carteira e execução do RAC (mobile-first).
4. Painel do RAC e painel gerencial com ritmo da meta.
5. Histórico, produtividade e exportação Excel.

# POPS — Etapa Final: Execução, OS e Meta (proposta, nada aplicado)

## 1. Auditoria da base atual

- `pops_machine_status` = `foco | em_andamento | servicada` (já cobre o fluxo pedido; nenhuma alteração de enum necessária).
- `pops_machines`: 5.077 registros, **100% em `foco`**, `responsible_user_id` NULL. Nenhuma coluna de execução existe hoje (`final_service_id`, `os_number`, `executed_by`, `executed_at` **não existem** — sem conflito de nomes). Já existem `notes`, `last_activity_at`, `status`, `active`, `pops_filial_id`, `pops_filial_pendente`.
- `pops_services`: 3 serviços ativos (Análise de Óleo, Análise de Arrefecimento, Higienização de Ar) com `code`, `sort_order`, `active`. Frontend consumirá esta tabela — sem hardcode.
- Triggers em `pops_machines`: `pops_machines_normalize_trg` (normaliza serial/código/nome, define `link_status`, `pops_filial_id`, `client_key`) e `pops_machines_validate` (valida `source` e inativação). Nenhum deles mexe em `status` → **não há conflito** com o fluxo de execução; o novo guard de status será um trigger adicional.
- Constraints atuais de `pops_machines`: PK, FKs (program, equipment, filial, import_row) + índices únicos vitalícios de serial/equipment. Nada colide com as novas constraints.
- `updated_at`: padrão do módulo é `pops_set_updated_at()` (BEFORE UPDATE). Será reutilizado.
- Segurança: padrão já estabelecido por `pops_scope()` (global para admin/manager, filial para supervisor/rac/cpa/csa), `pops_is_manager()`, `pops_user_enabled()` (exige `approval_status='approved'` e `employment_status='active'`), todas `SECURITY DEFINER` + `SET search_path=public`, usando `has_role()`.
- **Ponto de correção detectado**: `pops_can_write_machine()` hoje exige `responsible_user_id = auth.uid()`. Como não haverá carteira prévia, essa função precisa ser reescrita para escopo por **filial da máquina** (nunca por `responsible_user_id`).
- RLS de `pops_machines`: SELECT por escopo, INSERT/UPDATE apenas manager. Como a conclusão será feita **exclusivamente por RPC SECURITY DEFINER**, o RAC não precisa de UPDATE direto — mantemos a política restritiva (mais seguro).

## 2. Modelagem final

Tabela própria de execução, **não** colunas em `pops_machines`. Justificativa: (a) `UNIQUE(pops_machine_id)` torna "1 máquina = 1 OS = 1 realizado" fisicamente impossível de quebrar, o que colunas nuláveis não garantem; (b) `pops_machines` é snapshot da planilha e não deve ganhar semântica operacional; (c) auditoria/correção de execução fica isolada. O status em `pops_machines` continua sendo o campo de leitura rápida, mantido consistente por trigger.

### `pops_machine_executions` (nova)
`id`, `program_id`, `pops_machine_id` (UNIQUE), `final_service_id` → `pops_services`, `os_number`, `os_number_norm` (gerada: `upper(btrim(os_number))`), `executed_by`, `executed_at`, `notes`, `filial_id` (snapshot da filial da máquina, para breakdown rápido), `created_by`, `updated_by`, `created_at`, `updated_at`.

### `pops_machine_offered_services` (nova)
`id`, `pops_machine_id`, `service_id`, `created_by`, `created_at` — `UNIQUE (pops_machine_id, service_id)`. Serviços avaliados/ofertados: análise comercial apenas, não contam meta, não geram OS. O serviço final é automaticamente incluído como ofertado.

## 3. Constraints e índices

```
UNIQUE (pops_machine_id)                       -- 1 máquina = 1 execução
UNIQUE (program_id, os_number_norm)            -- OS única no programa
CHECK  (char_length(btrim(os_number)) BETWEEN 1 AND 40)
CHECK  (os_number ~ '^[A-Za-z0-9/\-\.]+$')     -- letras, números, / - .
CHECK  (executed_at <= now() + interval '1 minute')
FK final_service_id -> pops_services (RESTRICT), FK pops_machine_id -> pops_machines (RESTRICT)
IDX (program_id, executed_at), (executed_by, executed_at), (filial_id, executed_at), (final_service_id)
IDX pops_machines (program_id, status), (pops_filial_id, status)
```
Auditoria de formato: como não há integração externa, a OS é texto livre restrito ao charset acima (cobre `12345`, `OS-2026/117`, `A1234.5`), com `trim` e comparação case-insensitive para unicidade.

## 4. Fluxo de status

`foco` → `em_andamento` (`pops_start_machine`, reversível) → `servicada` (`pops_complete_machine`).
Trigger `pops_machines_status_guard` (BEFORE UPDATE): só permite `servicada` se existir execução válida (serviço final, OS não vazia, `executed_by`, `executed_at`); e bloqueia sair de `servicada` enquanto a execução existir. A remoção da execução (só manager/admin) reverte a máquina para `em_andamento`.

## 5. Segurança por cargo

- `pops_can_execute_machine(id)`: `pops_user_enabled()` AND (manager/admin global) OR (rac/cpa/csa **e** `pops_filial_id = get_user_filial_id()` e não nula).
- Supervisor: **somente acompanhamento** nesta versão (lê tudo da filial, não conclui). Motivo: `executed_by` é indicador de produção do RAC; conclusão por supervisor distorceria o indicador. Manager/Admin podem corrigir/estornar execução (`updated_by` registrado).
- Máquinas com `pops_filial_id` NULL: visíveis/executáveis somente por manager/admin.
- RLS nas duas tabelas novas: SELECT por escopo (global / filial da máquina), INSERT/UPDATE/DELETE **negados** ao cliente — toda escrita passa pelas RPCs `SECURITY DEFINER`. GRANTs: `SELECT` para `authenticated`, `ALL` para `service_role`.

## 6. Concorrência

`pops_complete_machine` faz `SELECT ... FOR UPDATE` na máquina, revalida status e ausência de execução dentro da transação, e captura `unique_violation`:
- máquina já concluída → `Esta máquina já foi concluída por outro usuário (OS X).`
- OS repetida → `A OS informada já está registrada em outra máquina deste programa.`

## 7. RPCs propostas

- `pops_start_machine(p_machine_id)` — mantida: sinaliza "assumida", alimenta o indicador `in_progress` e o gerente enxerga trabalho em curso. Não bloqueia outros usuários.
- `pops_complete_machine(p_machine_id, p_final_service_id, p_os_number, p_offered_service_ids uuid[], p_notes)` — valida permissão, serviço ativo, OS, grava execução + ofertados, seta `servicada`, `last_activity_at`.
- `pops_machine_execution_detail(p_machine_id)` — JSON com máquina, status, execução (serviço final, OS, executor+nome, data), ofertados e flags `can_execute`/`can_edit`.
- `pops_goal_summary(p_program_id, p_filial_id)` — goal, total_universe, serviced, remaining, attainment_percent, today, this_week (seg–dom), this_month, in_progress, pending; fuso `America/Sao_Paulo`.
- `pops_goal_breakdown(p_program_id, p_dimension, p_filial_id, p_date_from, p_date_to)` — dimensões `dia|filial|executor|servico`, com realizadas, participação %, em andamento, hoje/semana/mês e acumulado diário.

## 8. Exemplos de JSON

`pops_goal_summary`:
```json
{"program_id":"...","goal":1000,"total_universe":5077,"serviced":327,"remaining":673,
 "attainment_percent":32.7,"today":6,"this_week":21,"this_month":88,
 "in_progress":14,"pending":4736,"filial_id":null,"scope":"global"}
```
`pops_machine_execution_detail`:
```json
{"machine":{"id":"...","serial":"1T0450JXKF...","model":"450J","client_name":"FAZENDA X",
 "filial":"Barreiras","status":"servicada"},
 "execution":{"final_service":{"id":"...","name":"Análise de Óleo"},"os_number":"OS-2026/117",
 "executed_by":{"id":"...","name":"João RAC"},"executed_at":"2026-08-27T14:02:00Z","notes":"..."},
 "offered_services":[{"id":"...","name":"Análise de Óleo"},{"id":"...","name":"Análise de Arrefecimento"}],
 "permissions":{"can_execute":false,"can_edit":false}}
```
`pops_goal_breakdown` (dimension=`filial`): `[{"key":"...","label":"Barreiras","serviced":120,"share_percent":36.7,"in_progress":5}]`

## 9. Frontend futuro (só desenho)

Tela POPS: topo com meta (`327 / 1000 · faltam 673`, barra de progresso, hoje/semana/mês) → lista de clientes da filial (`pops_portfolio_clients`) → máquinas do cliente (`pops_portfolio_client_machines`, badges foco/em andamento/serviçada) → drawer da máquina: checkboxes dos 3 serviços (de `pops_services`), radio do serviço final, campo OS, notas, botão Concluir. Após concluir: badge SERVIÇADA + serviço final, OS, executor e data. Aba gerencial com breakdown por filial/RAC/serviço/dia.

## 10. Impacto sobre a base atual

- Nenhuma linha das 5.077 máquinas é alterada pela migration (apenas novos índices e trigger de guard).
- Nenhuma OS, execução ou atribuição de RAC é criada.
- `client_equipment`, tasks, Meu Dia e CRM não são tocados.
- Única alteração em objeto existente: reescrita de `pops_can_write_machine()` para escopo por filial (deixa de depender de `responsible_user_id`).

## 11. Decisão final: V1 SIMPLES

A proposta v2 (tabela de execução, offered services, estorno auditável, `started_by/started_at`, `pops_update_execution`, `pops_void_execution`, breakdown avançado) foi **descartada por ora**.

V1 aprovada para revisão:
- Execução direta em `pops_machines`: `final_service_id`, `os_number`, `executed_by`, `executed_at`.
- `CHECK` de coerência para `status='servicada'` + índice único de OS por programa (`upper(btrim(os_number))`, parcial).
- Apenas 2 RPCs novas: `pops_complete_machine(p_machine_id, p_service_id, p_os_number)` com `SELECT ... FOR UPDATE`, e `pops_goal_summary(p_program_id, p_filial_id)`.
- `pops_portfolio_client_machines` ganha 6 campos de leitura; `pops_portfolio_clients` inalterada.
- Permissões: manager/admin global, RAC/CPA/CSA apenas própria filial, supervisor somente consulta.

## 12. SQL da V1

Disponível para revisão em `docs/POPS_ETAPA_FINAL_SQL.md` (nada aplicado ao banco).



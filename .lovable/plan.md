# POPS — Modelagem Final do Banco (para revisão)

Decisões incorporadas. **Nada aplicado**: sem migration, sem alteração de banco, dados ou frontend.

Regra imutável: **1 máquina = 1 serviço = 1 OS = 1 realizado POPS**. Meta inicial **global: 1.000 máquinas serviçadas**.

---

## D) Enums necessários

```sql
-- status da máquina no programa
create type public.pops_machine_status as enum ('foco','em_andamento','servicada');

-- motivo quando a máquina não é localizada na execução
create type public.pops_not_found_reason as enum
  ('nao_localizada','vendida','transferida','fora_da_regiao','outro');

-- interesse do cliente na oportunidade
create type public.pops_interest as enum ('interessado','nao_interessado','sem_resposta');

-- situação da OS POPS
create type public.pops_work_order_status as enum ('ativa','cancelada');

-- tipos de evento do histórico
create type public.pops_event_type as enum (
  'machine_added','machine_removed','rac_assigned','rac_reassigned',
  'execution_registered','opportunity_registered','opportunity_updated',
  'work_order_created','work_order_updated','work_order_cancelled',
  'status_changed','transfer_divergence'
);
```

---

## A/B/C) Tabelas, campos, tipos e constraints

### 1. `public.pops_programs`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | ex.: "POPS 2026" |
| `goal_machines` | integer NOT NULL DEFAULT 1000 | meta global; trigger exige `> 0` |
| `start_date` / `end_date` | date | `end_date >= start_date` (trigger) |
| `active` | boolean NOT NULL DEFAULT true | apenas 1 ativo (índice único parcial) |
| `created_by`, `created_at`, `updated_at` | uuid / timestamptz | |

`UNIQUE (name)`; `CREATE UNIQUE INDEX ... ON pops_programs (active) WHERE active` (garante um único programa ativo).

Sem meta individual por RAC/filial nesta etapa.

### 2. `public.pops_services`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `code` | text NOT NULL | slug estável, imutável após uso |
| `name` | text NOT NULL | configurável pela gestão |
| `sort_order` | integer NOT NULL DEFAULT 0 | |
| `active` | boolean NOT NULL DEFAULT true | |
| `created_by`, `created_at`, `updated_at` | | |

`UNIQUE (code)`, `UNIQUE (name)`. Nenhum nome de serviço no código do app. Renomear não afeta histórico (referência por `id`).

### 3. `public.pops_machines` (a base POPS)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `program_id` | uuid NOT NULL → `pops_programs.id` ON DELETE RESTRICT | |
| `equipment_id` | uuid NOT NULL → `client_equipment.id` ON DELETE RESTRICT | fonte única da máquina |
| `responsible_user_id` | uuid NULL | RAC; NULL = "não atribuída" |
| `status` | `pops_machine_status` NOT NULL DEFAULT `'foco'` | derivado por trigger, nunca pelo cliente |
| `client_code` | text | snapshot de recorte (performance/RLS), não fonte de verdade |
| `filial_id` | uuid → `filiais.id` | idem |
| `transfer_divergence` | boolean NOT NULL DEFAULT false | máquina transferida no Parque após entrar no POPS |
| `transfer_divergence_at` | timestamptz | |
| `last_activity_at` | timestamptz | última movimentação POPS |
| `source` | text | `'manual'` \| `'import'` |
| `import_batch_id` | uuid | rollback/auditoria da carga |
| `notes` | text | |
| `created_by`, `created_at`, `updated_at` | | |

**`UNIQUE (program_id, equipment_id)`** — impede a mesma máquina duas vezes no mesmo programa.

### 4. `public.pops_executions` (append-only)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pops_machine_id` | uuid NOT NULL → `pops_machines.id` ON DELETE RESTRICT | |
| `executed_at` | date NOT NULL | não futura (trigger) |
| `located` | boolean NOT NULL | máquina localizada sim/não |
| `not_found_reason` | `pops_not_found_reason` NULL | obrigatório quando `located = false`; proibido quando `true` (trigger) |
| `validated` | boolean NOT NULL DEFAULT false | só permitido quando `located` |
| `hours` | numeric NULL | horímetro; `>= 0` |
| `sample_collected` | boolean NOT NULL DEFAULT false | só permitido quando `located` |
| `sample_date` | date NULL | obrigatória quando `sample_collected`; não futura |
| `observation` | text | |
| `created_by` NOT NULL, `created_at`, `updated_at` | | |

Sem UPDATE/DELETE pelo app (RLS): correção se faz por nova execução. Qualquer execução — inclusive "não localizada" — marca a máquina como **TRABALHADA**, mas nunca como serviçada.

### 5. `public.pops_opportunities`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pops_machine_id` | uuid NOT NULL → `pops_machines.id` ON DELETE RESTRICT | |
| `execution_id` | uuid NULL → `pops_executions.id` | execução que originou |
| `service_id` | uuid NOT NULL → `pops_services.id` ON DELETE RESTRICT | |
| `identified` | boolean NOT NULL DEFAULT true | |
| `offered` | boolean NOT NULL DEFAULT false | |
| `interest` | `pops_interest` NOT NULL DEFAULT `'sem_resposta'` | |
| `observation` | text | |
| `created_by`, `created_at`, `updated_at` | | |

`UNIQUE (pops_machine_id, service_id)` — uma linha por serviço por máquina, atualizável. N oportunidades não somam na meta.

### 6. `public.pops_work_orders` (a OS — validação final)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `program_id` | uuid NOT NULL → `pops_programs.id` | redundante por design, viabiliza os UNIQUEs |
| `pops_machine_id` | uuid NOT NULL → `pops_machines.id` ON DELETE RESTRICT | **obrigatório** |
| `service_id` | uuid NOT NULL → `pops_services.id` ON DELETE RESTRICT | **obrigatório** |
| `os_number` | text NOT NULL | normalizado (trim/upper) por trigger |
| `os_date` | date NOT NULL | não futura |
| `responsible_user_id` | uuid NOT NULL | preenchido pela RPC (RAC da máquina / autor) |
| `status` | `pops_work_order_status` NOT NULL DEFAULT `'ativa'` | |
| `observation` | text | |
| `attachments` | jsonb NOT NULL DEFAULT `'[]'` | reservado para evidência futura |
| `cancelled_by`, `cancelled_at`, `cancel_reason` | uuid / timestamptz / text | obrigatórios quando `status = 'cancelada'` |
| `created_by` NOT NULL, `created_at`, `updated_at` | | |

Constraints de unicidade (índices únicos parciais, considerando apenas OS ativas):
```sql
CREATE UNIQUE INDEX pops_wo_one_active_per_machine
  ON public.pops_work_orders (program_id, pops_machine_id) WHERE status = 'ativa';
CREATE UNIQUE INDEX pops_wo_number_unique_per_program
  ON public.pops_work_orders (program_id, upper(btrim(os_number))) WHERE status = 'ativa';
```
A primeira é a garantia técnica de **1 máquina = no máximo 1 realizado**. A segunda impede número de OS duplicado no programa. O escopo `WHERE status='ativa'` permite, após cancelamento, registrar nova OS na mesma máquina sem apagar histórico.

### 7. `public.pops_machine_events` (histórico, nunca sobrescrito)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pops_machine_id` | uuid NOT NULL → `pops_machines.id` ON DELETE RESTRICT | |
| `event_type` | `pops_event_type` NOT NULL | |
| `actor_user_id` | uuid | `auth.uid()` |
| `old_values` / `new_values` | jsonb | correções gravam anterior e novo |
| `description` | text | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Somente INSERT (via RPCs/triggers). Sem UPDATE/DELETE pelo app.

### 8. `public.pops_import_pendencies`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `program_id` | uuid NOT NULL → `pops_programs.id` | |
| `import_batch_id` | uuid NOT NULL | |
| `client_code`, `client_name`, `model`, `serial_chassis`, `filial_raw`, `rac_email` | text | linha crua da planilha |
| `reason` | text NOT NULL | `'not_found'` \| `'ambiguous'` \| `'already_in_program'` \| `'invalid_row'` |
| `candidates` | jsonb | ids de `client_equipment` candidatos no caso ambíguo |
| `resolved` | boolean NOT NULL DEFAULT false | |
| `resolved_by`, `resolved_at`, `resolution_note` | | |
| `created_at`, `updated_at` | | |

Máquina não encontrada **nunca** é criada em `client_equipment`. Fica aqui, com motivo, para revisão da gestão.

---

## E) Regra de status (derivada, nunca escrita pelo cliente)

```text
FOCO           nenhuma execução POPS registrada
EM_ANDAMENTO   >= 1 execução registrada e nenhuma OS ativa
SERVICADA      existe OS POPS com status = 'ativa'
```

Sem `OS_ABERTA`: a existência da OS ativa já é a abertura e torna a máquina SERVICADA.

Implementação: função `pops_recalc_machine_status(p_pops_machine_id)` chamada por triggers `AFTER INSERT` em `pops_executions` e `AFTER INSERT/UPDATE` em `pops_work_orders`. Ela reavalia os fatos e grava `status` + `last_activity_at`. Execução com `located = false` gera EM_ANDAMENTO (trabalhada), nunca SERVICADA.

## F) Regra da OS

Criação exige: `pops_machine_id`, `service_id`, `os_number`, `os_date` (não futura). `responsible_user_id` e `created_by` vêm de `auth.uid()`/RAC da máquina, nunca do payload. RPC valida escopo (o RAC só registra OS da própria carteira), rejeita máquina com OS ativa (`23505` traduzido em mensagem clara) e número duplicado no programa. Grava evento `work_order_created` e recalcula status → SERVICADA.

## G) Regra de cancelamento e correção

- **Cancelar**: só `admin`/`manager` (via `has_role`). `UPDATE` para `status='cancelada'` + `cancelled_by/at/reason`. Evento `work_order_cancelled` com `old_values`. Recalculo devolve a máquina a **EM_ANDAMENTO** e todos os KPIs, contando apenas OS ativas, se ajustam automaticamente.
- **Nunca DELETE**: RLS sem policy de DELETE para ninguém.
- **Correção** de número/data/serviço: RPC `pops_update_work_order` grava evento `work_order_updated` com `old_values` e `new_values`. RAC pode corrigir a própria OS ativa apenas dentro de uma janela curta (proposta: 48h); depois, só gestão. RAC **nunca** cancela.

## H) RLS proposta (somente nas tabelas `pops_*`; nenhuma policy existente é alterada)

Função central, no padrão de `my_day_scope()`:
```sql
public.pops_scope() -> jsonb  -- { scope: 'self'|'filial'|'global', filial_id, is_manager }
public.pops_can_read_machine(p_pops_machine_id uuid) -> boolean
public.pops_can_write_machine(p_pops_machine_id uuid) -> boolean
```
Ambas `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, exigindo `approval_status='approved'` e `employment_status='active'`.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `pops_programs` | autenticado aprovado/ativo | admin/manager | admin/manager | — |
| `pops_services` | autenticado aprovado/ativo | admin/manager | admin/manager | — |
| `pops_machines` | `pops_can_read_machine` (self / filial / global) | admin/manager | admin/manager (atribuição, notas, divergência) | admin/manager |
| `pops_executions` | leitura pelo escopo da máquina | `pops_can_write_machine` + `created_by = auth.uid()` | — | — |
| `pops_opportunities` | escopo da máquina | `pops_can_write_machine` | `pops_can_write_machine` | — |
| `pops_work_orders` | escopo da máquina | `pops_can_write_machine` + `created_by = auth.uid()` | admin/manager (e autor dentro da janela) | — |
| `pops_machine_events` | escopo da máquina | somente RPC/trigger (definer) | — | — |
| `pops_import_pendencies` | admin/manager | admin/manager | admin/manager | admin/manager |

Escopo por cargo: **RAC** = apenas `responsible_user_id = auth.uid()`; **Supervisor** = leitura das máquinas da própria filial; **Manager/Admin** = global + gestão. **CPA/CSA** não entram automaticamente — a estrutura suporta atribuição futura (basta receberem carteira), mas nenhuma policy os inclui como grupo agora.

GRANTs por tabela: `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated` (conforme a linha acima), `GRANT ALL ... TO service_role`, sem `anon`.

## I) RPCs finais

Leitura:
- `pops_get_my_kpis(p_program_id uuid default null)` → jsonb: atribuídas, pendentes (FOCO), trabalhadas, trabalhadas_hoje, trabalhadas_semana, amostras, oportunidades, os_ativas, serviçadas, `pct_carteira`.
- `pops_get_portfolio(p_group_by text, p_search text, p_status text, p_client_code text, p_filial_id uuid, p_rac_id uuid, p_page int, p_size int)` → carteira paginada, agrupada por **cliente (padrão)** ou por máquina; respeita escopo automaticamente.
- `pops_get_client_machines(p_client_code text)` → máquinas POPS do cliente para a execução em campo.
- `pops_get_machine_detail(p_pops_machine_id uuid)` → máquina + execuções + oportunidades + OS + eventos.
- `pops_get_dashboard(p_period text, p_filial_id uuid, p_rac_id uuid, p_service_id uuid)` → meta 1.000, serviçadas, faltam, atingimento, foco/trabalhadas/amostras/oportunidades/OS, série diária de serviçadas (por `os_date`) e ritmo necessário.
- `pops_get_rac_productivity(p_period text, p_filial_id uuid)` → tabela por RAC (atribuídas, pendentes, trabalhadas, amostras, oportunidades, OS, serviçadas, % carteira, última atividade).

Escrita (todas `SECURITY DEFINER` + validação de escopo + evento no histórico):
- `pops_register_execution(...)` — valida `located`/`not_found_reason`/amostra e recalcula status.
- `pops_upsert_opportunity(p_pops_machine_id, p_service_id, p_identified, p_offered, p_interest, p_observation)`.
- `pops_register_work_order(p_pops_machine_id, p_service_id, p_os_number, p_os_date, p_observation)`.
- `pops_update_work_order(p_work_order_id, ...)` — correção com histórico.
- `pops_cancel_work_order(p_work_order_id, p_reason)` — admin/manager.
- `pops_admin_add_machines(p_program_id, p_equipment_ids uuid[], p_rac_id)` — `ON CONFLICT DO NOTHING`.
- `pops_admin_assign_rac(p_pops_machine_ids uuid[], p_rac_id)`.
- `pops_admin_resolve_pendency(p_pendency_id, p_equipment_id, p_note)`.
- `pops_detect_transfer_divergences(p_program_id)` — compara `client_equipment.client_code` com o snapshot, marca `transfer_divergence` e gera evento. Não remove do POPS, não reatribui RAC.

Importação: Edge Function `pops-import-machines` (lotes ≤ 1.000, matching por chassi normalizado → depois código do cliente + modelo), gravando em `pops_machines` ou em `pops_import_pendencies`, com relatório: inseridas / já existentes / não encontradas / ambíguas.

`REVOKE EXECUTE ... FROM PUBLIC, anon` em todas; `GRANT EXECUTE ... TO authenticated`.

## J) Índices

```sql
pops_machines (program_id, responsible_user_id, status)
pops_machines (program_id, client_code)
pops_machines (program_id, filial_id, status)
pops_machines (equipment_id)
pops_machines (program_id, transfer_divergence) WHERE transfer_divergence
pops_executions (pops_machine_id, executed_at DESC)
pops_executions (created_by, executed_at DESC)
pops_executions (pops_machine_id) WHERE sample_collected
pops_opportunities (pops_machine_id)
pops_opportunities (service_id)
pops_work_orders (program_id, os_date) WHERE status = 'ativa'
pops_work_orders (responsible_user_id, os_date) WHERE status = 'ativa'
pops_work_orders (pops_machine_id)
pops_machine_events (pops_machine_id, created_at DESC)
pops_import_pendencies (program_id, resolved)
```
Mais os dois índices únicos parciais da seção 6. Nenhum índice novo em `client_equipment` — e, se algum se mostrar necessário, só após `EXPLAIN ANALYZE`.

## K) Sequência das migrations

1. **M1 — Fundação**: enums, `pops_programs`, `pops_services`, GRANTs, RLS, `pops_scope()`. Sem dados de negócio (programa e serviços são cadastrados depois, via run_sql/tela).
2. **M2 — Base POPS**: `pops_machines`, `pops_import_pendencies`, helpers `pops_can_read_machine` / `pops_can_write_machine`, RLS, índices.
3. **M3 — Execução**: `pops_executions`, `pops_opportunities`, `pops_machine_events`, triggers de validação e `pops_recalc_machine_status`.
4. **M4 — OS**: `pops_work_orders`, índices únicos parciais, triggers de recálculo e histórico.
5. **M5 — RPCs de escrita**: execução, oportunidade, OS (criar/corrigir/cancelar), gestão da base e divergências.
6. **M6 — RPCs de leitura**: KPIs, carteira, dashboard, produtividade, detalhe/histórico. `EXPLAIN ANALYZE` de cada uma antes de encerrar.
7. **Fora de migration**: Edge Function `pops-import-machines` e o frontend (`/pops`), em etapas seguintes.

---

## Pontos que ainda dependem de você

1. Nomes e códigos dos **3 serviços** (necessários para o cadastro inicial em `pops_services`).
2. `start_date` / `end_date` do programa "POPS 2026".
3. Janela de autocorreção da OS pelo RAC: **48h** é aceitável?
4. Supervisor: apenas leitura, ou também pode registrar execução/OS na filial? (proposta: somente leitura)

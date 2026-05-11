# Plano: Nova aba "Programação" no CRM

## 1. Estrutura da tabela

Nova tabela `visit_schedules` (programação planejada — separada de tasks/followups):

| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid PK | |
| planned_date | date | data planejada da visita |
| client_code | text | código do cliente (índice) |
| client_name | text | nome do cliente |
| client_property | text NULL | fazenda/propriedade |
| client_phone | text NULL | |
| client_email | text NULL | |
| filial | text | nome da filial (consistente com `tasks.filial`) |
| filial_id | uuid NULL | FK lógico para `filiais.id` |
| seller_id | uuid | vendedor responsável (auth.uid) |
| seller_name | text | snapshot do nome |
| observation | text NULL | |
| status | text | `planejado` \| `realizado` \| `nao_realizado` \| `reagendado` |
| realized_task_id | uuid NULL | task que marcou como realizado |
| realized_at | timestamptz NULL | |
| reschedule_from_id | uuid NULL | aponta para o registro original quando reagendado |
| created_by | uuid | |
| created_at / updated_at | timestamptz | |

**Índices:** `(seller_id, planned_date)`, `(client_code, planned_date)`, `(filial_id, planned_date)`, `(status)`.

**Constraint:** `UNIQUE (seller_id, client_code, planned_date)` para evitar duplicidade na programação do mesmo vendedor para o mesmo cliente no mesmo dia.

## 2. RLS (segue padrão do CRM atual)

Usando `has_role()` e `get_supervisor_filial_id()` (memória do projeto):

- **SELECT**: dono (`seller_id = auth.uid()`) OR manager/admin OR (supervisor AND `filial_id = get_supervisor_filial_id(auth.uid())`)
- **INSERT**: o próprio vendedor (`seller_id = auth.uid() AND created_by = auth.uid()`) OR manager/admin OR supervisor da mesma filial
- **UPDATE**: mesmas regras do SELECT
- **DELETE**: somente admin

Filtro de filial sempre via `LOWER(TRIM(filial))` quando comparar com `tasks.filial` (memória do projeto).

## 3. Vínculo programação ↔ visita realizada

**Quando ocorre o match:** trigger `AFTER INSERT OR UPDATE` em `tasks` que executa quando:
- `task_type IN ('ligacao','prospection','checklist')` (qualquer visita real)
- `clientcode IS NOT NULL`
- `status` muda para `in_progress` ou `completed` (visita efetivamente iniciada)

**Critérios de match (todos obrigatórios):**
1. `visit_schedules.client_code = NEW.clientcode`
2. `visit_schedules.seller_id = NEW.created_by`
3. `visit_schedules.planned_date = NEW.start_date`
4. `visit_schedules.status = 'planejado'` (não sobrescreve manual)
5. `visit_schedules.realized_task_id IS NULL`

**Ação:** UPDATE no(s) registro(s) que casam → `status='realizado'`, `realized_task_id=NEW.id`, `realized_at=now()`.

Se não houver match → não faz nada (silencioso, sem erro).

## 4. Como evitar duplicidade

- `UNIQUE (seller_id, client_code, planned_date)` no banco
- No frontend, ao salvar: tentar UPSERT com `onConflict`; se já existir, mostrar aviso "Já existe programação para este cliente nesta data"
- Reagendar = criar novo registro com `reschedule_from_id` apontando para o original e marcar o original como `reagendado` (mantém histórico, não viola unique pois mudou a data)

## 5. Frontend

**Arquivos novos:**
- `src/components/crm/VisitSchedule.tsx` — container da aba
- `src/components/crm/VisitScheduleWeekView.tsx` — visão semanal (7 cards)
- `src/components/crm/VisitScheduleForm.tsx` — modal de criar/editar
- `src/components/crm/VisitScheduleFilters.tsx` — filtros
- `src/components/crm/VisitScheduleKPIs.tsx` — indicadores no topo
- `src/hooks/useVisitSchedules.ts` — React Query (staleTime 5min, sem refetch on focus, conforme memória)

**Edição em arquivo existente:**
- `src/pages/CRM.tsx` — adicionar `<TabsTrigger value="programacao">` e `<TabsContent>`. Manter a Agenda Semanal intacta.

**Autocomplete de cliente:** reaproveitar a mesma lógica usada hoje na criação de visita. Vou inspecionar `src/pages/CreateFieldVisit.tsx` / `CreateCall.tsx` / `StandardTaskForm.tsx` para extrair o componente de busca (busca por código ou nome em tasks históricas + cadastro manual se não existir). Ao selecionar, preencher: client_code, client_name, filial, property, phone, email. Vendedor responsável = usuário logado (editável apenas para manager/supervisor).

**KPIs no topo (período filtrado):**
- Programadas (total)
- Realizadas (status=realizado)
- Pendentes (status=planejado e planned_date >= hoje)
- % Execução = realizadas / (realizadas + nao_realizado + planejado_passado) × 100

**Filtros:** período (de/até), vendedor (UUID — memória do projeto), filial (dropdown de `filiais`), status (multi), busca por cliente (nome/código, ilike).

**Visão semanal:** grid 7 colunas (seg–dom) com cards por cliente. Cores:
- planejado: neutro
- realizado: verde
- nao_realizado: vermelho
- reagendado: âmbar (com seta indicando nova data)

## 6. Itens fora de escopo (preservados)

- Agenda Semanal atual (`WeeklyAgenda.tsx`) **não é alterada** — continua mostrando atividades/follow-ups realizados.
- Não mexer em `tasks`, `task_followups`, `opportunities`.
- Não alterar RLS de tabelas existentes.

## 7. Ordem de execução

1. Migração: criar tabela + índices + RLS + trigger de match.
2. Hook `useVisitSchedules` (CRUD + filtros).
3. Componentes (form, semana, filtros, KPIs).
4. Integrar aba em `CRM.tsx`.
5. Testar: criar programação → criar task com mesmo cliente/data → confirmar que vira `realizado` automaticamente.

---

Posso prosseguir com a migração e implementação?

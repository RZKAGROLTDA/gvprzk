# Aba Treinamentos no CRM do Vendedor

Nova aba independente de tasks: um treinamento existe uma única vez e possui N participantes vinculados. Nada do CRM atual, tarefas, follow-ups, máquinas, checklist, auth ou RLS existentes é alterado.

## 1. Estrutura das tabelas

### `public.trainings`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | nome do treinamento |
| category | text NOT NULL | PUK, Educate, Comercial, Produtos, Processos, Outros |
| training_date | date NOT NULL | |
| start_time | text NOT NULL | HH:MM |
| end_time | text NOT NULL | |
| workload_hours | numeric NOT NULL | carga horária programada |
| modality | text NOT NULL | presencial \| online |
| location | text | local físico ou link |
| instructor | text | |
| filial_id | uuid → filiais | filial organizadora (opcional) |
| status | text NOT NULL default 'programado' | programado \| realizado \| cancelado |
| observation | text | |
| created_by | uuid | |
| created_at / updated_at | timestamptz | trigger de updated_at |

### `public.training_participants`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| training_id | uuid → trainings ON DELETE CASCADE | |
| user_id | uuid | referencia `profiles.user_id` (nunca auth.users) |
| participant_name | text NOT NULL | snapshot histórico |
| participant_role | text | snapshot do perfil |
| filial_id | uuid → filiais | snapshot |
| status | text NOT NULL default 'programado' | programado \| confirmado \| realizado \| nao_participou \| reagendado |
| attended | boolean NOT NULL default false | presença |
| hours_completed | numeric NOT NULL default 0 | horas realizadas |
| completed_at | timestamptz | data de conclusão |
| observation | text | |
| created_by, created_at, updated_at | | |
| UNIQUE (training_id, user_id) | | evita duplicidade |

Snapshots de nome/cargo/filial garantem que o histórico sobreviva a desativação de usuário (mesmo padrão de `historical_users`).

Índices: `trainings(training_date)`, `trainings(filial_id)`, `training_participants(user_id)`, `training_participants(training_id)`.

## 2. RLS proposta (apenas nas duas tabelas novas)

GRANTs: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `ALL` para `service_role`. Sem acesso `anon`.

`trainings`
- SELECT: admin/manager (tudo); supervisor (filial própria via `get_supervisor_filial_id()`); demais usuários somente treinamentos em que constam como participante.
- INSERT/UPDATE/DELETE: admin/manager livre; supervisor restrito à própria filial.

`training_participants`
- SELECT: admin/manager; supervisor na própria filial; o próprio usuário (`user_id = auth.uid()`).
- INSERT/DELETE: admin/manager e supervisor (na filial dele).
- UPDATE: admin/manager e supervisor; o próprio participante pode atualizar apenas presença/horas/conclusão/observação do próprio registro.

Todas as checagens usam `has_role()` — nunca `profiles.role`.

## 3. Fluxo de criação
1. Botão `+ Novo Treinamento` abre diálogo em duas etapas.
2. Etapa 1: dados do treinamento (nome, categoria, data, horários, carga horária, modalidade, local/link, instrutor, observação). Carga horária é pré-calculada a partir de início/fim e pode ser ajustada manualmente.
3. Etapa 2: seleção de participantes.
4. Ao salvar: insere 1 linha em `trainings` e N linhas em `training_participants` (status `programado`, horas 0), com snapshot de nome/cargo/filial.

## 4. Fluxo de seleção de participantes
- Lista vem de `useFilteredConsultants` (já respeita o escopo de supervisor) enriquecida com cargo via `profiles`/`user_roles`.
- Filtros: Filial, Cargo/perfil, busca por nome.
- Ações em massa: "selecionar todos da filial", "selecionar todos do perfil", limpar seleção, e seleção individual por checkbox.
- Contador fixo no rodapé: `Participantes selecionados: X`.

## 5. Desenho da aba
- Nova `TabsTrigger` "Treinamentos" em `src/pages/CRM.tsx` (grid passa a 6/5 colunas conforme permissão).
- Topo: 6 cards de KPI — Treinamentos programados, Realizados, Pendentes, Horas programadas, Horas realizadas, Participantes programados.
- Barra de filtros no mesmo padrão do Gerencial: Período (de/até + atalhos), Filial, Categoria, Status, Participante, Instrutor.
- Sub-visões por Tabs internas:
  - **Calendário** — mesmo padrão visual da Programação (`MonthlyAgendaGrid`), com nome, horário, modalidade, nº de participantes e status no dia.
  - **Lista** — tabela com Data, Treinamento, Categoria, Instrutor, Modalidade, Participantes, Realizados, Pendentes, Carga horária, Status; linha expansível mostrando todos os participantes com status, presença, horas e ação de atualização.
- Painel **Por colaborador**: histórico por pessoa (programados, realizados, pendentes, horas programadas, horas realizadas).

Arquivos novos: `src/components/crm/TrainingsPanel.tsx`, `TrainingFormDialog.tsx`, `TrainingParticipantsPicker.tsx`, `TrainingParticipantHistory.tsx`, `src/hooks/useTrainings.ts`.

## 6. Carga horária e execução
- Carga horária programada = `workload_hours` do treinamento (sugerida por `end_time - start_time`).
- Horas programadas (agregado) = Σ `workload_hours` × nº de participantes programados.
- Horas realizadas = Σ `hours_completed` dos participantes.
- Participante pendente = status em (`programado`, `confirmado`, `reagendado`).
- Treinamento realizado = todos os participantes com status `realizado` ou `nao_participou`; pendente caso contrário — por isso um treinamento pode estar realizado para parte do grupo e pendente para outros.
- % execução = participantes realizados / participantes programados. As mesmas agregações ficam disponíveis por filial, perfil e categoria, prontas para os indicadores da aba Gerencial — que **não** será alterada nesta etapa.

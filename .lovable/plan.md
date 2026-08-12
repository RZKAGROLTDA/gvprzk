# Aba Treinamentos (versão simples) — CRM do Vendedor

Controle simples de agendamento: cada registro = 1 treinamento + 1 colaborador. Sem tasks, sem estrutura de participantes, sem presença/status. Nada do CRM atual, follow-ups, auth ou RLS existentes é alterado.

## 1. Tabela necessária

### `public.trainings`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | nome do treinamento |
| training_date | date NOT NULL | data |
| training_time | text NOT NULL | horário HH:MM |
| hours | numeric NOT NULL | quantidade de horas |
| user_id | uuid NOT NULL | colaborador (referencia `profiles.user_id`, nunca auth.users) |
| user_name | text NOT NULL | snapshot do nome (preserva histórico) |
| filial_id | uuid → filiais | snapshot da filial do colaborador |
| created_by | uuid NOT NULL | quem agendou |
| created_at / updated_at | timestamptz NOT NULL default now() | trigger de updated_at |

Índices: `trainings(training_date)`, `trainings(user_id)`, `trainings(filial_id)`.

## 2. RLS (somente nesta tabela nova)

GRANTs: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `ALL` para `service_role`. Nenhum acesso `anon`.

- **SELECT**: admin/manager veem tudo; supervisor vê registros da própria filial (`filial_id = get_supervisor_filial_id()`); demais usuários veem apenas onde `user_id = auth.uid()`.
- **INSERT**: admin/manager para qualquer colaborador; supervisor apenas para colaboradores da própria filial; demais usuários apenas para si (`user_id = auth.uid()`).
- **UPDATE / DELETE**: admin/manager; supervisor na própria filial; o próprio usuário nos seus registros.

Checagens de papel sempre via `has_role()`.

## 3. Formulário — `+ Agendar Treinamento`

Diálogo único com 5 campos:
1. **Colaborador**
   - Vendedor / RAC / Consultor: preenchido automaticamente com o usuário logado, campo somente leitura.
   - Gestor / Supervisor / Manager / Admin: combobox com busca por nome, exibindo `Nome — Filial`. Lista vem de `useFilteredConsultants` (já respeita o escopo do supervisor).
2. **Nome do treinamento** (texto)
3. **Data** (date picker, padrão de datas do projeto)
4. **Horário** (input time)
5. **Quantidade de horas** (numérico)

Salvar insere uma única linha em `trainings` com snapshot de nome e filial do colaborador.

## 4. Tela da aba Treinamentos

- Nova `TabsTrigger` "Treinamentos" em `src/pages/CRM.tsx`, ao lado das abas atuais (grid ajusta para 6/5 colunas conforme permissão).
- Cabeçalho do painel: título + botão `+ Agendar Treinamento` à direita.
- Barra de filtros no mesmo padrão visual do CRM: **Período** (de/até), **Colaborador**, **Filial** (Filial e Colaborador só aparecem para supervisor/manager/admin).
- Tabela com colunas: **Data**, **Horário**, **Colaborador**, **Treinamento**, **Horas** — ordenada por data. Ações de editar/excluir na linha, conforme permissão.
- Estado vazio simples quando não houver agendamentos no período.

Arquivos novos: `src/components/crm/TrainingsPanel.tsx`, `src/components/crm/TrainingFormDialog.tsx`, `src/hooks/useTrainings.ts`. Único arquivo existente alterado: `src/pages/CRM.tsx` (adição da aba).

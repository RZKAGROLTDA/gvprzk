# Carteira/CRM — Filial Ativa (M3/E3)

Regra aplicada (idêntica a POPS/Parque/Validação/Regularização): `effective_filial_ids(p_filial_id)` resolve o contexto operacional; RLS e as regras de papel existentes continuam sendo o teto de permissão, sem ampliação.

- comum/multi-filial → somente a Filial Ativa
- sem filial informada (não global) → filial principal
- filial não autorizada ou inexistente → 42501
- admin/gestor sem filial → global (array vazio = sem filtro)
- admin/gestor com filial → somente aquela

## 1. Banco — função por função

Em todas: `SECURITY DEFINER`, `STABLE`, `search_path = public` e formato de retorno preservados. A linha adicionada é sempre a mesma:

```sql
v_filiais uuid[] := public.effective_filial_ids(p_filial_id);
...
AND (cardinality(v_filiais) = 0 OR tf.filial_id = ANY(v_filiais))
```

E, onde existe o teto do supervisor, `tf.filial_id = v_supervisor_filial` passa a `tf.filial_id = ANY(v_filiais)`.

| Função | Assinatura atual | Assinatura proposta | Onde entra `effective_filial_ids` | Regras preservadas |
|---|---|---|---|---|
| `get_clients_overview_v2` | `(p_start_date date, p_end_date date, p_filial_id uuid, p_responsible_user_id uuid, p_search text, p_limit int, p_offset int)` | **igual** | substitui `v_supervisor_filiais := get_user_filial_ids_internal(v_uid)` (união) por `v_filiais := effective_filial_ids(p_filial_id)`; a cláusula `tf.filial_id = ANY(v_supervisor_filiais)` passa a `ANY(v_filiais)` e ganha o filtro geral de filial | CTEs, `DISTINCT ON`, total antes da paginação, `p_search`, `p_limit/p_offset`, retorno `{total, rows}` — versão validada intacta |
| `get_activity_metrics_v2` | `(p_start_date, p_end_date, p_filial_id, p_responsible_user_id)` | **igual** | troca `get_supervisor_filial_id` (principal) pelo array; filtro na CTE `scoped_followups` | filtros de data/responsável, cálculo de vendas/prospecção, todas as chaves do JSON |
| `get_funnel_metrics_v2` | `(p_start_date, p_end_date, p_filial_id, p_responsible_user_id)` | **igual** | mesma CTE de escopo | etapas do funil e chaves do JSON |
| `get_reports_dataset_v2` | `(p_start_date, p_end_date, p_filial_id, p_responsible_user_id, p_limit, p_offset)` | **igual** | CTE `s` | `LEFT JOIN LATERAL` de oportunidades, ordenação, `COUNT(*) OVER ()`, `{total, rows}` |
| `get_tasks_metrics_v2` | `(p_start_date, p_end_date, p_filial_id, p_responsible_user_id)` | **igual** | CTE `s` | `by_type`, `by_status`, `unique_tasks` |
| `get_consolidated_sales_counts_v2` | `(p_start_date, p_end_date, p_filial_id, p_responsible_user_id)` | **igual — sem alteração** | herda de `get_activity_metrics_v2` (é só repasse) | integralmente |
| `get_performance_by_seller_v2` | `(p_start_date, p_end_date, p_filial_id)` | **igual** | CTE `scoped`, substituindo o teto por filial principal | colunas e agregações por vendedor |
| `get_performance_by_filial_v2` | `(p_start_date, p_end_date, p_responsible_user_id)` | `(p_start_date, p_end_date, p_responsible_user_id, p_filial_id uuid DEFAULT NULL)` — parâmetro novo no fim, sem sobrecarga | CTE `scoped` | agregação por filial, colunas e ordem do retorno (admin/gestor sem filial continua vendo todas as filiais) |
| `get_weekly_followups_agenda` | `(p_start_date, p_end_date, p_responsible_user_id, p_filial_id)` — hoje `LANGUAGE sql`, **sem nenhuma checagem de permissão** | mesma assinatura, convertida para `plpgsql` `SECURITY DEFINER` | CTE `filtered` + o mesmo teto de papel das outras (gestor / próprio / supervisor na filial) | `generate_series` dos dias, contagens por tipo, `unique_clients`, `LEFT JOIN` que mantém dias vazios |

Observação sobre `get_weekly_followups_agenda`: é a única que muda de linguagem, porque hoje não valida nada — é o mínimo para poder recusar filial não autorizada com 42501. As demais são alteradas apenas no bloco de escopo.

Nas funções com troca de assinatura (`get_performance_by_filial_v2`, `get_weekly_followups_agenda`): `DROP` + `CREATE`, `REVOKE EXECUTE ... FROM PUBLIC`, `GRANT EXECUTE ... TO authenticated`.

## 2. Frontend — fim do conflito entre cabeçalho e filtro local

Padrão único: o seletor da tela passa a ser o próprio estado do cabeçalho (`useActiveFilialFilter`), e "Todas as filiais" só existe para admin/gestor.

| Arquivo | Hoje | Proposto |
|---|---|---|
| `src/hooks/useFollowups.ts` | `useFollowups()` / `useFollowupsProspectsOnly()` leem `task_followups` sem filial; chave `['task_followups','all',user.id]` | passam a aceitar `filialId` e aplicar `.eq('filial_id', filialId)` quando informado; chave ganha `filialId` |
| `src/components/crm/ClientPortfolio.tsx` | filtra por filial só na tela | envia `activeFilialId` ao hook; sem "Todas" para não-global |
| `src/components/crm/Returns.tsx` | idem | idem |
| `src/components/crm/CRMManagement.tsx` | `useFollowups()` sem filial + seletor próprio começando em "Todas", incluindo "Resumo por filial" | usa a Filial Ativa; "Todas" e o resumo multi-filial apenas para admin/gestor |
| `src/components/crm/WeeklyAgenda.tsx` | RPC recebe o filtro local, que pode voltar a "Todas" | envia sempre a Filial Ativa (RPC e detalhe do dia) |
| `src/components/crm/VisitSchedulePanel.tsx` | já envia `scopedFilialId` | só remover "Todas" para não-global |
| `src/components/crm/TrainingsPanel.tsx` | idem | idem |
| `src/components/SalesFunnel.tsx`, `FunnelClientsOptimized.tsx`, `FunnelTasksOptimized.tsx`, `src/pages/Reports.tsx` | `filters.filial` local, desligado do cabeçalho | `filters.filial` inicia e acompanha a Filial Ativa; "Todas" só para global |
| `src/pages/PerformanceByFilial.tsx` | não envia filial; chave sem filial | envia `p_filial_id = activeFilialId`; `filialId` na chave |
| `src/pages/PerformanceBySeller.tsx` | `p_filial_id: null` fixo; chave sem filial | envia a Filial Ativa; `filialId` na chave |

Todas as chaves de consulta cujo resultado depende da filial recebem `filialId`.

## 3. `useTasks` e offline — apresentado separadamente

`useTasks` é hook compartilhado de leitura **e** escrita (criação, fila offline, sincronização). Proposta desta etapa:

- **Somente a leitura** `loadTasks()` (`.from('tasks')`, 50 registros) passa a filtrar pela Filial Ativa. Como `tasks` não tem `filial_id`, o filtro usa o nome da filial já disponível no cache de filiais do próprio hook, comparando sem diferenciar maiúsculas/espaços (padrão `LOWER(TRIM)` do projeto).
- Aplicado **apenas quando** existe Filial Ativa e o usuário não é global; admin/gestor sem filial continua vendo tudo.
- **Nada muda** em `createTask`, `saveTaskOffline`, fila offline, sincronização e leitura offline (`getOfflineTasks`) — a tarefa criada continua gravando o nome da filial como hoje, e a fila offline não é filtrada.
- `loadTasks` é recarregado quando a Filial Ativa muda (o hook não usa React Query; a filial entra nas dependências do efeito de carregamento).

Alternativa, se preferir risco zero nesta etapa: deixar `useTasks` fora e tratá-lo em rodada própria.

## 4. Consumidores dos hooks compartilhados (para não afetar tela pessoal)

- `useFollowups()`: `ClientPortfolio.tsx:74`, `CRMManagement.tsx:48` — ambas são telas de carteira/gerencial, devem seguir a Filial Ativa.
- `useFollowupsProspectsOnly()`: `Returns.tsx:53` — tela de retornos, segue a Filial Ativa.
- `WeeklyAgenda.tsx` importa apenas o tipo `FollowupRow`, não o hook.
- `useTasks`: usado em telas de tarefas/agenda e no fluxo de criação; nenhum consumidor é visão estritamente pessoal, e o filtro proposto é só de leitura.
- Nenhuma tela do Meu Dia usa esses hooks — a visão pessoal do Meu Dia permanece intocada.

## 5. Fora do escopo

Meu Dia, Parque, Validação, Regularização, POPS, RLS geral, cargos, usuários, matrícula PM e vínculos multi-filial.

## 6. Bateria após aplicar (leitura; escrita em BEGIN/ROLLBACK)

Diogo (Caiapônia principal + Planalto Verde) em cada filial e na volta, comparando com contagem direta da base: carteira/clientes únicos, atividades, funil, dataset de relatórios, métricas de tarefas, desempenho por vendedor e por filial, agenda semanal. Mais: sem filial → principal; filial não autorizada → 42501; usuário de filial única (Jhonatan/Canarana); admin sem filial → global; admin com filial → somente a filial. Resultado em `Teste | Filial Ativa | Obtido | Esperado | Status`.

# Auditoria de Performance e Acesso — Diagnóstico (nada aplicado)

## Resumo em uma frase
A lentidão não vem da autenticação: vem de (1) RLS avaliada linha-a-linha em tabelas grandes e (2) um segundo QueryClient sem configuração dentro do App, que anula todo o cache do projeto.

---

## 1. Achado CRÍTICO nº1 — dois QueryClient aninhados

`src/main.tsx` envolve o app em `QueryProvider` (staleTime 5min, `refetchOnWindowFocus: false`, `refetchOnMount: false`, backoff). Mas `src/App.tsx` cria **outro** client: `const queryClient = new QueryClient()` — sem opções — e o provider interno é o que vale para 100% dos hooks.

Consequência para todo hook que não define opções próprias:
- `staleTime: 0` → refetch a cada montagem de componente;
- `refetchOnWindowFocus: true` (default) → refetch ao voltar para a aba;
- `retry: 3` com backoff → um erro vira 4 requests;
- `refetchOnMount: true` → trocar de aba/tela recarrega tudo.

Somado a `queryClient.clear()` no `useEffect` de mudança de usuário, o cache é jogado fora no primeiro render após o login.

## 2. Achado CRÍTICO nº2 — RLS avaliada por linha

Medição direta na mesma consulta do Parque de Máquinas:

| Caminho | Tempo |
|---|---|
| SQL direto (sem RLS) | **12 ms** |
| Mesma query via PostgREST (RLS ativa) | **2.792 ms médio / 7.777 ms pico** (457 chamadas) |

A policy `client_equipment_select` é:
`has_role(...) OR has_role(...) OR created_by = auth.uid() OR validated_by = auth.uid() OR filial_id IS NULL OR filial_id = get_user_filial_id() OR filial_id = get_supervisor_filial_id(auth.uid())`

As funções são STABLE mas **não estão encapsuladas em subquery** (`(select has_role(...))`), então o Postgres as reavalia por linha durante o Seq Scan de 19.7k linhas — 3 funções SECURITY DEFINER que consultam `profiles`/`user_roles` por linha. Mesmo padrão em `tasks`, `task_followups` e `clients_master` (essa última com `EXISTS (SELECT 1 FROM profiles …)` inline).

## 3. Fluxo de login — requests bloqueantes

Sequência real até a primeira tela:
1. `auth.getSession()` (local, rápido) + listener `onAuthStateChange`;
2. `profiles` (colunas explícitas, `maybeSingle`) — **bloqueia o gate**;
3. `filiais` por id — não bloqueia (correto);
4. `user_roles` (`useUserRole`) — bloqueia a UI do Layout/SalesFunnel;
5. `filiais?select=id&limit=1` do health check;
6. `useSessionSecurity` → `getSession()` extra + monitor de segurança;
7. `useVersionHeartbeat` → upsert em `user_app_versions`;
8. `useAutoVersionCheck` → fetch de versão.

Total observado: **7–9 requests nos primeiros segundos**, dos quais 2 bloqueiam de fato (profiles, user_roles). O caminho de auth em si está correto — sem loop, sem redirect repetido, sem watchdog. O que trava é o passo seguinte: a primeira tela (`SalesFunnel`) dispara métricas + lista + consultores em paralelo, e a métrica consolidada está com `staleTime: 0` + `refetchOnMount: 'always'`.

## 4. Tabela de diagnóstico

| PROBLEMA | LOCAL | IMPACTO | TEMPO/QTD | CAUSA PROVÁVEL | PRIOR. | CORREÇÃO RECOMENDADA |
|---|---|---|---|---|---|---|
| QueryClient sem config sobrepondo o QueryProvider | `src/App.tsx:56` | Refetch geral, cache inútil, 4x requests em erro | todas as queries | provider aninhado | CRÍTICO | Remover o client interno e usar só o do `QueryProvider` |
| RLS reavaliada por linha | policies de `client_equipment`, `tasks`, `task_followups`, `clients_master` | Queries 200x mais lentas, Disk IO | 12ms → 2.792ms | `has_role()`/`get_user_filial_id()` fora de subquery | CRÍTICO | Envolver cada função em `(select …)` nas policies (sem mudar a regra) |
| Parque de Máquinas em caminho direto (não RPC) | `useEquipmentSearch` / fallback `useEquipmentPark` | pior query do banco | 457 calls, 1.276 s totais | filtros não cobertos pela RPC caem no PostgREST | CRÍTICO | Estender a RPC paginada p/ machine_type + validated_by e eliminar o fallback |
| `get_equipment_validation_summary()` sem cache | tela /equipamentos | 2º maior consumo | 530 calls, 1.429ms médio | agregação full-table a cada abertura | ALTO | Materializar/agendar agregado ou cachear mais |
| Autocomplete de cliente busca na `tasks` (5.9 GB) | `useVisitSchedules.ts:159`, `clientAutofill.ts` | lentidão em CRM/agenda | 753 calls, 1.044ms médio | ILIKE em tabela gigante sem trigram | ALTO | Migrar essas buscas para `clients_master` (já indexada com trigram) |
| `count: 'exact'` em `client_equipment` | `useClientEquipment` | +4.4s por página | 61 calls, 4.796ms médio | contagem full-scan sob RLS | ALTO | Usar `total_count` da RPC; nunca `count exact` no caminho direto |
| Métricas com `staleTime: 0` + `refetchOnMount:'always'` | `useConsolidatedSalesMetrics`, `useManagementData` (4 queries) | recarrega a cada navegação | por tela | configuração deliberada anterior | ALTO | staleTime 2–5 min, `refetchOnMount: false` |
| `task_followups` sem paginação/filtro no servidor | listagens de follow-up | 179 calls, 693ms médio | ORDER BY sem índice em `activity_date` | MÉDIO | Índice `(activity_date desc)` + `(responsible_user_id, activity_date)` |
| `tasks` 5.9 GB / `products` 2.7 GB | banco | Disk IO budget | 14.9k linhas | Base64 legado ainda nas colunas | MÉDIO | Concluir migração p/ Storage e limpar colunas |
| Backups ocupando 276 MB | `tasks_backup*`, `products_backup*` (0 linhas úteis) | espaço/vacuum | 276 MB | tabelas de backup antigas | BAIXO | Avaliar drop após validação |
| `useSessionSecurity` faz `getSession()` extra + monitor | `Layout` | requests a mais no login | 1–2 req | health check redundante | BAIXO | Reaproveitar sessão do contexto |
| Logs `console.log` em hooks de render | `useUserRole`, `useConsolidatedSalesMetrics`, `useClientEquipment` | ruído/custo em mobile | — | diagnóstico temporário | BAIXO | Remover ou condicionar a DEV |

## 5. Respostas diretas às suas perguntas

- **Requests no login:** 3 bloqueantes na prática (`getSession`, `profiles`, `user_roles`) + 4–6 secundários. Sem duplicidade grave, sem loop de auth.
- **Requests no carregamento inicial:** 7–9; sobem para 12+ na primeira tela por causa do refetch causado pelo item nº1.
- **clients_master (31.553 linhas):** confirmado que **nenhuma tela carrega a tabela inteira**. O único acesso amplo é a tela administrativa de Revisão de Clientes (paginada) e a RPC de busca; existem índices btree + trigram. Aqui está OK.
- **Diferença entre cargos:** admin/manager passam pelos `has_role` primeiro (curto-circuito rápido); **supervisor é o pior caso** — cai em `get_supervisor_filial_id()` + `EXISTS` com JOIN `profiles/filiais` por linha. RAC/CPA/CSA/sales_consultant têm custo intermediário e idêntico entre si (paridade confirmada). Isso explica o "comportamento diferente entre usuários".
- **Erros:** o padrão é **timeout de statement (8s)** — vários `max_ms` batendo ~7.9s, o que aparece no cliente como "tela carregando para sempre"/`failed to fetch`. É lentidão, **não** falha de autenticação.
- **Gargalos:** banco = RLS por linha + `client_equipment`; frontend = QueryClient duplicado; auth = nenhum relevante.

## 6. Plano de correção sugerido (por ganho/risco)

**Etapa 1 — risco baixíssimo, ganho imediato**
1. Remover o `QueryClient` interno do `App.tsx`.
2. Ajustar `staleTime`/`refetchOnMount` das métricas e do Management.
3. Remover logs de diagnóstico em hooks de render.

**Etapa 2 — banco, sem mudar regra de acesso**
4. Reescrever as policies de `client_equipment`, `tasks`, `task_followups`, `clients_master` com `(select …)` nas chamadas de função (mesma lógica, avaliação uma única vez).
5. Índices: `task_followups(activity_date desc)`, `(responsible_user_id, activity_date desc)`.

**Etapa 3 — eliminar as piores queries**
6. Estender `get_equipment_park_paginated` para machine_type/validated_by e remover o fallback direto + `count exact`.
7. Cachear/materializar `get_equipment_validation_summary`.

**Etapa 4 — busca de clientes**
8. Trocar autocompletes que leem `tasks` por `clients_master`.

**Etapa 5 — armazenamento**
9. Finalizar migração Base64 → Storage e avaliar drop dos backups.

Nada foi alterado. Confirme por qual etapa devo começar.

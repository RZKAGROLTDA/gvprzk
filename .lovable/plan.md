# Meu Dia — Filial Ativa (diagnóstico + proposta)

Etapa somente de diagnóstico. Nada foi alterado no banco nem nas telas.

## 1. Meu Dia pessoal (deve continuar igual)

Consultas: `get_my_day_summary()` e `get_my_day_details(p_block, p_bucket, p_limit, p_offset)`.
Ambas passam por `my_day_context()`, que usa apenas `auth.uid()` — não existe nenhum parâmetro nem filtro de filial.

Frontend: `useMyDaySummary()` e `useMyDayDetails()` (`src/hooks/useMyDay.ts`), consumidos em `src/pages/MyDay.tsx` (aba "Minha visão") e `src/components/myday/SeeAllDialog.tsx`.
queryKeys: `['my-day-summary', userId]` e `['my-day-details', block, bucket, page, pageSize]`.

Conclusão: nada a mudar. A proposta não toca nessas funções, hooks ou chaves de cache.

## 2. Visão da equipe

Consulta: `get_my_day_team_summary(p_filial_id, p_role, p_user_id)` — SECURITY DEFINER, usa `my_day_scope()`.

Comportamento atual:
- `my_day_scope()` devolve `scope = 'global'` (admin/manager), `'filial'` (supervisor) ou `'self'`, e `filial_id` = **somente a filial principal do cadastro** (`profiles.filial_id`).
- Linha decisiva: a filial usada é `CASE WHEN scope = 'filial' THEN scope.filial_id ELSE p_filial_id END`. Ou seja, **para supervisor o `p_filial_id` enviado pela tela é ignorado**; sempre vale a filial principal.
- A lista de colaboradores filtra `profiles.filial_id = v_filial`, logo não há soma de filiais — mas também não há como ver a equipe de uma filial adicional.
- Para admin/manager: `p_filial_id` é respeitado; `NULL` = todas as filiais (global). Correto.
- `scope = 'self'` → erro 42501. Correto.

Frontend: `useMyDayTeamSummary(filters, enabled)`; a tela já envia `filialId` = Filial Ativa do cabeçalho (`useActiveFilialFilter`), já limpa o colaborador selecionado ao trocar de filial e já inclui `filialId` na queryKey `['my-day-team-summary', filialId, role, userId]`. Filtro local remanescente: apenas a busca por nome (em memória) — inofensiva.
Ponto aberto no frontend: a consulta roda com `enabled = tab === 'team'`, sem esperar a resolução da Filial Ativa (`isScopeReady`).

Conclusão: o bloqueio do supervisor multi-filial está **no banco**, não na tela.

## 3. Abertura/consulta individual de um colaborador

Consultas: `get_my_day_user_summary(p_user_id)` e `get_my_day_user_details(p_user_id, ...)`, ambas via `my_day_assert_target(p_user_id)`.

`my_day_assert_target` compara a filial principal do colaborador com `my_day_scope().filial_id`: se diferente, erro 42501. Portanto o supervisor multi-filial, operando numa filial adicional, **não consegue abrir** o colaborador daquela filial. Não existe parâmetro de filial nessas funções.

Frontend: `UserDayDialog` → `useMyDayUserSummary(userId, open)`; queryKeys `['my-day-user-summary', userId]` e `['my-day-user-details', userId, block, bucket, page, pageSize]` — sem `filialId`.

## 4. Observação

`my_day_scope_v2()` já existe (devolve também `filial_ids[]` via `get_user_filial_ids_internal`), mas **nenhuma função do Meu Dia a utiliza hoje**. É a base natural da correção.

---

# Proposta técnica mínima (não aplicar ainda)

## Banco (3 objetos)

1. **`my_day_assert_target(p_user_id uuid, p_filial_id uuid DEFAULT NULL)`** — nova assinatura de 2 parâmetros, mantendo o retorno atual. Validação da filial passa a usar `effective_filial_ids(p_filial_id)` (mesmo padrão já aprovado em Carteira/CRM): o colaborador precisa pertencer a uma das filiais efetivas; filial não autorizada continua 42501. A assinatura de 1 parâmetro é preservada como repasse com `NULL`, para não quebrar nada.
2. **`get_my_day_team_summary(p_filial_id, p_role, p_user_id)`** — mesma assinatura, mesmo retorno. Troca `my_day_scope()` por `my_day_scope_v2()` e resolve a filial-alvo:
   - `scope = 'self'` → 42501 (igual a hoje);
   - supervisor: `p_filial_id` obrigatório e validado por `effective_filial_ids(p_filial_id)`; `NULL` cai na filial principal. Nunca a união de filiais;
   - admin/manager: `NULL` = global, informado = somente aquela filial (igual a hoje).
   O restante do corpo (CTEs `membros`/`filtrados`/`metas`/`agg`, metas diárias/semanais, janela semanal truncada pelo mês, KPIs) fica **byte-idêntico**.
3. **`get_my_day_user_summary(p_user_id, p_filial_id DEFAULT NULL)`** e **`get_my_day_user_details(p_user_id, p_block, p_bucket, p_limit, p_offset, p_filial_id DEFAULT NULL)`** — repassam `p_filial_id` ao `my_day_assert_target`. Retorno inalterado.

`my_day_scope()` não é alterada. `my_day_context()`, `my_day_summary_build`, `my_day_details_build`, `get_my_day_summary` e `get_my_day_details` não são tocadas. Nenhuma policy RLS, cargo, matrícula ou vínculo é alterado. Ao final, conferência em `pg_proc` para garantir assinatura única por função alterada (sem overload órfão).

## Frontend (4 arquivos)

- `src/hooks/useMyDay.ts`: `useMyDayUserSummary` e `useMyDayUserDetails` passam a receber e enviar `filialId`, incluindo-o na queryKey. `useMyDaySummary`/`useMyDayDetails` intocados.
- `src/pages/MyDay.tsx`: a aba da equipe só consulta depois que a Filial Ativa está resolvida (`isScopeReady`); repassa a filial ao diálogo do colaborador.
- `src/components/myday/UserDayDialog.tsx`: recebe `filialId` e o encaminha aos hooks.
- Nenhum filtro local de filial é criado; o cabeçalho continua sendo a única origem da Filial Ativa.

## Bateria de validação prevista (após autorização)

Formato Teste | Filial Ativa | Obtido | Esperado | Status, cobrindo: supervisor na filial principal; supervisor na filial adicional (equipe apenas daquela filial, sem soma com a principal); troca de filial e volta, sem resíduo; filial não autorizada → 42501; abertura individual de colaborador da filial ativa (OK) e de outra filial (42501); consultor comum → 42501 na equipe; admin sem filial → global; admin com filial → somente aquela; Meu Dia pessoal com números idênticos aos de hoje; troca de filial na tela sem reload e sem cache residual.

## Fora do escopo

`my_day_scope()`, Meu Dia pessoal, `useTasks`/tarefas/offline, POPS, CRM/Carteira, Parque, Validação, Regularização, RLS, cargos, usuários, matrículas e vínculos.

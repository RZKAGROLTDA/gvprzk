# POPS — Frente 2: indicadores Large x Small + filtros por chassi e modelo

Auditoria feita nas RPCs atuais e na tela `/pops`. Nenhuma migration aplicada ainda.

## Auditoria (situação atual)

- `pops_goal_summary(p_program_id, p_filial_id)`: já resolve escopo por `pops_scope()` (global para Manager/Admin, filial para RAC/CPA/CSA/Supervisor), já filtra `active` e conta `status = 'servicada'`. Não retorna nada por plataforma.
- `pops_portfolio_clients(p_program_id, p_filial_id, p_search, p_limit, p_offset)`: agrupa por `client_key`, busca só por nome do cliente (`pops_client_name_norm`). Não filtra por serial, modelo ou plataforma.
- `pops_portfolio_client_machines(p_program_id, p_client_key)`: devolve todas as máquinas ativas do cliente no escopo. Já retorna `pops_serial`, `pops_model`, `pops_platform`.
- Frontend: `src/pages/Pops.tsx` (busca + lista de clientes + lista de máquinas), `src/components/pops/PopsGoalHeader.tsx` (painel superior), `src/hooks/usePops.ts` (tipos + chamadas).
- Dados hoje: `pops_platform` só tem dois valores — `Large` (3.788) e `Small` (1.289). Nenhum vazio. Ainda assim o cálculo tratará "outros/vazio" sem quebrar.

## O que muda

### Banco (2 RPCs, `CREATE OR REPLACE`, sem tabela nova)

1. `pops_goal_summary` — acrescenta 6 campos ao JSON, mantendo todos os atuais e todas as regras:
   - `large_total`, `large_serviced`, `large_percent`
   - `small_total`, `small_serviced`, `small_percent`
   - Cálculo: sobre o mesmo `SELECT` já existente, com `count(*) FILTER (WHERE upper(btrim(pops_platform)) = 'LARGE')` e o par com `'SMALL'`; serviçadas = mesmo filtro + `status = 'servicada'`; percentual = `round(serviced / nullif(total,0) * 100, 1)`. Mesmo escopo de filial e mesmo `active = true`.

2. `pops_portfolio_clients` — acrescenta 3 parâmetros opcionais no fim da assinatura (sem overload novo: é o mesmo nome com defaults, chamada atual continua válida):
   - `p_serial text DEFAULT NULL`, `p_model text DEFAULT NULL`, `p_platform text DEFAULT NULL`
   - Filtros aplicados **na máquina** antes do `GROUP BY client_key`, tanto no `count` quanto na página:
     - serial: `m.pops_serial ILIKE '%'||p_serial||'%'`
     - modelo: `m.pops_model ILIKE '%'||p_model||'%'`
     - plataforma: `upper(btrim(m.pops_platform)) = upper(btrim(p_platform))` quando informado
   - Combinação AND com a busca de cliente já existente. Assim, ao pesquisar um chassi, aparece o cliente dono daquela máquina; os contadores do card do cliente passam a refletir as máquinas que casam com os filtros.

3. `pops_portfolio_client_machines` — acrescenta os mesmos 3 parâmetros opcionais, usados apenas para **marcar/ordenar**: retorna todas as máquinas do cliente (regra atual preservada) mais um campo `matches_filter boolean`, para o frontend destacar e ordenar primeiro a máquina procurada. Alternativa mais simples, se preferir: não tocar nesta RPC e fazer o destaque só no frontend com os filtros já em memória — nesse caso a alteração de banco fica em 2 RPCs.

Nada de `pops_complete_machine`, serviços, OS, permissões, base de máquinas ou Meu Dia é tocado.

### Frontend

- `src/hooks/usePops.ts`: novos campos no tipo `PopsGoalSummary`; `usePopsClients` passa `serial`, `model`, `platform` (entram na queryKey); `usePopsClientMachines` recebe os filtros para destaque.
- `src/components/pops/PopsGoalHeader.tsx`: dois cards novos (LARGE e SMALL) na grade de mini-cards, no formato `3.788 máquinas / 325 serviçadas · 8,6%`, com números vindos da RPC.
- `src/pages/Pops.tsx`: ao lado da busca de cliente, campos "Chassi / Série", "Máquina / Modelo" e select "Plataforma: Todas | Large | Small"; em desktop inline, em mobile dentro de um botão "Filtros" (Popover/Sheet) com badge de filtros ativos e botão "Limpar". Na lista de máquinas do cliente, as que casam com os filtros ficam no topo com borda destacada.

### Resumo da decisão

Precisa de banco: sim, mínimo — 2 RPCs (`pops_goal_summary`, `pops_portfolio_clients`), opcionalmente a 3ª só para o destaque. Somente `CREATE OR REPLACE`, sem alteração de dados nem de regras.

Aguardando aprovação para aplicar.

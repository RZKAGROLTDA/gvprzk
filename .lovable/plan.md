# POPS Frente 2 — busca inteligente + painel de gestão

Auditoria concluída. A migration anterior da Frente 2 **não foi aplicada** (as RPCs seguem com a assinatura original), então tudo entra em uma única migration agora.

## Auditoria

- `pops_norm_place(text)`: IMMUTABLE, faz upper + remove acentos + colapsa espaços. Serve como base, não precisa de outra estrutura.
- `pops_machines.pops_client_name_norm`: já normalizado por essa função, mas a origem tem espaçamento irregular (ex.: `HELCIODE AVILAMENDONCA`). Por isso `LIKE '%termo%'` falha hoje.
- `pops_machines.pops_serial_norm`: já preenchido nas 5.077 máquinas — é a coluna certa para o chassi.
- `pg_trgm` já instalado (útil se precisarmos de índice depois).
- `pops_scope()` resolve escopo (global para Manager/Admin; filial para RAC/CPA/CSA/Supervisor) — nenhuma regra de permissão muda.

## 1. Busca dinâmica de cliente (como será corrigida)

Comparação por **texto "esmagado"**: `regexp_replace(pops_client_name_norm, '[^A-Z0-9]', '', 'g')`. O termo digitado passa por `pops_norm_place()` e é quebrado em palavras; cada palavra é esmagada da mesma forma e precisa aparecer no nome esmagado (AND entre os termos, `LIKE '%termo%'`).

Efeito: base `JOAOANTONIODASILVA` é encontrada digitando `João Antonio`, `joao`, `antonio`, `silva` ou `antonio silva` — sem depender de espaços, acentos, caixa ou pontuação. Sem nova coluna e sem nova tabela; 5.077 linhas por programa tornam o custo irrelevante.

No frontend: busca **conforme digita** com debounce de 300 ms (substitui o formulário com botão "Buscar"), reset de página a cada mudança.

## 2. Busca por chassi/série

Usa `pops_serial_norm`, também esmagada (`[^A-Z0-9]` removido) dos dois lados, com `LIKE '%parcial%'`. Aceita parcial, ignora caixa, espaços e formatação. Combina em AND com os outros filtros.

## 3. Modelo e plataforma

- Modelo: `pops_model` esmagado + parcial (mesma regra do chassi).
- Plataforma: `Todas | Large | Small`, comparação `upper(btrim(pops_platform))`.
- Todos os filtros são combináveis (AND), aplicados **na máquina** antes do agrupamento por cliente, então o cliente dono do chassi aparece na lista.

## 4/5/6. RPCs alteradas e nova RPC

1. `pops_goal_summary` (CREATE OR REPLACE) — mantém tudo e acrescenta:
   `large_total`, `large_serviced`, `large_pending`, `large_percent`, `small_total`, `small_serviced`, `small_pending`, `small_percent`.
   Mesma janela de tempo (America/Sao_Paulo), somente `active = true`, serviçadas = `status = 'servicada'`, mesmo escopo de filial.

2. `pops_portfolio_clients` (CREATE OR REPLACE) — busca de cliente reescrita conforme item 1 + 3 parâmetros opcionais no fim: `p_serial`, `p_model`, `p_platform`. Assinatura antiga continua válida (defaults). Nenhuma outra regra alterada.

3. `pops_portfolio_client_machines` (CREATE OR REPLACE) — só acrescenta os mesmos 3 filtros opcionais para devolver `matches_filter boolean`, permitindo destacar/ordenar primeiro a máquina procurada. Continua retornando todas as máquinas do cliente.

4. **Nova RPC `pops_executor_results(p_program_id, p_filial_id, p_platform, p_executed_by)`** — necessária para não trazer milhares de linhas ao frontend. Agrega por `executed_by` somente máquinas `status = 'servicada'`:
   nome (`profiles.name`), filial da máquina, cargo real vindo de `user_roles` (rac / cpa / csa / supervisor / manager / admin — sem virar tudo "RAC"), total serviçadas, large, small, hoje, semana, mês e `share_percent` sobre o total executado no escopo. Ordenada por total desc. Sem meta e sem "total do RAC" — só o realizado.
   Escopo: Manager/Admin global (ou filial escolhida); RAC/CPA/CSA/Supervisor restritos à própria filial via `pops_scope()`. Filtros gerenciais de plataforma e executor entram como parâmetros opcionais.

Nada de `pops_complete_machine`, serviços, OS, regras de conclusão, base de máquinas, vínculo com Parque, Meu Dia ou tabelas novas.

## 7. Estrutura visual

- `PopsGoalHeader`: **Linha 1** — Meta POPS (serviçadas/meta), Serviçadas, Pendentes, % conclusão. **Linha 2** — card Large e card Small (total · serviçadas · pendentes · %) + Hoje, Semana, Mês.
- Novo `PopsExecutorResults`: tabela compacta (Executor · Cargo · Filial · Serviçadas · Large · Small · Hoje · Semana · Mês · % part.), ordenada por serviçadas desc; no mobile vira lista de cards enxutos. Filtros de filial/plataforma/executor visíveis apenas para Manager/Admin (plataforma e executor também úteis no escopo de filial).
- Novo `PopsPortfolioFilters` logo acima da carteira: Cliente (busca conforme digita), Chassi/Série, Máquina/Modelo, Plataforma. Desktop em linha; mobile em botão "Filtros" com contador de filtros ativos e "Limpar", mantendo Cliente e Chassi sempre visíveis para o RAC em campo.
- Fluxo Cliente → Máquinas preservado; máquina que casa com o filtro aparece no topo, destacada.

## Frontend a alterar

`src/hooks/usePops.ts`, `src/components/pops/PopsGoalHeader.tsx`, `src/pages/Pops.tsx`, mais dois componentes novos (`PopsExecutorResults.tsx`, `PopsPortfolioFilters.tsx`).

Aguardando aprovação para aplicar a migration.

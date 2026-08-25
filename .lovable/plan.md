# Meu Dia — Etapa 3 (Frontend): auditoria + desenho

Banco não será alterado. Usa apenas `get_my_day_summary()` e `get_my_day_details(p_block, p_bucket, p_limit, p_offset)` já validadas.

## 1. Auditoria do frontend atual

| Item | Situação hoje |
| --- | --- |
| Rota inicial (`/`) | Renderiza `SalesFunnel` (igual a `/dashboard`) para todos os cargos |
| `src/pages/Home.tsx` | Existe mas **não está roteada** (código morto: 3 atalhos de criação de tarefa) |
| Menu lateral | `src/components/Layout.tsx`, primeiro item = "Nova Tarefa" (`/create-task`), depois Dashboard, Campanhas, CRM, Parque de Máquinas |
| Programa de Visitas / Retornos / Treinamentos | Abas dentro de `src/pages/CRM.tsx` (`programacao`, `retornos`, `treinamentos`), **sem sincronização por URL** — não é possível hoje abrir uma aba específica por link |
| Próximas ações (tasks) | Registro aberto via Funil de Vendas (`SalesFunnel` → `TaskFormVisualization`) |
| React Query | Cliente único global (já corrigido), padrão staleTime 5–10 min, `refetchOnWindowFocus` desligado |

Consequência: a navegação por clique exige adicionar suporte a `?tab=` no CRM (mudança de UI, sem regra de negócio).

## 2. Arquivos criados/alterados

Criados:
- `src/hooks/useMyDay.ts` — `useMyDaySummary()` (1 chamada) e `useMyDayDetails(block, bucket)` (lazy, `enabled` só quando o modal abre).
- `src/pages/MyDay.tsx` — página.
- `src/components/myday/ExecutionCards.tsx` — cards Visitas e Ligações/Prospecções.
- `src/components/myday/PendingBlock.tsx` — bloco Atrasado/Hoje/Próximos (accordion no mobile).
- `src/components/myday/PendingItemRow.tsx` — linha de item (cliente, data, tipo, descrição, horário).
- `src/components/myday/SeeAllDialog.tsx` — "Ver todos" com paginação via `get_my_day_details`.
- `src/lib/myDayNavigation.ts` — mapeia item → destino.

Alterados:
- `src/App.tsx` — nova rota `/meu-dia`.
- `src/components/Layout.tsx` — "Meu Dia" como **primeiro item do menu**.
- `src/pages/CRM.tsx` — ler/escrever `?tab=` (`useSearchParams`) para permitir deep-link nas abas.

Nada de edição de dados: o Meu Dia é somente leitura + navegação.

## 3. Rota proposta

`/meu-dia` (dentro de `Layout`, protegida como as demais).

## 4. Comportamento após login — recomendação

**Recomendo a opção A limitada + B (híbrido):**
- Para cargos operacionais (`sales_consultant`, `consultant`, `technical_consultant`, `rac`, `cpa`, `csa`): ao acessar `/`, redirecionar para `/meu-dia`. Motivo: é a central de execução pessoal deles; o funil não responde "o que eu faço hoje".
- Para `manager` / `admin` / `supervisor`: `/` continua no Funil/Dashboard (sem mudança nesta etapa), mas o item "Meu Dia" aparece no menu para todos.
- O redirecionamento é apenas na raiz `/`; `/dashboard` continua acessível e não sofre redirect, então ninguém perde acesso ao funil.

## 5. Layout textual

```text
Meu Dia                                  [Atualizar]
Segunda, 25 de agosto

MINHA EXECUÇÃO
+------------------------+  +------------------------+
| VISITAS      Diária    |  | LIGAÇÕES/PROSPECÇÕES   |
| 2 / 3                  |  | 5 / 3   Meta atingida  |
| Faltam 1               |  | (sem meta: "5 hoje")   |
| [====----] 67%         |  | [========] 100%        |
+------------------------+  +------------------------+
  (RAC/CPA/CSA sáb/dom -> "Sem meta hoje")

PENDÊNCIAS
[ ATRASADO 24 ]  aberto por padrão
  * Cliente Alfa    12/08  Visita programada   Revisar proposta   08:30  >
  * Cliente Beta    18/08  Retorno             Ligar p/ orçamento        >
  ... até 5 itens                                   [Ver todos (24)]

[ HOJE 6 ]
[ PRÓXIMOS 7 dias  11 ]
```

Dentro de cada bloco, itens agrupados por tipo (Visitas programadas, Retornos, Treinamentos, Próximas ações), máximo 5 por bloco, com contador e "Ver todos".

## 6. Componentes

- `ExecutionCards` — recebe `summary.goals`; sem chamadas próprias. Mostra "Diária"/"Semanal", "Faltam X", "Meta atingida", "Sem meta hoje".
- `PendingBlock` — `title`, `tone` (destrutivo/primário/neutro), lista de grupos, `defaultOpen` (Atrasado = true).
- `PendingItemRow` — cliente (negrito), data formatada com `formatDateDisplay`, badge de tipo, descrição truncada em 1–2 linhas, horário quando existir; linha clicável.
- `SeeAllDialog` — Dialog/Sheet com lista paginada (limit 20 + "Carregar mais").
- Skeletons e estados vazios locais.

## 7. Navegação de cada item

| Tipo | Destino |
| --- | --- |
| Visita programada | `/crm?tab=programacao` |
| Retorno | `/crm?tab=retornos` |
| Treinamento | `/crm?tab=treinamentos` |
| Próxima ação (task) | `/dashboard?taskId=<id>` (abre o registro no Funil) — se o Funil ainda não aceitar `taskId`, o fallback é abrir `/dashboard` com busca pré-preenchida |

Nenhuma edição no Meu Dia.

## 8. Mobile

- 1 coluna; cards de execução compactos (número grande, meta em texto pequeno).
- Blocos empilhados em Accordion: "Atrasado" aberto por padrão; "Hoje" e "Próximos" fechados com contador visível.
- Itens em cartão vertical (sem tabela, sem scroll horizontal); "Ver todos" abre `Sheet` de baixo para cima.
- Alvos de toque ≥ 44px.

## 9. Estados

- **Loading**: skeletons dos 2 cards + 3 blocos (nenhum flash de vazio).
- **Erro**: card único com mensagem e botão "Tentar novamente" (retry do React Query); erro em "Ver todos" fica contido no dialog.
- **Vazio total**: "Nada pendente. Sua execução está em dia."
- **Vazio por bloco**: linha discreta "Nenhum item".
- **Sem meta**: card mostra apenas realizado.

## 10. Performance

- 1 chamada na abertura (`get_my_day_summary`, medida em ~0,5 ms no servidor).
- `get_my_day_details` só ao abrir "Ver todos", com `enabled` e `keepPreviousData`.
- React Query: `staleTime` 5 min, `gcTime` 10 min, `refetchOnWindowFocus: false`, `refetchOnMount: false`; atualização apenas pelo botão "Atualizar".
- Nenhuma chamada por card.

## 11. Riscos

| Risco | Mitigação |
| --- | --- |
| CRM não aceita deep-link de aba | Adicionar `?tab=` (somente UI, default atual preservado) |
| Funil pode não abrir task por `taskId` | Validar na implementação; fallback = abrir a lista sem quebrar o clique |
| Redirect da raiz confundir usuários | Redirect só para cargos operacionais; `/dashboard` intacto e no menu |
| Cargos futuros sem meta | Cards já tratam ausência de meta |
| PWA em cache antigo | Rota nova; sem impacto em service worker além do build normal |

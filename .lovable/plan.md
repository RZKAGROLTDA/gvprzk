## Escopo desta etapa

Apenas **redesign visual** da tela **Visita Fazenda** (`/create-field-visit`).

Não muda:
- backend, RPCs, tabelas, contratos
- gravação (mesmo `handleSubmit`, mesmo `task` state)
- regras de negócio (validações, fluxo prospect/ganho/parcial/perdido, cálculos de valor)
- CRM, histórico, relatórios, task_followups
- telas Ligação e Visita Técnica (ficam para próximas etapas reusando os mesmos componentes)

## Problema atual

`src/pages/CreateTask.tsx` tem 7.379 linhas e renderiza os 3 tipos (field-visit, call, workshop-checklist) no mesmo JSX gigante, controlado por `taskCategory === 'field-visit'`. Visualmente é um formulário linear longo, sem hierarquia executiva, sem resumo da oportunidade, sem score, e mistura peças/serviços/equipamentos no mesmo bloco "Produtos para Ofertar".

## Estratégia

**Wrapper visual, não reescrita.** Em vez de tocar no monólito, criar uma nova tela `FieldVisitForm` que:

1. Consome **o mesmo `useTaskEditData` / `useTasksOptimized` / `handleSubmit`** já existentes (mesmas chamadas Supabase, mesmo mapeamento `task` → tabela `tasks`).
2. Reorganiza o JSX em seções executivas componentizadas.
3. Mantém os mesmos campos com os mesmos `name` / `setTask` keys — zero risco de regressão de gravação.

`CreateFieldVisit.tsx` passa a renderizar `FieldVisitForm` em vez de `<CreateTask taskType="field-visit" />`. `CreateTask.tsx` continua intacto servindo `/create-call` e `/create-workshop-checklist`.

## Nova estrutura visual

```text
┌─────────────────────────────────────────────────┐
│ HEADER EXECUTIVO                                │
│ ← Voltar  · Visita Fazenda · [status][score]   │
│ Cliente · Filial · Consultor · OfflineIndicator│
├─────────────────────────────────────────────────┤
│ CARDS DE RESUMO (4 cols → 2 → 1)                │
│ [Valor Oportunidade] [Equipamentos] [Itens]    │
│ [Próxima Ação]                                  │
├─────────────────────────────────────────────────┤
│ TABS: Cliente · Equipamentos · Oferta · Visita  │
│  ├ Cliente: dados + propriedade                 │
│  ├ Equipamentos: cards (família, qtd, ha)       │
│  ├ Oferta:                                      │
│  │    └ sub-tabs: Peças · Serviços              │
│  │    └ resumo da oportunidade (sticky)         │
│  └ Visita: data, check-in, fotos, observações   │
├─────────────────────────────────────────────────┤
│ FOOTER STICKY (mobile-first)                    │
│ [Score visual] [Próxima ação] [Salvar]          │
└─────────────────────────────────────────────────┘
```

## Componentes novos (reutilizáveis para Ligação e Visita Técnica depois)

Em `src/components/task-form/`:

- `TaskHeader.tsx` — header executivo com título, badges de status e score
- `SummaryCards.tsx` — 4 KPI cards (valor, equipamentos, itens, próxima ação)
- `EquipmentCard.tsx` — card individual de equipamento (família, quantidade, hectares)
- `EquipmentList.tsx` — grid responsivo de `EquipmentCard` + botão adicionar
- `OfferTabs.tsx` — separa Peças vs Serviços (filtra `predefinedProducts` por `category`: `tires|lubricants|oils|greases|batteries|parts` → Peças; `services` → Serviços)
- `OpportunitySummary.tsx` — resumo sticky com total, qtd itens, status
- `OpportunityScore.tsx` — score 0-100 derivado de campos preenchidos (equipamentos, itens selecionados, valor, próxima ação) — **puramente visual, não persistido**
- `NextActionCard.tsx` — exibe/edita próxima ação (usa campos já existentes de reminders / observações)
- `MobileStickyFooter.tsx` — barra inferior fixa em mobile com score + salvar

Todos consomem props derivadas do mesmo `task: Task` já usado hoje. Nenhum componente faz fetch ou mutation próprios.

## Score visual (regra local, sem persistência)

```text
score =
  (cliente preenchido ? 20 : 0) +
  (equipamentos.length > 0 ? 20 : 0) +
  (itens selecionados > 0 ? 20 : 0) +
  (valor oportunidade > 0 ? 20 : 0) +
  (próxima ação definida ? 20 : 0)
```

Renderizado como ring/progress com cor semântica (`destructive` < 40, `warning` < 70, `success` ≥ 70).

## Arquivos

**Novos:**
- `src/pages/FieldVisitForm.tsx` — tela completa nova
- `src/components/task-form/TaskHeader.tsx`
- `src/components/task-form/SummaryCards.tsx`
- `src/components/task-form/EquipmentCard.tsx`
- `src/components/task-form/EquipmentList.tsx`
- `src/components/task-form/OfferTabs.tsx`
- `src/components/task-form/OpportunitySummary.tsx`
- `src/components/task-form/OpportunityScore.tsx`
- `src/components/task-form/NextActionCard.tsx`
- `src/components/task-form/MobileStickyFooter.tsx`
- `src/components/task-form/useFieldVisitForm.ts` — hook que encapsula state + submit reusando as mesmas funções do CreateTask original (extraídas, não reimplementadas)

**Editados:**
- `src/pages/CreateFieldVisit.tsx` — passa a renderizar `<FieldVisitForm />`

**Não tocar:**
- `src/pages/CreateTask.tsx` (continua servindo Call e Workshop)
- `src/pages/CreateCall.tsx`
- qualquer hook de dados, mapper, RPC, migration

## Detalhes técnicos

- Usar tokens semânticos do design system (`bg-card`, `text-primary`, `border-border`, etc.) — zero cor hardcoded.
- Mobile-first: header colapsável, tabs scrolláveis horizontalmente, sticky footer com ação primária.
- Reutilizar `PhotoUpload`, `CheckInLocation`, `OfflineIndicator` existentes.
- Separar peças/serviços filtrando `predefinedProducts` por `category` — o array unificado de `ProductType[]` no `task.checklist` continua igual no banco.
- `useFieldVisitForm.ts` extrai do `CreateTask.tsx` apenas o subset usado por field-visit (sem duplicar lógica de call/workshop). Para evitar divergência, na 1ª iteração esse hook **importa funções utilitárias** do CreateTask atual onde possível; refatoração mais profunda fica para etapa futura.

## Validação após implementar

1. `/create-field-visit` abre o novo layout.
2. Criar visita nova preenchendo todos os campos → salva igual ao fluxo atual (mesma row em `tasks`).
3. Editar visita existente → carrega dados corretamente, salva sem perda.
4. Fluxo offline continua funcionando (`saveTaskOffline`).
5. `/create-call` e `/create-workshop-checklist` continuam exatamente como antes.
6. Mobile (375px): header, cards, tabs e footer sticky usáveis sem scroll horizontal.

## Próximas etapas (fora deste plano)

- Aplicar mesma estrutura à tela Ligação reusando os componentes de `task-form/`.
- Criar tela Visita Técnica reusando os mesmos componentes.
- Eventualmente aposentar `CreateTask.tsx` monolítico.

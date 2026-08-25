# Meu Dia — Auditoria e Proposta (nada implementado ainda)

## 1. Auditoria das fontes atuais

| Domínio | Tabela | RPC/Hook atual | Campo de data | Campo de usuário | Status | Concluído x Pendente |
|---|---|---|---|---|---|---|
| Visitas realizadas | `tasks` (`task_type='visita'`, `technical_visit`) + espelho em `task_followups` (`activity_type='visita'`) | `get_task_type_counts`, `get_activity_metrics_v2`, `useTasksOptimized`, `useFollowups` | `tasks.start_date` / `task_followups.activity_date` | `tasks.created_by` / `task_followups.responsible_user_id` | `tasks.status` só tem `pending` e `closed` | Realizado = existe registro da atividade na data (tarefa criada). `tasks.status` **não** é confiável como "conclusão" (11.023 ligações "pending") |
| Ligações / prospecções | `tasks` (`task_type='ligacao'` 13.074, `prospection` 1.827) + `task_followups.activity_type='ligacao'` | `get_activity_metrics_v2`, `useTasks` | `tasks.start_date`, `created_at` | `tasks.created_by` | idem | Realizado = registro criado no dia |
| Programação de visitas | `visit_schedules` | `useVisitSchedules` (SELECT direto, limit 2000) | `planned_date`, `realized_at` | `seller_id` | `planejado / realizado / nao_realizado / reagendado` | Pendente = `status='planejado'`; concluída = `realizado` com `realized_task_id`; atrasada = `planejado` e `planned_date < hoje` |
| Retornos de clientes | `task_followups` | `useFollowupsProspectsOnly` (`src/components/crm/Returns.tsx`) | `next_return_date` (fallback `activity_date`) | `responsible_user_id` | `pendente / concluido / cancelado / reagendado` | Retorno em aberto = `followup_status='pendente'` **e** `next_return_date` preenchida |
| Treinamentos | `trainings` | `useTrainings`, `get_trainings_stats`, `get_training_goal` | `training_date` + `training_time` | `user_id` | `pendente / realizado / nao_realizado` | Pendente = `status='pendente'` |
| Atividades abertas | `tasks` | `get_secure_tasks_paginated` / `useTasksOptimized` | `start_date`, `end_date`, `next_action_date` | `created_by` | `pending / closed` | Aberta = `status='pending'`; vencida = `pending` e `end_date < hoje` |

Achados importantes:
- Não existe hoje **nenhuma** regra de meta de visitas/ligações no banco ou no frontend. A única meta existente é de treinamentos (`training_goal_settings`).
- `tasks.status` não é usado operacionalmente como conclusão; por isso a definição de "realizado" abaixo usa a existência do registro.
- `visit_schedules` já tem ciclo completo de conclusão — o Meu Dia apenas lê, não cria controle paralelo.

### CPA e CSA — auditoria da meta (precisa da sua confirmação)
- No banco, `cpa` e `csa` têm **paridade de permissões com `rac`**, mas isso é permissão, não meta.
- Volume atual de atividades por cargo indica perfis operacionais equivalentes a RAC (atendimento de balcão/pós-venda), não a consultor de campo.
- Por isso **não vou assumir meta**. Preciso que você confirme uma das opções:
  - (A) CPA/CSA = mesma meta de RAC (3 visitas/dia, seg–sex);
  - (B) CPA/CSA = meta de Consultor (3 visitas/semana + 3 ligações/dia);
  - (C) CPA/CSA sem meta nesta etapa (painel mostra pendências, sem barra de meta).
- Igualmente, **RAC não possui hoje nenhuma meta de ligações** no sistema. Não criarei meta de ligações para RAC sem sua confirmação; no painel do RAC o bloco de ligações apareceria apenas como contador informativo (sem "faltam X").

## 2. Regras exatas de cálculo das metas

- **Consultor de vendas** (`sales_consultant`, `consultant`, `technical_consultant`):
  - Visitas: meta 3 por **semana** (segunda 00:00 a domingo 23:59, hora local do usuário/UTC-3). `faltam = max(0, 3 - realizadas_semana)`.
  - Ligações/prospecções: meta 3 por **dia**. `faltam = max(0, 3 - realizadas_hoje)`.
- **RAC** (e CPA/CSA conforme sua confirmação): visitas meta 3 por **dia**, contada apenas seg–sex. Sábado/domingo → meta 0, painel mostra "sem meta hoje". Ligações: contador informativo, sem meta.
- Metas ficam em constantes no banco (função imutável `get_personal_goals(role)`), não hardcoded no frontend, para permitir ajuste futuro sem deploy.

## 3. Definição de "realizado"
- **Visita realizada** = registro em `tasks` com `task_type IN ('visita','technical_visit')`, `created_by = usuário`, `start_date` dentro do período.
- **Ligação/prospecção realizada** = registro em `tasks` com `task_type IN ('ligacao','prospection')`, `created_by = usuário`, `start_date = hoje`.
- Sem alteração de nenhum status; a contagem é derivada, não gravada.

## 4. Visita programada — pendente x concluída
- Pendente: `visit_schedules.status='planejado'` e `planned_date = hoje`.
- Atrasada: `status='planejado'` e `planned_date < hoje`.
- Próximas: `status='planejado'` e `planned_date > hoje` (janela de 7 dias).
- Concluída: `status IN ('realizado','nao_realizado','reagendado')` → sai automaticamente do Meu Dia, pois o filtro é sempre `planejado`.

## 5. Retorno vencido / hoje / próximo
Base: `task_followups` com `responsible_user_id = usuário`, `followup_status='pendente'`, `next_return_date NOT NULL`.
- Vencido: `next_return_date < hoje`; Hoje: `= hoje`; Próximo: `> hoje` (7 dias).

## 6. Treinamento pendente
`trainings` com `user_id = usuário` e `status='pendente'`: hoje (`training_date = hoje`), atrasado (`< hoje`), próximos (30 dias). Exibe data, horário, nome e horas. Somente leitura.

## 7. Atividade aberta
`tasks` com `created_by = usuário` e `status='pending'`: vencida (`end_date < hoje`), hoje (`hoje` entre `start_date` e `end_date`), próximas (`start_date` nos próximos 7 dias).

## 8. Proposta visual

```text
MEU DIA · terça, 25 de agosto            [Atualizar]
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Visitas  │ Ligações │ Retornos │ Treinam. │ Ativid.  │
│ 2 / 3 🟡 │ 1 / 3 🟡 │   4 🔴   │   1 🟡   │  6 🔴    │
└──────────┴──────────┴──────────┴──────────┴──────────┘
🔴 ATRASADO   4 retornos · 2 visitas programadas · 3 atividades
🟡 HOJE       1 visita programada · faltam 2 ligações · 1 treinamento 14:00
🟢 PRÓXIMOS   3 visitas · 2 retornos · 1 treinamento
```
- Três faixas (Atrasado / Hoje / Próximos), cada uma com no máximo 5 linhas e link "Ver todos".
- Mobile: KPIs em grade 2 colunas com scroll horizontal; faixas empilhadas em accordion, "Atrasado" aberto por padrão.
- Cores via tokens semânticos existentes (destructive / warning / success), sem cores hardcoded.

## 9. RPCs necessárias
- `get_my_day_summary()` — **uma única** RPC `SECURITY DEFINER STABLE`, sem parâmetros, retorna `jsonb` com: cargo detectado, metas aplicáveis, realizados (visitas dia/semana, ligações dia), contagens de pendências por bucket e um preview de até 5 itens por bloco.
- `get_my_day_details(p_block text, p_bucket text, p_limit int, p_offset int)` — drill-down sob demanda quando o usuário expande um bloco.
- Nenhuma RPC existente é alterada. Nenhuma tabela nova. Nenhum dado alterado.

## 10. Arquivos frontend envolvidos
- Novo: `src/pages/MyDay.tsx`, `src/hooks/useMyDay.ts`, `src/components/myday/*` (KPIs, faixa de prioridade, lista de bloco).
- Alterados: `src/App.tsx` (rota `/meu-dia`), `src/components/Layout.tsx` (item de menu "Meu Dia").
- Reuso de navegação: Retornos → `/crm?tab=retornos`; Treinamentos → `/crm?tab=treinamentos`; Programação → `/crm?tab=visitas`; Atividades → `/dashboard` (aba Tarefas).

## 11. Impacto de performance
- Abertura do painel: **1 query** (a RPC de resumo), `staleTime` 5 min, `refetchOnWindowFocus: false` — alinhado ao padrão do projeto.
- Todas as agregações usam índices já existentes por usuário/data; onde faltar, valido com `EXPLAIN ANALYZE` antes de criar índice. Meta: < 300 ms.
- Detalhes só carregam ao expandir bloco.

## 12. Riscos
- "Realizado" derivado da criação da tarefa pode divergir de conclusão real, já que `tasks.status` não é operacional hoje. Se você quiser conclusão explícita, isso exigiria mudança de fluxo (fora desta etapa).
- Metas de CPA/CSA e ligações de RAC pendentes de sua definição (bloqueia parte do painel).
- Semana seg–dom e fuso UTC-3 precisam ser confirmados.

## 13. Localização recomendada
Recomendo: **manter `/` como está** e adicionar "Meu Dia" como **primeiro item do menu lateral**, com redirecionamento automático para `/meu-dia` **apenas** para perfis operacionais (consultor, RAC, CPA, CSA) no primeiro acesso da sessão. Motivos: não altera o login de gerentes/admins, custa 1 query no boot para quem usa, e no celular vira a tela de entrada natural sem travar o carregamento inicial.

## 14. Confirmação
Nenhuma funcionalidade atual é substituída ou duplicada: Retornos, Treinamentos, Programação de Visitas e Tarefas continuam sendo os únicos pontos de criação/edição. O Meu Dia é somente leitura e navegação.

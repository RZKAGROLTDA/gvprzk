# Meu Dia — separar "Hoje" de "Pendência acumulada da semana"

## 1. Como funciona hoje

Fonte de dados (nada além disso alimenta a tela):

- `get_my_day_summary()` → `my_day_context()` + `my_day_summary_build(user, role)` (Minha visão)
- `get_my_day_user_summary(user)` → mesmo `my_day_summary_build` (detalhe de colaborador)
- `get_my_day_team_summary(filial, role, user)` (Minha equipe)
- `get_my_day_details` / `get_my_day_user_details` (modal "Ver todos")

Metas vêm de `activity_goal_settings` (por cargo):

| Cargo | Visitas | Ligações |
|---|---|---|
| consultant / sales_consultant / technical_consultant | 3 **semanal** | 3 **diária** |
| rac / cpa / csa | 3 **diária** (só dias úteis) | sem meta |

Cálculo atual de realizado:

- Visitas: se meta é `weekly` conta `tasks` (`visita`, `technical_visit`) de `week_start` até hoje; se `daily`, conta só hoje.
- Ligações: conta `tasks` (`ligacao`, `prospection`) **só de hoje**.
- Meta exibida: `target_value`, virando 0 no fim de semana quando `weekdays_only`.

Consequência: hoje existe **um só par realizado/meta** por atividade — ora do dia, ora da semana. Não há visão de déficit acumulado, e no caso semanal o número "do dia" não existe.

As demais pendências (visitas atrasadas, retornos atrasados, treinamentos pendentes, próximas ações atrasadas) já são acumulativas por data (`< hoje`) e não dependem de semana/mês — **nada muda nelas**.

## 2. O que precisa mudar

Passar a expor, para Visitas e Ligações, quatro números em vez de dois:

- `realizado_hoje` / `meta_hoje`
- `realizado_semana` / `meta_acumulada_semana` → `pendencia_semana`

Nenhuma outra regra, filtro, escopo de cargo/filial ou bloco de pendências é alterada.

## 3. Banco/RPC ou frontend?

Precisa de **RPC** (sem nenhuma mudança estrutural): os dados já existem em `tasks` e `activity_goal_settings`, não há tabela nova, coluna nova nem trigger. A alteração é `CREATE OR REPLACE` em duas funções:

- `my_day_summary_build` → acrescenta os campos novos em `goals.visitas` / `goals.ligacoes` (usada por Minha visão e pelo detalhe do colaborador)
- `get_my_day_team_summary` → acrescenta 4 colunas por linha da tabela de equipe

Campos atuais (`meta`, `realizado`, `faltam`, `atingida`, `period_type`, ...) são **mantidos** para não quebrar nada; os novos são aditivos.

Frontend (apenas apresentação):

- `src/lib/myDay.ts`: novos campos nos tipos `MyDayGoal` e `MyDayTeamRow`.
- `src/components/myday/ExecutionCards.tsx`: cada card ganha linha "Hoje: x/y" e linha "Pendência da semana: N", com rótulo explícito de DIA vs ACUMULADO.
- `src/components/myday/TeamOverview.tsx`: colunas compactas — "Visitas hoje" (`2/3`), "Ligações hoje" (`1/3`), "Pend. semana" com dois valores (V / L) em uma única coluna para não alargar a tabela; demais colunas inalteradas. No mobile continua em cards.
- `src/components/myday/TeamFilters.tsx` / `UserDayDialog.tsx`: sem mudança de regra.

## 4. Regra de cálculo da pendência semanal

Janela de acumulação:

```text
inicio_janela = MAIOR(week_start, primeiro_dia_do_mes_de_hoje)
```

Esse `MAIOR(...)` é exatamente o "zerar na virada do mês": na semana que cruza o mês, o cálculo passa a contar do dia 1º. Nenhum registro é apagado — só a janela do cálculo muda.

Meta acumulada até hoje:

- meta **diária**: `target × nº de dias contados entre inicio_janela e hoje`, onde os dias contados excluem sábado/domingo quando `weekdays_only = true`.
- meta **semanal** (visitas do consultor): meta cheia da semana, `target`, sem rateio por dia — a semana toda é o período.

Realizado da semana: `count(tasks)` do tipo correspondente com `start_date` entre `inicio_janela` e hoje (mesmos `task_type` já usados hoje).

Pendência:

```text
pendencia_semana = MAIOR(0, meta_acumulada_semana - realizado_semana)
```

Assim o que não foi feito num dia continua aparecendo nos dias seguintes da mesma semana, a pendência reinicia na segunda-feira e reinicia também no dia 1º de cada mês. Quem não tem meta configurada (ex.: ligações de RAC/CPA/CSA) segue com `null` e a UI mostra "sem meta".

## 5. Ordem de execução

1. Migration `CREATE OR REPLACE` das duas funções (nada destrutivo, sem DDL de tabela).
2. Ajuste de tipos e dos 2 componentes de apresentação.
3. Validação: comparar realizado/meta de hoje antes e depois (devem ser idênticos) e conferir pendência semanal de um consultor e de um RAC.

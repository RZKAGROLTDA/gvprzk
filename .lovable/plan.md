# Metas Operacionais — Modelagem (nada aplicado ainda)

Escopo desta etapa: **apenas** a fonte única de metas de visitas e ligações. O painel "Meu Dia" não será implementado agora. Treinamentos continuam em `trainings` / `training_goal_settings` — fora desta tabela.

## 1. Modelagem final da tabela

```sql
CREATE TYPE public.goal_period_type AS ENUM ('daily', 'weekly');
CREATE TYPE public.goal_activity_type AS ENUM ('visita', 'ligacao');

CREATE TABLE public.activity_goal_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          public.app_role NOT NULL,
  activity_type public.goal_activity_type NOT NULL,
  target_value  integer NOT NULL DEFAULT 0,
  period_type   public.goal_period_type NOT NULL,
  weekdays_only boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_goal_settings_role_activity_uniq UNIQUE (role, activity_type)
);
```

Decisões:
- `role` usa o enum existente `public.app_role` — impede cargo inválido e já contempla `cpa`/`csa`.
- Enums próprios para `activity_type` e `period_type` em vez de texto livre, evitando valores divergentes.
- `UNIQUE (role, activity_type)` garante uma única meta vigente por cargo/atividade; alterar meta é `UPDATE target_value` — **sem migration**.
- `target_value` validado por trigger (`>= 0`), não por CHECK, seguindo o padrão do projeto.
- Trigger `update_updated_at_column()` já existente para `updated_at`.
- `weekdays_only` só tem efeito quando `period_type = 'daily'`; validação por trigger.
- `ligacao` cobre ligações **e** prospecções (o painel somará `task_type IN ('ligacao','prospection')`).

## 2. RLS proposta

```sql
GRANT SELECT ON public.activity_goal_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.activity_goal_settings TO authenticated; -- filtrado por policy
GRANT ALL ON public.activity_goal_settings TO service_role;
-- nenhum GRANT para anon

ALTER TABLE public.activity_goal_settings ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário aprovado e ativo
CREATE POLICY activity_goal_settings_select ON public.activity_goal_settings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = (SELECT auth.uid())
    AND p.approval_status = 'approved'
    AND p.employment_status = 'active'
));

-- Escrita: somente admin/manager
CREATE POLICY activity_goal_settings_insert ON public.activity_goal_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'manager'));

CREATE POLICY activity_goal_settings_update ON public.activity_goal_settings
FOR UPDATE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'manager'))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'manager'));

CREATE POLICY activity_goal_settings_delete ON public.activity_goal_settings
FOR DELETE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'));
```

- Padrão `(SELECT auth.uid())` (InitPlan), igual ao aplicado na otimização de RLS anterior.
- Nenhum acesso `anon`. Nenhuma permissão existente de outra tabela é tocada.

## 3. Registros iniciais

| role | activity_type | target_value | period_type | weekdays_only | active |
|---|---|---|---|---|---|
| `sales_consultant` | visita | 3 | weekly | false | true |
| `sales_consultant` | ligacao | 3 | daily | false | true |
| `rac` | visita | 3 | daily | true | true |

- `consultant` e `technical_consultant`: **não** serão criados agora (você não os citou). Sem registro, o painel exibe "sem meta definida".
- `cpa` / `csa`: nenhum registro, conforme sua instrução.
- `rac` + `ligacao`: nenhum registro — RAC segue sem meta de ligações até sua confirmação.

## 4. Como o painel calculará realizado x meta

Leitura da meta por cargo primário do usuário (`user_roles`, mesma prioridade já usada em `useUserRole`), buscando o registro `active = true`.

- Realizado de visitas = contagem em `tasks` com `created_by = usuário` e `task_type IN ('visita','technical_visit')` no período da meta.
- Realizado de ligações = contagem em `tasks` com `created_by = usuário` e `task_type IN ('ligacao','prospection')` no dia.
- Campo de data usado: `start_date`.
- `faltam = GREATEST(0, target_value - realizado)`; `atingida = realizado >= target_value`.
- Se não houver registro de meta para o cargo/atividade → painel mostra apenas o realizado, sem barra de meta.
- Nada é gravado: o realizado é sempre derivado por leitura.

## 5. Cálculo da semana

- Semana **segunda a domingo**, calculada em `America/Sao_Paulo` (`date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')` — o `date_trunc` do Postgres já usa segunda como início).
- `period_type = 'weekly'` → janela = início da semana até hoje inclusive.
- `period_type = 'daily'` → janela = o dia corrente local.

## 6. Feriados e finais de semana

- `weekdays_only = true`: se hoje for sábado ou domingo, a meta do dia é **0** e o painel exibe "sem meta hoje" (não gera atraso nem zera o realizado).
- Feriados: **não** serão tratados nesta etapa — não existe calendário de feriados no banco. Se você quiser depois, a extensão natural é uma tabela `public.holidays` consultada pela mesma regra do `weekdays_only`, sem alterar `activity_goal_settings`.
- Metas semanais não são afetadas por fim de semana: a semana inteira conta.

## 7. Configuração futura de CPA e CSA

Duas rotas, ambas sem migration:
1. **Meta própria:** inserir registros com `role = 'cpa'` / `'csa'` e os valores desejados.
2. **Herdar de RAC:** deixar sem registro; o painel aplicará o fallback opcional "cargos equivalentes a RAC herdam a meta de `rac`" — só ativo se você aprovar essa herança. Sem sua aprovação, ausência de registro = sem meta.

A decisão é de configuração/dados, não de estrutura.

## 8. Confirmação de não impacto

A migration proposta apenas cria dois enums, uma tabela nova, triggers de validação e políticas dessa tabela. Nenhum `UPDATE`/`DELETE` em `tasks`, `task_followups`, `visit_schedules`, `trainings`, `products` ou qualquer outra tabela. Nenhuma função, RPC, policy ou permissão existente é alterada. Nenhuma tarefa, visita, retorno ou treinamento existente é modificado. Treinamentos continuam usando `training_goal_settings` / `get_training_goal()`.

## Pendências para você decidir antes de aplicar
1. Criar meta também para `consultant` e `technical_consultant` (mesma regra de `sales_consultant`)?
2. Semana segunda a domingo está correta?
3. Autorizar o fallback "CPA/CSA herdam RAC" ou manter sem meta até definição explícita?

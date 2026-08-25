# Etapa 1 — Estrutura configurável de metas (SQL para aprovação)

Escopo: apenas enums, tabela `public.activity_goal_settings`, triggers, RLS, índices e registros iniciais.
Não cria `get_my_day_summary()`. Não cria frontend. Nenhum dado existente é alterado.

## SQL — estrutura (migration)

```sql
-- 1) ENUMS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'goal_period_type') THEN
    CREATE TYPE public.goal_period_type AS ENUM ('daily', 'weekly');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'goal_activity_type') THEN
    CREATE TYPE public.goal_activity_type AS ENUM ('visita', 'ligacao');
  END IF;
END $$;

-- 2) TABELA
CREATE TABLE IF NOT EXISTS public.activity_goal_settings (
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

-- 3) GRANTS (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_goal_settings TO authenticated;
GRANT ALL ON public.activity_goal_settings TO service_role;
-- nenhum GRANT para anon

-- 4) RLS
ALTER TABLE public.activity_goal_settings ENABLE ROW LEVEL SECURITY;

-- Leitura: usuário autenticado, aprovado e ativo
CREATE POLICY activity_goal_settings_select
ON public.activity_goal_settings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  )
);

-- Criação: admin/manager
CREATE POLICY activity_goal_settings_insert
ON public.activity_goal_settings
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
);

-- Edição: admin/manager
CREATE POLICY activity_goal_settings_update
ON public.activity_goal_settings
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
);

-- Exclusão: apenas admin
CREATE POLICY activity_goal_settings_delete
ON public.activity_goal_settings
FOR DELETE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));

-- 5) TRIGGERS
-- 5.1 updated_at (função já existente no projeto)
DROP TRIGGER IF EXISTS trg_activity_goal_settings_updated_at ON public.activity_goal_settings;
CREATE TRIGGER trg_activity_goal_settings_updated_at
BEFORE UPDATE ON public.activity_goal_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5.2 Validação de regras de negócio (sem CHECK constraint, conforme padrão do projeto)
CREATE OR REPLACE FUNCTION public.validate_activity_goal_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.target_value < 0 THEN
    RAISE EXCEPTION 'target_value não pode ser negativo (recebido: %)', NEW.target_value;
  END IF;

  IF NEW.target_value > 100 THEN
    RAISE EXCEPTION 'target_value acima do limite razoável (recebido: %)', NEW.target_value;
  END IF;

  -- weekdays_only só faz sentido em meta diária
  IF NEW.period_type = 'weekly' AND NEW.weekdays_only THEN
    RAISE EXCEPTION 'weekdays_only só é aplicável quando period_type = daily';
  END IF;

  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_goal_settings_validate ON public.activity_goal_settings;
CREATE TRIGGER trg_activity_goal_settings_validate
BEFORE INSERT OR UPDATE ON public.activity_goal_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_activity_goal_settings();

-- 6) ÍNDICES
-- A UNIQUE (role, activity_type) já cobre a busca do Meu Dia (por cargo, opcionalmente por atividade).
-- Índice parcial adicional apenas para leitura das metas vigentes:
CREATE INDEX IF NOT EXISTS idx_activity_goal_settings_active
  ON public.activity_goal_settings (role, activity_type)
  WHERE active;
```

## SQL — registros iniciais (executados como dados, após a estrutura)

```sql
INSERT INTO public.activity_goal_settings
  (role, activity_type, target_value, period_type, weekdays_only, active, notes)
VALUES
  ('sales_consultant',      'visita',  3, 'weekly', false, true, 'Meta inicial'),
  ('sales_consultant',      'ligacao', 3, 'daily',  false, true, 'Meta inicial'),
  ('consultant',            'visita',  3, 'weekly', false, true, 'Meta inicial'),
  ('consultant',            'ligacao', 3, 'daily',  false, true, 'Meta inicial'),
  ('technical_consultant',  'visita',  3, 'weekly', false, true, 'Meta inicial'),
  ('technical_consultant',  'ligacao', 3, 'daily',  false, true, 'Meta inicial'),
  ('rac',                   'visita',  3, 'daily',  true,  true, 'Meta inicial — seg a sex'),
  ('cpa',                   'visita',  3, 'daily',  true,  true, 'Meta inicial — seg a sex'),
  ('csa',                   'visita',  3, 'daily',  true,  true, 'Meta inicial — seg a sex')
ON CONFLICT (role, activity_type) DO NOTHING;
```

Nenhum registro de `ligacao` para `rac`, `cpa`, `csa` — nesses cargos o Meu Dia mostrará o realizado de ligações apenas como informação, sem meta nem faltante.

## Garantia de configurabilidade (item 4)

- Nenhuma meta é escrita em código: a futura `get_my_day_summary()` fará `SELECT target_value, period_type, weekdays_only FROM public.activity_goal_settings WHERE role = <cargo> AND active`.
- Mudar 3 → 4 visitas será:
  `UPDATE public.activity_goal_settings SET target_value = 4 WHERE role = 'rac' AND activity_type = 'visita';`
  Sem migration de função e sem deploy de frontend.
- Cargo sem registro (ou `active = false`) = sem meta: o painel exibe apenas o realizado.
- Semana confirmada: segunda a domingo, `America/Sao_Paulo` (será aplicada dentro da RPC na Etapa 2, não nesta migration).

## Confirmações

- Nenhuma tabela existente é alterada; nenhuma policy, função ou permissão atual é modificada.
- Nenhuma tarefa, visita, retorno ou treinamento é copiado, movido ou alterado.
- Treinamentos continuam em `trainings` / `training_goal_settings`.
- `anon` não recebe nenhum acesso.

## Validações após aplicar

1. Listar as 9 linhas inseridas.
2. Confirmar RLS: leitura OK para usuário aprovado/ativo; bloqueada para pendente/inativo.
3. Confirmar que `UPDATE` falha para consultor e passa para admin/manager.
4. Testar as validações do trigger: `target_value = -1` e `period_type = 'weekly'` com `weekdays_only = true` devem falhar.
5. Simular alteração de meta (3 → 4 e volta a 3) para provar configurabilidade sem migration.

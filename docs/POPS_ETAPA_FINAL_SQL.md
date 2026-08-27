# POPS V1 — SQL simples para revisão (NÃO APLICADO)

Escopo: execução direta em `pops_machines`, 1 RPC de conclusão, 1 RPC de meta,
ajuste mínimo na listagem de máquinas da carteira. Sem tabela de execução,
sem offered services, sem estorno, sem `started_by/started_at`.

## 1. ALTER TABLE de pops_machines

```sql
ALTER TABLE public.pops_machines
  ADD COLUMN final_service_id uuid REFERENCES public.pops_services(id) ON DELETE RESTRICT,
  ADD COLUMN os_number        text,
  ADD COLUMN executed_by      uuid,
  ADD COLUMN executed_at      timestamptz;
```

## 2. Constraints e índices

```sql
-- Formato/tamanho da OS quando informada (letras, números, barra, ponto, hífen)
ALTER TABLE public.pops_machines
  ADD CONSTRAINT pops_machines_os_format CHECK (
    os_number IS NULL
    OR (char_length(btrim(os_number)) BETWEEN 1 AND 40
        AND btrim(os_number) ~ '^[A-Za-z0-9/._-]+$')
  );

-- Coerência do status: 'servicada' exige serviço final, OS, executor e data
ALTER TABLE public.pops_machines
  ADD CONSTRAINT pops_machines_servicada_complete CHECK (
    status <> 'servicada'
    OR (final_service_id IS NOT NULL
        AND os_number IS NOT NULL AND btrim(os_number) <> ''
        AND executed_by IS NOT NULL
        AND executed_at IS NOT NULL)
  );

-- OS única dentro do programa (case-insensitive, com trim)
CREATE UNIQUE INDEX pops_machines_os_unique_per_program
  ON public.pops_machines (program_id, upper(btrim(os_number)))
  WHERE os_number IS NOT NULL;

-- Índices de leitura para a meta e a carteira
CREATE INDEX IF NOT EXISTS pops_machines_program_status ON public.pops_machines (program_id, status);
CREATE INDEX IF NOT EXISTS pops_machines_filial_status  ON public.pops_machines (pops_filial_id, status);
CREATE INDEX IF NOT EXISTS pops_machines_exec           ON public.pops_machines (program_id, executed_at)
  WHERE status = 'servicada';
CREATE INDEX IF NOT EXISTS pops_machines_executor       ON public.pops_machines (executed_by, executed_at)
  WHERE status = 'servicada';
```

Como `pops_machines` tem uma linha por máquina, isso garante por construção:
**1 máquina = no máximo 1 serviço final = 1 OS = 1 realizado.**

## 3. pops_complete_machine

```sql
CREATE OR REPLACE FUNCTION public.pops_complete_machine(
  p_machine_id uuid,
  p_service_id uuid,
  p_os_number  text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid  := (v_scope ->> 'filial_id')::uuid;
  v_can    boolean := false;
  v_os     text;
  m        record;
  v_name   text;
  v_svc    text;
BEGIN
  IF v_uid IS NULL OR v_kind = 'none' THEN
    RAISE EXCEPTION 'Acesso negado ao POPS' USING ERRCODE = '42501';
  END IF;

  v_os := btrim(coalesce(p_os_number, ''));
  IF v_os = '' THEN RAISE EXCEPTION 'Informe o numero da OS'; END IF;
  IF char_length(v_os) > 40 THEN RAISE EXCEPTION 'Numero da OS excede 40 caracteres'; END IF;
  IF v_os !~ '^[A-Za-z0-9/._-]+$' THEN
    RAISE EXCEPTION 'Numero da OS invalido: use letras, numeros, barra, ponto ou hifen';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pops_services s WHERE s.id = p_service_id AND s.active) THEN
    RAISE EXCEPTION 'Servico invalido ou inativo';
  END IF;

  -- trava a maquina para impedir duas conclusoes simultaneas
  SELECT m2.* INTO m FROM public.pops_machines m2 WHERE m2.id = p_machine_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Maquina POPS nao encontrada'; END IF;
  IF NOT m.active THEN RAISE EXCEPTION 'Maquina inativa no POPS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pops_programs pr WHERE pr.id = m.program_id AND pr.active) THEN
    RAISE EXCEPTION 'Programa POPS inativo';
  END IF;

  -- permissao: manager/admin global; rac/cpa/csa apenas propria filial; supervisor somente consulta
  IF public.pops_is_manager() THEN
    v_can := true;
  ELSIF (public.has_role(v_uid,'rac') OR public.has_role(v_uid,'cpa') OR public.has_role(v_uid,'csa'))
        AND m.pops_filial_id IS NOT NULL AND m.pops_filial_id = v_filial THEN
    v_can := true;
  END IF;

  IF NOT v_can THEN
    RAISE EXCEPTION 'Sem permissao para concluir esta maquina' USING ERRCODE = '42501';
  END IF;

  IF m.status = 'servicada' THEN
    SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = m.executed_by;
    RAISE EXCEPTION 'Maquina ja concluida (OS %, por %, em %)',
      m.os_number, coalesce(v_name, 'outro usuario'),
      to_char(m.executed_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pops_machines o
     WHERE o.program_id = m.program_id
       AND o.id <> m.id
       AND o.os_number IS NOT NULL
       AND upper(btrim(o.os_number)) = upper(v_os)
  ) THEN
    RAISE EXCEPTION 'A OS % ja esta registrada em outra maquina deste programa', v_os;
  END IF;

  BEGIN
    UPDATE public.pops_machines
       SET final_service_id = p_service_id,
           os_number        = v_os,
           executed_by      = v_uid,
           executed_at      = now(),
           status           = 'servicada',
           last_activity_at = now()
     WHERE id = m.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A OS % ja esta registrada em outra maquina deste programa', v_os;
  END;

  SELECT s.name INTO v_svc FROM public.pops_services s WHERE s.id = p_service_id;
  SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = v_uid;

  RETURN jsonb_build_object(
    'pops_machine_id', m.id,
    'status', 'servicada',
    'final_service_id', p_service_id,
    'final_service_name', v_svc,
    'os_number', v_os,
    'executed_by', v_uid,
    'executed_by_name', v_name,
    'executed_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.pops_complete_machine(uuid,uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_complete_machine(uuid,uuid,text) TO authenticated;
```

## 4. pops_goal_summary

```sql
CREATE OR REPLACE FUNCTION public.pops_goal_summary(
  p_program_id uuid,
  p_filial_id  uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid;
  v_tz     text := 'America/Sao_Paulo';
  v_d0     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_wk     date;
  v_mo     date;
  v_goal   int;
  v_universe int; v_serviced int; v_pending int;
  v_today int; v_week int; v_month int;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;

  -- manager/admin: global ou filial escolhida; demais cargos: sempre a propria filial
  v_filial := CASE WHEN v_kind = 'global' THEN p_filial_id ELSE (v_scope ->> 'filial_id')::uuid END;
  v_wk := v_d0 - (extract(isodow from v_d0)::int - 1);   -- segunda-feira
  v_mo := date_trunc('month', v_d0)::date;

  SELECT pr.goal_machines INTO v_goal FROM public.pops_programs pr WHERE pr.id = p_program_id;
  IF v_goal IS NULL THEN RAISE EXCEPTION 'Programa POPS nao encontrado'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE m.status = 'servicada')::int,
         count(*) FILTER (WHERE m.status <> 'servicada')::int,
         count(*) FILTER (WHERE m.status = 'servicada'
                            AND (m.executed_at AT TIME ZONE v_tz)::date = v_d0)::int,
         count(*) FILTER (WHERE m.status = 'servicada'
                            AND (m.executed_at AT TIME ZONE v_tz)::date >= v_wk)::int,
         count(*) FILTER (WHERE m.status = 'servicada'
                            AND (m.executed_at AT TIME ZONE v_tz)::date >= v_mo)::int
    INTO v_universe, v_serviced, v_pending, v_today, v_week, v_month
    FROM public.pops_machines m
   WHERE m.program_id = p_program_id
     AND m.active
     AND (v_filial IS NULL OR m.pops_filial_id = v_filial);

  RETURN jsonb_build_object(
    'program_id', p_program_id,
    'scope', v_kind,
    'filial_id', v_filial,
    'goal', v_goal,
    'total_universe', v_universe,
    'serviced', v_serviced,
    'remaining', greatest(v_goal - v_serviced, 0),
    'attainment_percent', round((v_serviced::numeric / nullif(v_goal,0)) * 100, 1),
    'today', v_today,
    'this_week', v_week,
    'this_month', v_month,
    'pending', v_pending
  );
END $$;

REVOKE ALL ON FUNCTION public.pops_goal_summary(uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_goal_summary(uuid,uuid) TO authenticated;
```

Exemplo de retorno:

```json
{"program_id":"...","scope":"filial","filial_id":"...","goal":1000,"total_universe":412,
 "serviced":0,"remaining":1000,"attainment_percent":0.0,
 "today":0,"this_week":0,"this_month":0,"pending":412}
```

## 5. Ajuste mínimo de pops_portfolio_client_machines

Mesma assinatura, mesmas regras de escopo; apenas 5 campos novos no SELECT interno
(`final_service_id`, `final_service_name`, `os_number`, `executed_by`, `executed_by_name`,
`executed_at`):

```sql
CREATE OR REPLACE FUNCTION public.pops_portfolio_client_machines(p_program_id uuid, p_client_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid  := (v_scope ->> 'filial_id')::uuid;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pops_serial), '[]'::jsonb)
      FROM (
        SELECT m.id AS pops_machine_id, m.status, m.pops_serial, m.pops_model,
               m.pops_product_series, m.pops_manufacture_year, m.pops_platform,
               m.pops_client_name, m.pops_client_code, m.pops_dealer_location,
               m.pops_filial_id, f.nome AS filial_nome,
               m.link_status, m.equipment_id,
               e.serial_chassis AS parque_serial_chassis,
               e.model          AS parque_model,
               e.client_name    AS parque_client_name,
               e.client_code    AS parque_client_code,
               e.year           AS parque_year,
               e.hours          AS parque_hours,
               e.machine_type   AS parque_machine_type,
               m.final_service_id,
               s.name           AS final_service_name,
               m.os_number,
               m.executed_by,
               pr.name          AS executed_by_name,
               m.executed_at
          FROM public.pops_machines m
          LEFT JOIN public.filiais f ON f.id = m.pops_filial_id
          LEFT JOIN public.client_equipment e ON e.id = m.equipment_id
          LEFT JOIN public.pops_services s ON s.id = m.final_service_id
          LEFT JOIN public.profiles pr ON pr.user_id = m.executed_by
         WHERE m.program_id = p_program_id
           AND m.active
           AND m.client_key = p_client_key
           AND (v_kind = 'global' OR m.pops_filial_id = v_filial)
      ) t
  );
END $$;
```

`pops_portfolio_clients` permanece inalterada.

## 6. Impacto sobre as 5.077 máquinas

- A migration **não executa nenhum UPDATE/DELETE/INSERT** em `pops_machines`.
- As 4 colunas novas entram como `NULL` (adição de coluna nulável, sem rewrite de tabela).
- Os dois `CHECK` são satisfeitos pelas linhas atuais (todas em `foco`, colunas novas nulas),
  portanto a validação passa sem alterar dados.
- O índice único de OS é parcial (`WHERE os_number IS NOT NULL`) e hoje indexa 0 linhas.
- Nenhum trigger novo; `pops_machines_normalize`/`pops_machines_validate` seguem intactos.
- Nada de RAC atribuído, nada em `client_equipment`, nenhuma task, nenhum Meu Dia/CRM.

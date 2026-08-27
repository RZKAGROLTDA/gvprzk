# POPS — Etapa Final: SQL completo para revisão (NÃO APLICADO)

Ajustes incorporados: estorno auditável, execução ativa única via índice parcial,
`started_by/started_at`, validação de ofertados, meta ignorando estornos, `FOR UPDATE`.

```sql
-- =========================================================
-- 1. TABELA DE EXECUÇÃO (histórico completo, 1 ativa por máquina)
-- =========================================================
CREATE TABLE public.pops_machine_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        uuid NOT NULL REFERENCES public.pops_programs(id) ON DELETE RESTRICT,
  pops_machine_id   uuid NOT NULL REFERENCES public.pops_machines(id) ON DELETE RESTRICT,
  final_service_id  uuid NOT NULL REFERENCES public.pops_services(id) ON DELETE RESTRICT,
  os_number         text NOT NULL,
  os_number_norm    text GENERATED ALWAYS AS (upper(btrim(os_number))) STORED,
  executed_by       uuid NOT NULL,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  filial_id         uuid REFERENCES public.filiais(id),
  notes             text,
  voided_at         timestamptz,
  voided_by         uuid,
  void_reason       text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_exec_os_len   CHECK (char_length(btrim(os_number)) BETWEEN 1 AND 40),
  CONSTRAINT pops_exec_os_chars CHECK (btrim(os_number) ~ '^[A-Za-z0-9/._-]+$'),
  CONSTRAINT pops_exec_void_consistent CHECK (
    (voided_at IS NULL  AND voided_by IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL
        AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
  )
);

GRANT SELECT ON public.pops_machine_executions TO authenticated;
GRANT ALL    ON public.pops_machine_executions TO service_role;
ALTER TABLE public.pops_machine_executions ENABLE ROW LEVEL SECURITY;

-- Uma execução ATIVA por máquina; histórico de estornadas preservado.
CREATE UNIQUE INDEX pops_exec_one_active_per_machine
  ON public.pops_machine_executions (pops_machine_id) WHERE voided_at IS NULL;
-- OS única no programa entre as execuções ativas (OS de execução estornada é liberada).
CREATE UNIQUE INDEX pops_exec_os_unique_per_program
  ON public.pops_machine_executions (program_id, os_number_norm) WHERE voided_at IS NULL;

CREATE INDEX pops_exec_program_date  ON public.pops_machine_executions (program_id, executed_at) WHERE voided_at IS NULL;
CREATE INDEX pops_exec_executor_date ON public.pops_machine_executions (executed_by, executed_at) WHERE voided_at IS NULL;
CREATE INDEX pops_exec_filial_date   ON public.pops_machine_executions (filial_id, executed_at)  WHERE voided_at IS NULL;
CREATE INDEX pops_exec_service       ON public.pops_machine_executions (final_service_id)        WHERE voided_at IS NULL;
CREATE INDEX pops_exec_machine       ON public.pops_machine_executions (pops_machine_id);

CREATE TRIGGER trg_pops_exec_updated_at BEFORE UPDATE ON public.pops_machine_executions
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

CREATE POLICY pops_exec_select_scope ON public.pops_machine_executions
FOR SELECT TO authenticated
USING (
  CASE (public.pops_scope() ->> 'scope')
    WHEN 'global' THEN true
    ELSE filial_id IS NOT NULL AND filial_id = ((public.pops_scope() ->> 'filial_id'))::uuid
  END
);
-- Sem policies de INSERT/UPDATE/DELETE: escrita apenas via RPCs SECURITY DEFINER.

-- =========================================================
-- 2. SERVIÇOS AVALIADOS / OFERTADOS
-- =========================================================
CREATE TABLE public.pops_machine_offered_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pops_machine_id uuid NOT NULL REFERENCES public.pops_machines(id) ON DELETE RESTRICT,
  execution_id    uuid REFERENCES public.pops_machine_executions(id) ON DELETE RESTRICT,
  service_id      uuid NOT NULL REFERENCES public.pops_services(id) ON DELETE RESTRICT,
  filial_id       uuid REFERENCES public.filiais(id),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_offered_unique UNIQUE (pops_machine_id, service_id)
);

GRANT SELECT ON public.pops_machine_offered_services TO authenticated;
GRANT ALL    ON public.pops_machine_offered_services TO service_role;
ALTER TABLE public.pops_machine_offered_services ENABLE ROW LEVEL SECURITY;

CREATE INDEX pops_offered_machine ON public.pops_machine_offered_services (pops_machine_id);

CREATE POLICY pops_offered_select_scope ON public.pops_machine_offered_services
FOR SELECT TO authenticated
USING (
  CASE (public.pops_scope() ->> 'scope')
    WHEN 'global' THEN true
    ELSE filial_id IS NOT NULL AND filial_id = ((public.pops_scope() ->> 'filial_id'))::uuid
  END
);

-- =========================================================
-- 3. RASTREABILIDADE DE INÍCIO EM pops_machines
-- =========================================================
ALTER TABLE public.pops_machines
  ADD COLUMN started_by uuid,
  ADD COLUMN started_at timestamptz;

CREATE INDEX IF NOT EXISTS pops_machines_program_status ON public.pops_machines (program_id, status);
CREATE INDEX IF NOT EXISTS pops_machines_filial_status  ON public.pops_machines (pops_filial_id, status);

-- =========================================================
-- 4. PERMISSÃO DE EXECUÇÃO (por filial da máquina, nunca por carteira)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_can_execute_machine(p_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.pops_user_enabled() AND EXISTS (
    SELECT 1
      FROM public.pops_machines m
      JOIN public.pops_programs pr ON pr.id = m.program_id
     WHERE m.id = p_machine_id AND m.active AND pr.active
       AND (
         public.pops_is_manager()
         OR (
           m.pops_filial_id IS NOT NULL
           AND m.pops_filial_id = public.get_user_filial_id()
           AND (   public.has_role((SELECT auth.uid()),'rac')
                OR public.has_role((SELECT auth.uid()),'cpa')
                OR public.has_role((SELECT auth.uid()),'csa'))
         )
       )
  );
$$;

-- Corrige a função antiga que dependia de responsible_user_id
CREATE OR REPLACE FUNCTION public.pops_can_write_machine(p_pops_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.pops_can_execute_machine(p_pops_machine_id);
$$;

-- =========================================================
-- 5. GUARD DE STATUS (servicada exige execução ativa completa)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_machines_status_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'servicada' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pops_machine_executions e
       WHERE e.pops_machine_id = NEW.id
         AND e.voided_at IS NULL
         AND e.final_service_id IS NOT NULL
         AND btrim(coalesce(e.os_number,'')) <> ''
         AND e.executed_by IS NOT NULL
         AND e.executed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Status servicada exige execucao ativa com servico final, OS, executor e data';
    END IF;
  ELSIF OLD.status = 'servicada' THEN
    IF EXISTS (SELECT 1 FROM public.pops_machine_executions e
                WHERE e.pops_machine_id = NEW.id AND e.voided_at IS NULL) THEN
      RAISE EXCEPTION 'Estorne a execucao antes de alterar o status da maquina';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pops_machines_status_guard
BEFORE UPDATE OF status ON public.pops_machines
FOR EACH ROW EXECUTE FUNCTION public.pops_machines_status_guard();

-- =========================================================
-- 6. pops_start_machine
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_start_machine(p_machine_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); m record; v_name text;
BEGIN
  IF NOT public.pops_can_execute_machine(p_machine_id) THEN
    RAISE EXCEPTION 'Sem permissao para executar esta maquina POPS';
  END IF;

  SELECT * INTO m FROM public.pops_machines WHERE id = p_machine_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Maquina POPS nao encontrada'; END IF;

  IF m.status = 'servicada' THEN
    RAISE EXCEPTION 'Maquina ja servicada; nao pode ser reiniciada';
  END IF;

  IF m.status = 'em_andamento' THEN
    SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = m.started_by;
    RETURN jsonb_build_object('status','em_andamento','already_started',true,
      'started_by', m.started_by, 'started_by_name', v_name, 'started_at', m.started_at);
  END IF;

  UPDATE public.pops_machines
     SET status='em_andamento', started_by=v_uid, started_at=now(), last_activity_at=now()
   WHERE id = p_machine_id;

  RETURN jsonb_build_object('status','em_andamento','already_started',false,
    'started_by', v_uid, 'started_at', now());
END $$;

REVOKE ALL ON FUNCTION public.pops_start_machine(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_start_machine(uuid) TO authenticated;

-- =========================================================
-- 7. pops_complete_machine
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_complete_machine(
  p_machine_id uuid,
  p_final_service_id uuid,
  p_os_number text,
  p_offered_service_ids uuid[] DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  m record; ex record; v_os text; v_ids uuid[]; v_active int; v_exec_id uuid; v_name text;
BEGIN
  IF NOT public.pops_can_execute_machine(p_machine_id) THEN
    RAISE EXCEPTION 'Sem permissao para concluir esta maquina POPS';
  END IF;

  v_os := btrim(coalesce(p_os_number,''));
  IF v_os = '' THEN RAISE EXCEPTION 'Numero da OS e obrigatorio'; END IF;
  IF char_length(v_os) > 40 THEN RAISE EXCEPTION 'Numero da OS excede 40 caracteres'; END IF;
  IF v_os !~ '^[A-Za-z0-9/._-]+$' THEN
    RAISE EXCEPTION 'Numero da OS invalido: use letras, numeros, barra, ponto ou hifen';
  END IF;

  -- serviço final válido e ativo
  IF NOT EXISTS (SELECT 1 FROM public.pops_services s WHERE s.id = p_final_service_id AND s.active) THEN
    RAISE EXCEPTION 'Servico final invalido ou inativo';
  END IF;

  -- ofertados: dedup, validação de existência/atividade e inclusão obrigatória do final
  SELECT array_agg(DISTINCT x) INTO v_ids
    FROM unnest(coalesce(p_offered_service_ids, ARRAY[]::uuid[])) AS x
   WHERE x IS NOT NULL;
  v_ids := coalesce(v_ids, ARRAY[]::uuid[]);

  IF array_length(v_ids,1) IS NOT NULL THEN
    SELECT count(*) INTO v_active FROM public.pops_services s
     WHERE s.id = ANY(v_ids) AND s.active;
    IF v_active <> array_length(v_ids,1) THEN
      RAISE EXCEPTION 'Existe servico avaliado invalido ou inativo na selecao';
    END IF;
  END IF;

  IF NOT (p_final_service_id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'O servico final deve estar entre os servicos avaliados/ofertados';
  END IF;

  -- trava a máquina
  SELECT * INTO m FROM public.pops_machines WHERE id = p_machine_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Maquina POPS nao encontrada'; END IF;
  IF NOT m.active THEN RAISE EXCEPTION 'Maquina inativa no POPS'; END IF;

  SELECT e.* INTO ex FROM public.pops_machine_executions e
   WHERE e.pops_machine_id = p_machine_id AND e.voided_at IS NULL LIMIT 1;

  IF ex.id IS NOT NULL THEN
    SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = ex.executed_by;
    RAISE EXCEPTION 'Maquina ja concluida (OS %, por %, em %)',
      ex.os_number, coalesce(v_name,'usuario'), to_char(ex.executed_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI');
  END IF;

  BEGIN
    INSERT INTO public.pops_machine_executions (
      program_id, pops_machine_id, final_service_id, os_number,
      executed_by, executed_at, filial_id, notes, created_by, updated_by
    ) VALUES (
      m.program_id, m.id, p_final_service_id, v_os,
      v_uid, now(), m.pops_filial_id, nullif(btrim(coalesce(p_notes,'')),''), v_uid, v_uid
    ) RETURNING id INTO v_exec_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF position('os_unique' in coalesce(SQLERRM,'')) > 0 THEN
        RAISE EXCEPTION 'A OS % ja esta registrada em outra maquina deste programa', v_os;
      ELSE
        RAISE EXCEPTION 'Esta maquina acabou de ser concluida por outro usuario';
      END IF;
  END;

  INSERT INTO public.pops_machine_offered_services (pops_machine_id, execution_id, service_id, filial_id, created_by)
  SELECT m.id, v_exec_id, s, m.pops_filial_id, v_uid FROM unnest(v_ids) AS s
  ON CONFLICT (pops_machine_id, service_id)
  DO UPDATE SET execution_id = EXCLUDED.execution_id;

  UPDATE public.pops_machines
     SET status='servicada', last_activity_at=now(),
         started_by = coalesce(started_by, v_uid),
         started_at = coalesce(started_at, now())
   WHERE id = m.id;

  RETURN public.pops_machine_execution_detail(m.id);
END $$;

REVOKE ALL ON FUNCTION public.pops_complete_machine(uuid,uuid,text,uuid[],text) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_complete_machine(uuid,uuid,text,uuid[],text) TO authenticated;

-- =========================================================
-- 8. pops_update_execution (correção — Manager/Admin)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_update_execution(
  p_machine_id uuid,
  p_final_service_id uuid DEFAULT NULL,
  p_os_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); ex record; v_os text; v_svc uuid;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Apenas gestao pode corrigir execucao POPS';
  END IF;

  SELECT * INTO ex FROM public.pops_machine_executions
   WHERE pops_machine_id = p_machine_id AND voided_at IS NULL FOR UPDATE;
  IF ex.id IS NULL THEN RAISE EXCEPTION 'Nao existe execucao ativa para esta maquina'; END IF;

  v_svc := coalesce(p_final_service_id, ex.final_service_id);
  IF NOT EXISTS (SELECT 1 FROM public.pops_services s WHERE s.id = v_svc AND s.active) THEN
    RAISE EXCEPTION 'Servico final invalido ou inativo';
  END IF;

  v_os := btrim(coalesce(p_os_number, ex.os_number));
  IF v_os = '' OR char_length(v_os) > 40 OR v_os !~ '^[A-Za-z0-9/._-]+$' THEN
    RAISE EXCEPTION 'Numero da OS invalido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pops_machine_executions e
              WHERE e.program_id = ex.program_id AND e.voided_at IS NULL
                AND e.id <> ex.id AND upper(e.os_number_norm) = upper(v_os)) THEN
    RAISE EXCEPTION 'A OS % ja esta registrada em outra maquina deste programa', v_os;
  END IF;

  UPDATE public.pops_machine_executions
     SET final_service_id = v_svc,
         os_number        = v_os,
         notes            = coalesce(nullif(btrim(coalesce(p_notes,'')),''), notes),
         updated_by       = v_uid
   WHERE id = ex.id;

  INSERT INTO public.pops_machine_offered_services (pops_machine_id, execution_id, service_id, filial_id, created_by)
  SELECT p_machine_id, ex.id, v_svc, ex.filial_id, v_uid
  ON CONFLICT (pops_machine_id, service_id) DO NOTHING;

  RETURN public.pops_machine_execution_detail(p_machine_id);
END $$;

REVOKE ALL ON FUNCTION public.pops_update_execution(uuid,uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_update_execution(uuid,uuid,text,text) TO authenticated;

-- =========================================================
-- 9. pops_void_execution (estorno — Manager/Admin, sem DELETE)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_void_execution(p_machine_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); ex record; v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Apenas gestao pode estornar execucao POPS';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'Motivo do estorno e obrigatorio'; END IF;

  SELECT * INTO ex FROM public.pops_machine_executions
   WHERE pops_machine_id = p_machine_id AND voided_at IS NULL FOR UPDATE;
  IF ex.id IS NULL THEN RAISE EXCEPTION 'Nao existe execucao ativa para estornar'; END IF;

  UPDATE public.pops_machine_executions
     SET voided_at = now(), voided_by = v_uid, void_reason = v_reason, updated_by = v_uid
   WHERE id = ex.id;

  UPDATE public.pops_machines
     SET status = 'em_andamento', last_activity_at = now()
   WHERE id = p_machine_id;

  RETURN public.pops_machine_execution_detail(p_machine_id);
END $$;

REVOKE ALL ON FUNCTION public.pops_void_execution(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_void_execution(uuid,text) TO authenticated;

-- =========================================================
-- 10. pops_machine_execution_detail
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_machine_execution_detail(p_machine_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.pops_can_read_machine(p_machine_id) THEN
    RAISE EXCEPTION 'Sem permissao para visualizar esta maquina POPS';
  END IF;

  SELECT jsonb_build_object(
    'machine', jsonb_build_object(
      'id', m.id, 'status', m.status, 'serial', m.pops_serial, 'model', m.pops_model,
      'client_name', m.pops_client_name, 'client_code', m.pops_client_code,
      'filial_id', m.pops_filial_id, 'filial', f.nome,
      'link_status', m.link_status, 'equipment_id', m.equipment_id,
      'started_by', m.started_by, 'started_at', m.started_at
    ),
    'execution', (
      SELECT jsonb_build_object(
        'id', e.id,
        'final_service', jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code),
        'os_number', e.os_number, 'executed_by', e.executed_by,
        'executed_by_name', pe.name, 'executed_at', e.executed_at, 'notes', e.notes
      ) FROM public.pops_machine_executions e
        JOIN public.pops_services s ON s.id = e.final_service_id
        LEFT JOIN public.profiles pe ON pe.user_id = e.executed_by
       WHERE e.pops_machine_id = m.id AND e.voided_at IS NULL LIMIT 1
    ),
    'voided_history', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'os_number', e.os_number,
               'executed_by', e.executed_by, 'executed_at', e.executed_at,
               'voided_at', e.voided_at, 'voided_by', e.voided_by, 'void_reason', e.void_reason)
               ORDER BY e.voided_at DESC)
        FROM public.pops_machine_executions e
       WHERE e.pops_machine_id = m.id AND e.voided_at IS NOT NULL
    ), '[]'::jsonb),
    'offered_services', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code) ORDER BY s.sort_order)
        FROM public.pops_machine_offered_services o
        JOIN public.pops_services s ON s.id = o.service_id
       WHERE o.pops_machine_id = m.id
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'can_execute', public.pops_can_execute_machine(m.id),
      'can_manage',  public.pops_is_manager()
    )
  ) INTO v_res
  FROM public.pops_machines m
  LEFT JOIN public.filiais f ON f.id = m.pops_filial_id
  WHERE m.id = p_machine_id;

  IF v_res IS NULL THEN RAISE EXCEPTION 'Maquina POPS nao encontrada'; END IF;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.pops_machine_execution_detail(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_machine_execution_detail(uuid) TO authenticated;

-- =========================================================
-- 11. pops_goal_summary
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_goal_summary(p_program_id uuid, p_filial_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_scope jsonb := public.pops_scope();
  v_mode text := v_scope->>'scope';
  v_filial uuid;
  v_goal int; v_universe int; v_serviced int; v_prog int; v_pending int;
  v_today int; v_week int; v_month int;
  v_tz text := 'America/Sao_Paulo';
  v_d0 date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  IF v_mode = 'none' THEN RAISE EXCEPTION 'Sem permissao no POPS'; END IF;
  v_filial := CASE WHEN v_mode = 'global' THEN p_filial_id ELSE (v_scope->>'filial_id')::uuid END;

  SELECT goal_machines INTO v_goal FROM public.pops_programs WHERE id = p_program_id;
  IF v_goal IS NULL THEN RAISE EXCEPTION 'Programa POPS nao encontrado'; END IF;

  SELECT count(*) FILTER (WHERE true),
         count(*) FILTER (WHERE m.status = 'em_andamento'),
         count(*) FILTER (WHERE m.status = 'foco')
    INTO v_universe, v_prog, v_pending
    FROM public.pops_machines m
   WHERE m.program_id = p_program_id AND m.active
     AND (v_filial IS NULL OR m.pops_filial_id = v_filial);

  SELECT count(*),
         count(*) FILTER (WHERE (e.executed_at AT TIME ZONE v_tz)::date = v_d0),
         count(*) FILTER (WHERE (e.executed_at AT TIME ZONE v_tz)::date
                                 >= (v_d0 - ((extract(isodow from v_d0)::int - 1)))),
         count(*) FILTER (WHERE (e.executed_at AT TIME ZONE v_tz)::date >= date_trunc('month', v_d0)::date)
    INTO v_serviced, v_today, v_week, v_month
    FROM public.pops_machine_executions e
   WHERE e.program_id = p_program_id AND e.voided_at IS NULL
     AND (v_filial IS NULL OR e.filial_id = v_filial);

  RETURN jsonb_build_object(
    'program_id', p_program_id, 'scope', v_mode, 'filial_id', v_filial,
    'goal', v_goal, 'total_universe', v_universe,
    'serviced', v_serviced, 'remaining', greatest(v_goal - v_serviced, 0),
    'attainment_percent', round((v_serviced::numeric / nullif(v_goal,0)) * 100, 1),
    'today', v_today, 'this_week', v_week, 'this_month', v_month,
    'in_progress', v_prog, 'pending', v_pending
  );
END $$;

REVOKE ALL ON FUNCTION public.pops_goal_summary(uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_goal_summary(uuid,uuid) TO authenticated;

-- =========================================================
-- 12. pops_goal_breakdown  (dimension: dia | filial | executor | servico)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pops_goal_breakdown(
  p_program_id uuid,
  p_dimension text,
  p_filial_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_scope jsonb := public.pops_scope();
  v_mode text := v_scope->>'scope';
  v_filial uuid; v_total int; v_res jsonb;
  v_tz text := 'America/Sao_Paulo';
  v_d0 date := (now() AT TIME ZONE v_tz)::date;
  v_wk date; v_mo date;
BEGIN
  IF v_mode = 'none' THEN RAISE EXCEPTION 'Sem permissao no POPS'; END IF;
  IF p_dimension NOT IN ('dia','filial','executor','servico') THEN
    RAISE EXCEPTION 'Dimensao invalida: %', p_dimension;
  END IF;
  v_filial := CASE WHEN v_mode = 'global' THEN p_filial_id ELSE (v_scope->>'filial_id')::uuid END;
  v_wk := v_d0 - (extract(isodow from v_d0)::int - 1);
  v_mo := date_trunc('month', v_d0)::date;

  WITH base AS (
    SELECT e.*, (e.executed_at AT TIME ZONE v_tz)::date AS d
      FROM public.pops_machine_executions e
     WHERE e.program_id = p_program_id AND e.voided_at IS NULL
       AND (v_filial IS NULL OR e.filial_id = v_filial)
       AND (p_date_from IS NULL OR (e.executed_at AT TIME ZONE v_tz)::date >= p_date_from)
       AND (p_date_to   IS NULL OR (e.executed_at AT TIME ZONE v_tz)::date <= p_date_to)
  ), tot AS (SELECT count(*)::int n FROM base)
  SELECT (SELECT n FROM tot),
         CASE p_dimension
           WHEN 'dia' THEN (
             SELECT coalesce(jsonb_agg(x ORDER BY x->>'key'), '[]'::jsonb) FROM (
               SELECT jsonb_build_object(
                 'key', d::text, 'label', to_char(d,'DD/MM'),
                 'serviced', count(*)::int,
                 'cumulative', sum(count(*)) OVER (ORDER BY d)::int
               ) AS x
               FROM base GROUP BY d
             ) q
           )
           WHEN 'filial' THEN (
             SELECT coalesce(jsonb_agg(x ORDER BY (x->>'serviced')::int DESC), '[]'::jsonb) FROM (
               SELECT jsonb_build_object(
                 'key', b.filial_id, 'label', coalesce(f.nome,'Sem filial'),
                 'serviced', count(*)::int,
                 'share_percent', round(count(*)::numeric * 100 / nullif((SELECT n FROM tot),0), 1),
                 'in_progress', (SELECT count(*)::int FROM public.pops_machines m
                                  WHERE m.program_id = p_program_id AND m.active
                                    AND m.status='em_andamento'
                                    AND m.pops_filial_id IS NOT DISTINCT FROM b.filial_id)
               ) AS x
               FROM base b LEFT JOIN public.filiais f ON f.id = b.filial_id
               GROUP BY b.filial_id, f.nome
             ) q
           )
           WHEN 'executor' THEN (
             SELECT coalesce(jsonb_agg(x ORDER BY (x->>'serviced')::int DESC), '[]'::jsonb) FROM (
               SELECT jsonb_build_object(
                 'key', b.executed_by, 'label', coalesce(p.name,'Usuario'),
                 'filial', coalesce(f.nome,'-'),
                 'serviced', count(*)::int,
                 'today', count(*) FILTER (WHERE b.d = v_d0)::int,
                 'week',  count(*) FILTER (WHERE b.d >= v_wk)::int,
                 'month', count(*) FILTER (WHERE b.d >= v_mo)::int,
                 'share_percent', round(count(*)::numeric * 100 / nullif((SELECT n FROM tot),0), 1)
               ) AS x
               FROM base b
               LEFT JOIN public.profiles p ON p.user_id = b.executed_by
               LEFT JOIN public.filiais f ON f.id = p.filial_id
               GROUP BY b.executed_by, p.name, f.nome
             ) q
           )
           ELSE (
             SELECT coalesce(jsonb_agg(x ORDER BY (x->>'serviced')::int DESC), '[]'::jsonb) FROM (
               SELECT jsonb_build_object(
                 'key', s.id, 'label', s.name,
                 'serviced', count(*)::int,
                 'share_percent', round(count(*)::numeric * 100 / nullif((SELECT n FROM tot),0), 1)
               ) AS x
               FROM base b JOIN public.pops_services s ON s.id = b.final_service_id
               GROUP BY s.id, s.name
             ) q
           )
         END
    INTO v_total, v_res;

  RETURN jsonb_build_object('program_id', p_program_id, 'dimension', p_dimension,
    'scope', v_mode, 'filial_id', v_filial, 'total_serviced', v_total, 'rows', coalesce(v_res,'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.pops_goal_breakdown(uuid,text,uuid,date,date) FROM public;
GRANT EXECUTE ON FUNCTION public.pops_goal_breakdown(uuid,text,uuid,date,date) TO authenticated;
```

## Impacto

- Nenhuma linha das 5.077 máquinas é modificada: apenas 2 colunas novas nuláveis
  (`started_by`, `started_at`), índices e trigger de guard.
- Nenhuma OS/execução criada; nenhuma atribuição de RAC; `client_equipment` intocado.
- Objeto existente alterado: `pops_can_write_machine()` (passa a delegar para
  `pops_can_execute_machine`, deixando de depender de `responsible_user_id`).

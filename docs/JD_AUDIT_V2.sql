-- ============================================================
-- Auditoria JD v2 — Duplicidade por CHECKLIST (ID Atividade)
-- ------------------------------------------------------------
-- Fonte: aba "Checklist - Máquina" (ID Atividade + Chassi/Série).
-- Regras:
--   ok          = 1ª ocorrência do chassi, pela ordem das linhas
--   duplicado   = 2ª ocorrência em diante do mesmo chassi
--   sem_chassi  = linha sem chassi
--   nao_auditado= checklist fora da auditoria vigente
-- Auditoria vigente = última importação v2 'concluido'.
-- Preserva: jd_chassis_base, jd_chassis_import_batches e todos os
-- checklists (nenhum registro existente é alterado ou apagado).
-- Acesso direto às tabelas novas: somente administradores.
-- Assinaturas de jd_classify_checklists e
-- get_service_opportunities_details NÃO mudam (CREATE OR REPLACE,
-- sem DROP); muda apenas o conteúdo de jd_status.
-- ============================================================

-- 1. Tabelas -------------------------------------------------
CREATE TABLE public.jd_audit_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  sheet_name text NOT NULL,
  imported_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'processando'
    CHECK (status IN ('processando','concluido','cancelado')),
  total_linhas integer NOT NULL CHECK (total_linhas > 0),
  processadas integer NOT NULL DEFAULT 0,
  qtd_ok integer NOT NULL DEFAULT 0,
  qtd_duplicado integer NOT NULL DEFAULT 0,
  qtd_sem_chassi integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluded_at timestamptz
);
GRANT SELECT ON public.jd_audit_imports TO authenticated;
GRANT ALL ON public.jd_audit_imports TO service_role;
ALTER TABLE public.jd_audit_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY jd_audit_imports_admin_select ON public.jd_audit_imports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.jd_audit_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.jd_audit_imports(id),
  row_number integer NOT NULL CHECK (row_number > 0),
  task_id uuid NOT NULL,
  chassi_original text NOT NULL DEFAULT '',
  chassi_normalizado text NOT NULL DEFAULT '',
  status text CHECK (status IN ('ok','duplicado','sem_chassi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, row_number),
  UNIQUE (import_id, task_id)
);
CREATE INDEX jd_audit_rows_task_idx ON public.jd_audit_rows (task_id, import_id);
GRANT SELECT ON public.jd_audit_rows TO authenticated;
GRANT ALL ON public.jd_audit_rows TO service_role;
ALTER TABLE public.jd_audit_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY jd_audit_rows_admin_select ON public.jd_audit_rows
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- Sem políticas de escrita: gravação só pelas funções abaixo.

-- 2. Validação prévia (admin; até 1.000 linhas por chamada) ---
-- p_rows: [{"row":n,"task_id":"uuid","chassi":"texto"}]
-- Retorna só as linhas com problema:
--   'inexistente'       ID não existe no GVPS
--   'nao_checklist'     ID existe mas não é checklist
--   'chassi_divergente' chassi da planilha ≠ chassi da ficha (após normalização)
CREATE OR REPLACE FUNCTION public.jd_audit_validate_rows(p_rows jsonb)
RETURNS TABLE(row_number integer, task_id uuid, problema text, chassi_planilha text, chassi_ficha text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Envie até 1000 linhas por chamada' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH i AS (
    SELECT (e->>'row')::integer AS rn, (e->>'task_id')::uuid AS tid, coalesce(e->>'chassi','') AS ch
    FROM jsonb_array_elements(p_rows) e
  )
  SELECT i.rn, i.tid,
    CASE WHEN t.id IS NULL THEN 'inexistente'
         WHEN t.task_type IS DISTINCT FROM 'checklist' THEN 'nao_checklist'
         ELSE 'chassi_divergente' END,
    i.ch, coalesce(t.checklist_machine->>'chassi_serie','')
  FROM i LEFT JOIN tasks t ON t.id = i.tid
  WHERE t.id IS NULL
     OR t.task_type IS DISTINCT FROM 'checklist'
     OR public.normalize_chassis(i.ch) <> public.normalize_chassis(coalesce(t.checklist_machine->>'chassi_serie',''));
END;
$$;

-- 3. Importação em lotes --------------------------------------
CREATE OR REPLACE FUNCTION public.jd_audit_start(p_filename text, p_sheet_name text, p_total_linhas integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_total_linhas,0) <= 0 THEN
    RAISE EXCEPTION 'Total de linhas inválido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO jd_audit_imports (filename, sheet_name, imported_by, total_linhas)
  VALUES (coalesce(nullif(trim(p_filename),''),'arquivo'),
          coalesce(nullif(trim(p_sheet_name),''),'—'), auth.uid(), p_total_linhas)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- p_rows: [{"row":<nº linha da planilha>,"task_id":"<uuid>","chassi":"<texto>"}]
-- Lote inteiro é rejeitado se algum ID não existir, não for checklist,
-- ou repetir linha/ID já gravados nesta importação.
CREATE OR REPLACE FUNCTION public.jd_audit_append(p_import_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_status text; v_n integer; v_bad integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM jd_audit_imports WHERE id = p_import_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'processando' THEN
    RAISE EXCEPTION 'Importação não encontrada ou já finalizada';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Envie até 1000 linhas por lote' USING ERRCODE = '22023';
  END IF;

  -- Sem tabela temporária: tudo em CTE, isolado por chamada.
  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements(p_rows) e
  LEFT JOIN tasks t ON t.id = (e->>'task_id')::uuid
  WHERE (e->>'row') IS NULL OR (e->>'task_id') IS NULL
     OR t.id IS NULL OR t.task_type IS DISTINCT FROM 'checklist'
     OR public.normalize_chassis(coalesce(e->>'chassi',''))
        <> public.normalize_chassis(coalesce(t.checklist_machine->>'chassi_serie',''));
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% linha(s) com ID inexistente, que não é checklist ou com chassi divergente da ficha; lote rejeitado', v_bad USING ERRCODE = '22023';
  END IF;

  WITH ins AS (
    INSERT INTO jd_audit_rows (import_id, row_number, task_id, chassi_original, chassi_normalizado)
    SELECT p_import_id, (e->>'row')::integer, (e->>'task_id')::uuid,
           trim(coalesce(e->>'chassi','')), public.normalize_chassis(coalesce(e->>'chassi',''))
    FROM jsonb_array_elements(p_rows) e
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ins;
  -- linha ou ID repetido viola UNIQUE e aborta o lote inteiro.

  UPDATE jd_audit_imports SET processadas = processadas + v_n WHERE id = p_import_id;
  RETURN v_n;
END;
$$;

-- Conclui só se TODAS as linhas foram gravadas; calcula OK/Duplicado
-- pela ordem das linhas (row_number) e torna esta a auditoria vigente.
CREATE OR REPLACE FUNCTION public.jd_audit_conclude(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row jd_audit_imports%ROWTYPE; v_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM jd_audit_imports WHERE id = p_import_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'processando' THEN
    RAISE EXCEPTION 'Importação não encontrada ou já finalizada';
  END IF;
  SELECT count(*) INTO v_count FROM jd_audit_rows WHERE import_id = p_import_id;
  IF v_count <> v_row.total_linhas OR v_row.processadas <> v_row.total_linhas THEN
    RAISE EXCEPTION 'Importação incompleta: % de % linhas; permanece em processamento',
      v_count, v_row.total_linhas USING ERRCODE = 'P0001';
  END IF;

  UPDATE jd_audit_rows r SET status = c.st
  FROM (
    SELECT id,
      CASE WHEN chassi_normalizado = '' THEN 'sem_chassi'
           WHEN row_number() OVER (PARTITION BY chassi_normalizado ORDER BY row_number) = 1 THEN 'ok'
           ELSE 'duplicado' END AS st
    FROM jd_audit_rows WHERE import_id = p_import_id
  ) c
  WHERE r.id = c.id;

  UPDATE jd_audit_imports SET
    status = 'concluido', concluded_at = now(),
    qtd_ok = (SELECT count(*) FROM jd_audit_rows WHERE import_id = p_import_id AND status = 'ok'),
    qtd_duplicado = (SELECT count(*) FROM jd_audit_rows WHERE import_id = p_import_id AND status = 'duplicado'),
    qtd_sem_chassi = (SELECT count(*) FROM jd_audit_rows WHERE import_id = p_import_id AND status = 'sem_chassi')
  WHERE id = p_import_id RETURNING * INTO v_row;

  RETURN jsonb_build_object('total', v_row.total_linhas, 'ok', v_row.qtd_ok,
    'duplicado', v_row.qtd_duplicado, 'sem_chassi', v_row.qtd_sem_chassi);
END;
$$;

-- Marca uma importação interrompida como cancelada (histórico mantido).
CREATE OR REPLACE FUNCTION public.jd_audit_cancel(p_import_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE jd_audit_imports SET status = 'cancelado', concluded_at = now()
  WHERE id = p_import_id AND status = 'processando';
END;
$$;

-- 4. Situação de um checklist na auditoria vigente (uso interno) --
-- Vigente = última importação com status 'concluido'. Importações em
-- 'processando' ou 'cancelado' nunca entram: a auditoria anterior
-- continua valendo durante e após uma importação interrompida.
-- EXECUTE revogado de PUBLIC/anon/authenticated: só é chamada dentro de
-- jd_classify_checklists e get_service_opportunities_details (SECURITY
-- DEFINER, dono postgres), que aplicam o controle de acesso por checklist.
CREATE OR REPLACE FUNCTION public.jd_audit_status_of(p_task_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce((
    SELECT r.status FROM jd_audit_rows r
    WHERE r.task_id = p_task_id
      AND r.import_id = (SELECT id FROM jd_audit_imports
                         WHERE status = 'concluido' AND concluded_at IS NOT NULL
                         ORDER BY concluded_at DESC, id DESC LIMIT 1)
  ), 'nao_auditado');
$$;
REVOKE ALL ON FUNCTION public.jd_audit_status_of(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.jd_audit_validate_rows(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jd_audit_start(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jd_audit_append(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jd_audit_conclude(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jd_audit_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jd_audit_validate_rows(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jd_audit_start(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jd_audit_append(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jd_audit_conclude(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jd_audit_cancel(uuid) TO authenticated;

-- 5. jd_classify_checklists: mesma assinatura e mesmas regras de
--    acesso; passa a devolver ok/duplicado/sem_chassi/nao_auditado.
CREATE OR REPLACE FUNCTION public.jd_classify_checklists(p_task_ids uuid[])
RETURNS TABLE(task_id uuid, jd_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF coalesce(array_length(p_task_ids,1),0) > 1000 THEN
    RAISE EXCEPTION 'Máximo de 1000 atividades por chamada' USING ERRCODE = '22023';
  END IF;
  v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  RETURN QUERY
  SELECT t.id, public.jd_audit_status_of(t.id)
  FROM tasks t
  WHERE t.id = ANY(coalesce(p_task_ids, ARRAY[]::uuid[]))
    AND t.task_type = 'checklist'
    AND (v_is_admin OR public.can_access_task_related_data(t.id));
END;
$$;

-- 6. get_service_opportunities_details: MESMA assinatura, filtros e
--    regra de acesso; só a expressão jd_status muda.
CREATE OR REPLACE FUNCTION public.get_service_opportunities_details(
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_filial_id uuid DEFAULT NULL::uuid,
  p_seller_role text DEFAULT NULL::text,
  p_seller_id uuid DEFAULT NULL::uuid,
  p_service_type text DEFAULT NULL::text,
  p_severity text DEFAULT NULL::text,
  p_machine_type text DEFAULT NULL::text,
  p_client text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_jd_status text DEFAULT NULL::text
)
RETURNS TABLE(
  task_id uuid, checklist_date date, filial_nome text, seller_id uuid,
  seller_name text, seller_role text, client_name text, client_code text,
  machine_type text, machine_model text, machine_serial text,
  machine_year text, machine_hours text, service_type text, item_name text,
  severity text, response_status text, observation text, total_count bigint,
  jd_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_scope uuid[];
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  -- Filial Ativa: valida principal + adicionais (42501 se não autorizada).
  -- Globais sem filial => '{}' (sem filtro). Não-globais: exatamente UMA.
  v_scope := public.effective_filial_ids(p_filial_id);
  IF NOT (v_is_admin OR v_is_manager) AND COALESCE(cardinality(v_scope), 0) <> 1 THEN
    RAISE EXCEPTION 'Acesso negado: selecione uma Filial Ativa autorizada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH primary_role AS (
    SELECT ur.user_id,
      (ARRAY_AGG(ur.role::text ORDER BY
        CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
          WHEN 'rac' THEN 4 WHEN 'cpa' THEN 4 WHEN 'csa' THEN 4 ELSE 5 END))[1] AS role
    FROM user_roles ur
    GROUP BY ur.user_id
  ),
  rows_data AS (
    SELECT
      t.id AS task_id,
      t.start_date AS checklist_date,
      COALESCE(f.nome, NULLIF(TRIM(t.filial), ''), 'Sem filial') AS filial_nome,
      t.created_by AS seller_id,
      COALESCE(NULLIF(TRIM(pf.name), ''), NULLIF(TRIM(t.responsible), ''), 'Não informado') AS seller_name,
      COALESCE(pr.role, 'consultant') AS seller_role,
      t.client AS client_name,
      COALESCE(t.clientcode, '') AS client_code,
      COALESCE(t.checklist_machine->>'tipo', '') AS machine_type,
      COALESCE(t.checklist_machine->>'modelo', '') AS machine_model,
      COALESCE(t.checklist_machine->>'chassi_serie', '') AS machine_serial,
      COALESCE(t.checklist_machine->>'ano', '') AS machine_year,
      COALESCE(t.checklist_machine->>'horimetro', '') AS machine_hours,
      map_checklist_item_to_service(p.name) AS service_type,
      p.name AS item_name,
      CASE p.response_status WHEN 'nao_conforme' THEN 'alta' ELSE 'media' END AS severity,
      p.response_status,
      COALESCE(p.response_notes, '') AS observation,
      public.jd_audit_status_of(t.id) AS jd_status
    FROM tasks t
    JOIN products p ON p.task_id = t.id
    LEFT JOIN profiles pf ON pf.user_id = t.created_by
    -- Filial efetiva = filial registrada na PRÓPRIA atividade (tasks.filial),
    -- vinculada ao cadastro de filiais; não usa a filial do cadastro do usuário.
    LEFT JOIN filiais f ON LOWER(TRIM(f.nome)) = LOWER(TRIM(t.filial))
    LEFT JOIN primary_role pr ON pr.user_id = t.created_by
    WHERE t.task_type = 'checklist'
      AND p.response_status IN ('atencao','nao_conforme')
      AND map_checklist_item_to_service(p.name) IS NOT NULL
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (cardinality(v_scope) = 0 OR f.id = ANY(v_scope))
      AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
      AND (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
      AND (p_machine_type IS NULL OR LOWER(TRIM(COALESCE(t.checklist_machine->>'tipo',''))) = LOWER(TRIM(p_machine_type)))
      AND (p_client IS NULL OR t.client ILIKE '%' || p_client || '%' OR COALESCE(t.clientcode,'') ILIKE '%' || p_client || '%')
      AND (p_service_type IS NULL OR map_checklist_item_to_service(p.name) = p_service_type)
      AND (p_severity IS NULL OR (CASE p.response_status WHEN 'nao_conforme' THEN 'alta' ELSE 'media' END) = LOWER(TRIM(p_severity)))
      AND (
        v_is_admin OR v_is_manager
        OR v_is_supervisor
        OR t.created_by = v_user_id
      )
  ),
  filtered AS (
    SELECT rd.* FROM rows_data rd
    WHERE p_jd_status IS NULL OR rd.jd_status = LOWER(TRIM(p_jd_status))
  )
  SELECT r.task_id, r.checklist_date, r.filial_nome, r.seller_id, r.seller_name, r.seller_role,
    r.client_name, r.client_code, r.machine_type, r.machine_model, r.machine_serial,
    r.machine_year, r.machine_hours, r.service_type, r.item_name, r.severity,
    r.response_status, r.observation,
    COUNT(*) OVER() AS total_count,
    r.jd_status
  FROM filtered r
  ORDER BY r.checklist_date DESC, r.client_name, r.item_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

-- Privilégios idênticos aos atuais (anon, authenticated, service_role).
GRANT EXECUTE ON FUNCTION public.get_service_opportunities_details(date, date, uuid, text, uuid, text, text, text, text, integer, integer, text) TO anon, authenticated, service_role;


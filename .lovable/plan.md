# M2 — Estrutura de Importação e Carteira POPS (SQL para revisão — NADA APLICADO)

## Ajustes incorporados

**1. Identidade do cliente na carteira**
- `Dealer Account Number` é preservado em `pops_import_rows` (`pops_client_code` cru + `pops_client_code_norm`) e é a **referência principal de agrupamento** por cliente na carga inicial.
- Depois do matching ficam disponíveis simultaneamente: código da base POPS, código encontrado no Parque (`park_client_code`) e `client_code_divergence boolean` gerado. A divergência é apenas informativa — **nenhum dado de `client_equipment` é alterado**.
- `pops_client_assignments` usa como chave `(program_id, pops_client_code_norm)` — o código normalizado da BASE POPS —, garantindo agrupamento mesmo com cadastro do Parque incompleto.

**2. Atribuição por filial**
- `pops_assign_rac_by_filial(...)` **removida/adiada**. A M2 mantém apenas atribuição por cliente e individual/lote, com a regra de mesmo cliente = mesmo RAC e exceção só por ação explícita (`p_force`).
- Para decidir a distribuição, a M2 entrega `pops_import_distribution(p_batch_id)`: máquinas, clientes, distribuição por filial, clientes por filial, máquinas por cliente e quantidade sem vínculo no Parque.

**3. Escopo desta execução**
- A migration cria **apenas estrutura vazia** (enums, 3 tabelas, funções, RPCs, triggers, índices). Nenhum `INSERT` de dados da base POPS.
- A base real será enviada na etapa separada **M2.1 — Importação e auditoria da base real**, onde faremos upload, auditoria, matching e revisão **antes** de confirmar qualquer máquina em `pops_machines`.

---

## SQL COMPLETO DA M2

```sql
-- ==========================================================
-- M2 — ENUMS
-- ==========================================================
CREATE TYPE public.pops_import_status AS ENUM ('rascunho','processado','confirmado','cancelado');
CREATE TYPE public.pops_match_status  AS ENUM ('PENDENTE','MATCH_EXATO','REVISAR','NAO_ENCONTRADA','DUPLICADA_NA_BASE','JA_NO_POPS');
CREATE TYPE public.pops_row_resolution AS ENUM ('pendente','confirmado','vinculado_manual','ignorado');

-- ==========================================================
-- M2 — FUNÇÕES DE NORMALIZAÇÃO
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_norm_serial(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(p_text,''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.pops_norm_code(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(ltrim(regexp_replace(COALESCE(p_text,''), '[^0-9A-Za-z]', '', 'g'), '0'), '\s', '', 'g'), '');
$$;

-- ==========================================================
-- M2 — TABELA: pops_import_batches
-- ==========================================================
CREATE TABLE public.pops_import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id    uuid NOT NULL REFERENCES public.pops_programs(id),
  file_name     text NOT NULL,
  column_map    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        public.pops_import_status NOT NULL DEFAULT 'rascunho',
  total_rows    integer NOT NULL DEFAULT 0,
  counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  created_by    uuid,
  confirmed_by  uuid,
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.pops_import_batches FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.pops_import_batches TO authenticated;
GRANT ALL ON public.pops_import_batches TO service_role;

ALTER TABLE public.pops_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pops_import_batches_select_mgmt" ON public.pops_import_batches
  FOR SELECT TO authenticated USING (public.pops_is_manager());
CREATE POLICY "pops_import_batches_insert_mgmt" ON public.pops_import_batches
  FOR INSERT TO authenticated WITH CHECK (public.pops_is_manager() AND created_by = (SELECT auth.uid()));
CREATE POLICY "pops_import_batches_update_mgmt" ON public.pops_import_batches
  FOR UPDATE TO authenticated USING (public.pops_is_manager()) WITH CHECK (public.pops_is_manager());

CREATE TRIGGER trg_pops_import_batches_updated_at
  BEFORE UPDATE ON public.pops_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

-- ==========================================================
-- M2 — TABELA: pops_import_rows  (registro canônico da BASE DE ORIGEM POPS)
-- ==========================================================
CREATE TABLE public.pops_import_rows (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id               uuid NOT NULL REFERENCES public.pops_import_batches(id) ON DELETE CASCADE,
  row_number             integer NOT NULL,
  raw                    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- campos da BASE POPS (planilha)
  serial_number          text,
  pops_client_code       text,          -- Dealer Account Number
  dealer_location        text,
  product_series         text,
  manufacture_year       text,
  model                  text,
  client_name            text,
  platform               text,

  -- normalizações da BASE POPS
  serial_norm            text GENERATED ALWAYS AS (public.pops_norm_serial(serial_number)) STORED,
  pops_client_code_norm  text GENERATED ALWAYS AS (public.pops_norm_code(pops_client_code)) STORED,

  -- resultado do matching contra o Parque
  match_status           public.pops_match_status NOT NULL DEFAULT 'PENDENTE',
  match_score            integer,
  match_reason           text,
  matched_equipment_id   uuid REFERENCES public.client_equipment(id) ON DELETE SET NULL,
  candidates             jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- dados do Parque no momento do vínculo (conferência, não substitui o Parque)
  park_client_code       text,
  park_client_name       text,
  park_filial_id         uuid REFERENCES public.filiais(id),
  park_model             text,
  park_serial            text,
  client_code_divergence boolean NOT NULL DEFAULT false,

  -- revisão / confirmação
  resolution             public.pops_row_resolution NOT NULL DEFAULT 'pendente',
  resolved_by            uuid,
  resolved_at            timestamptz,
  confirmed_machine_id   uuid REFERENCES public.pops_machines(id) ON DELETE SET NULL,
  review_notes           text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_import_rows_batch_row_uk UNIQUE (batch_id, row_number)
);

REVOKE ALL ON public.pops_import_rows FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.pops_import_rows TO authenticated;
GRANT ALL ON public.pops_import_rows TO service_role;

ALTER TABLE public.pops_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pops_import_rows_select_mgmt" ON public.pops_import_rows
  FOR SELECT TO authenticated USING (public.pops_is_manager());
CREATE POLICY "pops_import_rows_insert_mgmt" ON public.pops_import_rows
  FOR INSERT TO authenticated WITH CHECK (public.pops_is_manager());
CREATE POLICY "pops_import_rows_update_mgmt" ON public.pops_import_rows
  FOR UPDATE TO authenticated USING (public.pops_is_manager()) WITH CHECK (public.pops_is_manager());

CREATE TRIGGER trg_pops_import_rows_updated_at
  BEFORE UPDATE ON public.pops_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

-- ==========================================================
-- M2 — TABELA: pops_client_assignments (carteira por CLIENTE da BASE POPS)
-- ==========================================================
CREATE TABLE public.pops_client_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id            uuid NOT NULL REFERENCES public.pops_programs(id),
  pops_client_code      text NOT NULL,
  pops_client_code_norm text NOT NULL,
  client_name           text,
  rac_user_id           uuid NOT NULL,
  assigned_by           uuid,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_client_assignments_uk UNIQUE (program_id, pops_client_code_norm)
);

REVOKE ALL ON public.pops_client_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.pops_client_assignments TO authenticated;
GRANT ALL ON public.pops_client_assignments TO service_role;

ALTER TABLE public.pops_client_assignments ENABLE ROW LEVEL SECURITY;

-- leitura conforme escopo POPS (RAC: próprio; Supervisor: filial; Manager/Admin: global)
CREATE POLICY "pops_client_assignments_select_scope" ON public.pops_client_assignments
  FOR SELECT TO authenticated USING (
    CASE (public.pops_scope() ->> 'scope')
      WHEN 'global' THEN true
      WHEN 'self'   THEN rac_user_id = (SELECT auth.uid())
      WHEN 'filial' THEN EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = pops_client_assignments.rac_user_id
          AND p.filial_id = ((public.pops_scope() ->> 'filial_id'))::uuid
      )
      ELSE false
    END
  );

CREATE POLICY "pops_client_assignments_insert_mgmt" ON public.pops_client_assignments
  FOR INSERT TO authenticated WITH CHECK (public.pops_is_manager());
CREATE POLICY "pops_client_assignments_update_mgmt" ON public.pops_client_assignments
  FOR UPDATE TO authenticated USING (public.pops_is_manager()) WITH CHECK (public.pops_is_manager());

CREATE TRIGGER trg_pops_client_assignments_updated_at
  BEFORE UPDATE ON public.pops_client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

-- ==========================================================
-- M2 — ÍNDICES
-- ==========================================================
CREATE INDEX pops_import_rows_batch_status_idx ON public.pops_import_rows (batch_id, match_status);
CREATE INDEX pops_import_rows_batch_resol_idx  ON public.pops_import_rows (batch_id, resolution);
CREATE INDEX pops_import_rows_serial_idx       ON public.pops_import_rows (serial_norm);
CREATE INDEX pops_import_rows_client_idx       ON public.pops_import_rows (batch_id, pops_client_code_norm);
CREATE INDEX pops_import_rows_equip_idx        ON public.pops_import_rows (matched_equipment_id);
CREATE INDEX pops_client_assignments_rac_idx   ON public.pops_client_assignments (program_id, rac_user_id);
CREATE INDEX pops_machines_program_resp_idx    ON public.pops_machines (program_id, responsible_user_id, active);

-- índice funcional no Parque (somente leitura da tabela; nenhum dado alterado)
CREATE INDEX IF NOT EXISTS pops_ce_serial_norm_idx
  ON public.client_equipment (public.pops_norm_serial(serial_chassis));

-- ==========================================================
-- M2 — RPC: criar lote de importação
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_create_import_batch(
  p_program_id uuid,
  p_file_name  text,
  p_column_map jsonb,
  p_rows       jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch uuid; v_total integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows deve ser um array jsonb';
  END IF;

  INSERT INTO public.pops_import_batches (program_id, file_name, column_map, created_by)
  VALUES (p_program_id, p_file_name, COALESCE(p_column_map,'{}'::jsonb), (SELECT auth.uid()))
  RETURNING id INTO v_batch;

  INSERT INTO public.pops_import_rows (
    batch_id, row_number, raw,
    serial_number, pops_client_code, dealer_location, product_series,
    manufacture_year, model, client_name, platform
  )
  SELECT v_batch,
         ord::integer,
         r,
         NULLIF(btrim(r->>'serial_number'),''),
         NULLIF(btrim(r->>'pops_client_code'),''),
         NULLIF(btrim(r->>'dealer_location'),''),
         NULLIF(btrim(r->>'product_series'),''),
         NULLIF(btrim(r->>'manufacture_year'),''),
         NULLIF(btrim(r->>'model'),''),
         NULLIF(btrim(r->>'client_name'),''),
         NULLIF(btrim(r->>'platform'),'')
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(r, ord);

  SELECT count(*) INTO v_total FROM public.pops_import_rows WHERE batch_id = v_batch;
  UPDATE public.pops_import_batches SET total_rows = v_total WHERE id = v_batch;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.pops_create_import_batch(uuid,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_create_import_batch(uuid,text,jsonb,jsonb) TO authenticated;

-- ==========================================================
-- M2 — RPC: matching (set-based, sem loop por linha)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_match_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_program uuid; v_counts jsonb;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT program_id INTO v_program FROM public.pops_import_batches WHERE id = p_batch_id;
  IF v_program IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;

  -- reset apenas de linhas não resolvidas manualmente
  UPDATE public.pops_import_rows
     SET match_status='PENDENTE', match_score=NULL, match_reason=NULL,
         matched_equipment_id=NULL, candidates='[]'::jsonb,
         park_client_code=NULL, park_client_name=NULL, park_filial_id=NULL,
         park_model=NULL, park_serial=NULL, client_code_divergence=false
   WHERE batch_id = p_batch_id
     AND resolution IN ('pendente','confirmado');

  -- 1) serial inválido
  UPDATE public.pops_import_rows
     SET match_status='NAO_ENCONTRADA', match_score=0,
         match_reason='Serial ausente ou muito curto na base POPS'
   WHERE batch_id = p_batch_id AND resolution IN ('pendente','confirmado')
     AND (serial_norm IS NULL OR length(serial_norm) < 6);

  -- 2) duplicadas dentro do próprio arquivo (mantém a 1ª ocorrência)
  WITH dup AS (
    SELECT id, row_number() OVER (PARTITION BY serial_norm ORDER BY row_number) AS rn
      FROM public.pops_import_rows
     WHERE batch_id = p_batch_id AND serial_norm IS NOT NULL
       AND length(serial_norm) >= 6 AND resolution IN ('pendente','confirmado')
  )
  UPDATE public.pops_import_rows r
     SET match_status='DUPLICADA_NA_BASE', match_score=0,
         match_reason='Serial repetido no arquivo importado'
    FROM dup WHERE dup.id = r.id AND dup.rn > 1;

  -- 3) candidatos por serial (igualdade ou sufixo compatível 13 <-> 17)
  WITH alvo AS (
    SELECT id, serial_norm, pops_client_code_norm
      FROM public.pops_import_rows
     WHERE batch_id = p_batch_id
       AND match_status = 'PENDENTE'
       AND resolution IN ('pendente','confirmado')
  ),
  cand AS (
    SELECT a.id AS row_id, e.id AS equipment_id,
           e.client_code, e.client_name, e.filial_id, e.model, e.serial_chassis,
           (public.pops_norm_code(e.client_code) IS NOT NULL
            AND a.pops_client_code_norm IS NOT NULL
            AND public.pops_norm_code(e.client_code) = a.pops_client_code_norm) AS code_ok,
           (public.pops_norm_serial(e.serial_chassis) = a.serial_norm) AS serial_exato
      FROM alvo a
      JOIN public.client_equipment e
        ON public.pops_norm_serial(e.serial_chassis) = a.serial_norm
        OR (length(a.serial_norm) = 17 AND public.pops_norm_serial(e.serial_chassis) = right(a.serial_norm,13))
        OR (length(a.serial_norm) = 13 AND right(public.pops_norm_serial(e.serial_chassis),13) = a.serial_norm)
  ),
  agg AS (
    SELECT row_id,
           count(*) AS n_total,
           count(*) FILTER (WHERE code_ok) AS n_code,
           jsonb_agg(jsonb_build_object(
             'equipment_id', equipment_id, 'client_code', client_code,
             'client_name', client_name, 'filial_id', filial_id,
             'model', model, 'serial_chassis', serial_chassis,
             'code_ok', code_ok, 'serial_exato', serial_exato
           ) ORDER BY code_ok DESC, serial_exato DESC) AS cands
      FROM cand GROUP BY row_id
  ),
  escolha AS (
    SELECT g.row_id, g.n_total, g.n_code, g.cands,
           CASE
             WHEN g.n_code = 1 THEN (SELECT c.equipment_id FROM cand c WHERE c.row_id=g.row_id AND c.code_ok LIMIT 1)
             WHEN g.n_total = 1 THEN (SELECT c.equipment_id FROM cand c WHERE c.row_id=g.row_id LIMIT 1)
             ELSE NULL
           END AS equipment_id
      FROM agg g
  )
  UPDATE public.pops_import_rows r
     SET matched_equipment_id = e.equipment_id,
         candidates = CASE WHEN e.equipment_id IS NULL THEN e.cands ELSE '[]'::jsonb END,
         match_score = CASE
                         WHEN e.n_code = 1 THEN CASE WHEN e.n_total = 1 THEN 100 ELSE 95 END
                         WHEN e.n_total = 1 AND r.pops_client_code_norm IS NULL THEN 90
                         WHEN e.n_total = 1 THEN 70
                         ELSE 50
                       END,
         match_status = CASE
                          WHEN e.n_code = 1 THEN 'MATCH_EXATO'::public.pops_match_status
                          WHEN e.n_total = 1 AND r.pops_client_code_norm IS NULL THEN 'MATCH_EXATO'::public.pops_match_status
                          ELSE 'REVISAR'::public.pops_match_status
                        END,
         match_reason = CASE
                          WHEN e.n_code = 1 THEN 'Serial localizado e Dealer Account Number confere'
                          WHEN e.n_total = 1 AND r.pops_client_code_norm IS NULL THEN 'Serial único no Parque; base POPS sem codigo de cliente'
                          WHEN e.n_total = 1 THEN 'Serial único no Parque, porém codigo de cliente divergente'
                          ELSE 'Multiplos candidatos no Parque para o mesmo serial'
                        END
    FROM escolha e
   WHERE e.row_id = r.id;

  -- 4) nenhum candidato
  UPDATE public.pops_import_rows
     SET match_status='NAO_ENCONTRADA', match_score=0,
         match_reason='Nenhuma máquina correspondente no Parque'
   WHERE batch_id = p_batch_id AND match_status='PENDENTE'
     AND resolution IN ('pendente','confirmado');

  -- 5) snapshot de conferência do Parque + divergência de codigo (não altera o Parque)
  UPDATE public.pops_import_rows r
     SET park_client_code = e.client_code,
         park_client_name = e.client_name,
         park_filial_id   = e.filial_id,
         park_model       = e.model,
         park_serial      = e.serial_chassis,
         client_code_divergence = (
           r.pops_client_code_norm IS NOT NULL
           AND public.pops_norm_code(e.client_code) IS NOT NULL
           AND public.pops_norm_code(e.client_code) <> r.pops_client_code_norm
         )
    FROM public.client_equipment e
   WHERE r.batch_id = p_batch_id AND r.matched_equipment_id = e.id;

  -- 6) já vinculadas ao programa
  UPDATE public.pops_import_rows r
     SET match_status='JA_NO_POPS',
         match_reason='Máquina já vinculada ao programa POPS'
   WHERE r.batch_id = p_batch_id
     AND r.matched_equipment_id IS NOT NULL
     AND r.resolution <> 'ignorado'
     AND EXISTS (
       SELECT 1 FROM public.pops_machines m
        WHERE m.program_id = v_program AND m.equipment_id = r.matched_equipment_id
          AND (r.confirmed_machine_id IS NULL OR m.id <> r.confirmed_machine_id)
     );

  SELECT jsonb_object_agg(match_status, qtd) INTO v_counts
    FROM (SELECT match_status, count(*) qtd FROM public.pops_import_rows
           WHERE batch_id = p_batch_id GROUP BY 1) s;

  UPDATE public.pops_import_batches
     SET status='processado', counts=COALESCE(v_counts,'{}'::jsonb)
   WHERE id = p_batch_id;

  RETURN COALESCE(v_counts,'{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_match_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_match_import_batch(uuid) TO authenticated;

-- ==========================================================
-- M2 — RPC: resumo da importação
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_import_summary(p_batch_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.pops_is_manager() THEN NULL ELSE jsonb_build_object(
    'batch', (SELECT to_jsonb(b) - 'column_map' FROM public.pops_import_batches b WHERE b.id = p_batch_id),
    'total_rows', (SELECT count(*) FROM public.pops_import_rows WHERE batch_id = p_batch_id),
    'by_status', COALESCE((SELECT jsonb_object_agg(match_status, qtd) FROM (
        SELECT match_status, count(*) qtd FROM public.pops_import_rows
         WHERE batch_id = p_batch_id GROUP BY 1) s), '{}'::jsonb),
    'by_resolution', COALESCE((SELECT jsonb_object_agg(resolution, qtd) FROM (
        SELECT resolution, count(*) qtd FROM public.pops_import_rows
         WHERE batch_id = p_batch_id GROUP BY 1) s2), '{}'::jsonb),
    'confirmaveis', (SELECT count(*) FROM public.pops_import_rows
        WHERE batch_id = p_batch_id AND matched_equipment_id IS NOT NULL
          AND resolution <> 'ignorado'
          AND (match_status='MATCH_EXATO' OR resolution='vinculado_manual')),
    'sem_vinculo', (SELECT count(*) FROM public.pops_import_rows
        WHERE batch_id = p_batch_id AND matched_equipment_id IS NULL AND resolution <> 'ignorado'),
    'divergencia_codigo', (SELECT count(*) FROM public.pops_import_rows
        WHERE batch_id = p_batch_id AND client_code_divergence)
  ) END;
$$;

REVOKE ALL ON FUNCTION public.pops_import_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_import_summary(uuid) TO authenticated;

-- ==========================================================
-- M2 — RPC: distribuição da base importada (apoio à decisão de carteira)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_import_distribution(p_batch_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.pops_is_manager() THEN NULL ELSE jsonb_build_object(
    'maquinas', (SELECT count(*) FROM public.pops_import_rows
                  WHERE batch_id=p_batch_id AND resolution <> 'ignorado'),
    'clientes', (SELECT count(DISTINCT pops_client_code_norm) FROM public.pops_import_rows
                  WHERE batch_id=p_batch_id AND resolution <> 'ignorado'),
    'sem_vinculo_parque', (SELECT count(*) FROM public.pops_import_rows
                  WHERE batch_id=p_batch_id AND resolution <> 'ignorado' AND matched_equipment_id IS NULL),
    'por_filial', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'filial') FROM (
        SELECT jsonb_build_object(
                 'filial', COALESCE(f.nome, r.dealer_location, 'SEM FILIAL'),
                 'maquinas', count(*),
                 'clientes', count(DISTINCT r.pops_client_code_norm)) AS x
          FROM public.pops_import_rows r
          LEFT JOIN public.filiais f ON f.id = r.park_filial_id
         WHERE r.batch_id=p_batch_id AND r.resolution <> 'ignorado'
         GROUP BY COALESCE(f.nome, r.dealer_location, 'SEM FILIAL')) t), '[]'::jsonb),
    'por_cliente', COALESCE((SELECT jsonb_agg(y ORDER BY (y->>'maquinas')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'pops_client_code', min(r.pops_client_code),
                 'pops_client_code_norm', r.pops_client_code_norm,
                 'client_name', min(r.client_name),
                 'maquinas', count(*),
                 'sem_vinculo', count(*) FILTER (WHERE r.matched_equipment_id IS NULL)) AS y
          FROM public.pops_import_rows r
         WHERE r.batch_id=p_batch_id AND r.resolution <> 'ignorado'
         GROUP BY r.pops_client_code_norm) t2), '[]'::jsonb)
  ) END;
$$;

REVOKE ALL ON FUNCTION public.pops_import_distribution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_import_distribution(uuid) TO authenticated;

-- ==========================================================
-- M2 — RPC: listar linhas / divergências (planilha x Parque)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_import_rows_list(
  p_batch_id  uuid,
  p_status    text DEFAULT NULL,
  p_resolution text DEFAULT NULL,
  p_search    text DEFAULT NULL,
  p_limit     integer DEFAULT 50,
  p_offset    integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total bigint; v_rows jsonb;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.pops_import_rows r
   WHERE r.batch_id = p_batch_id
     AND (p_status IS NULL OR r.match_status = p_status::public.pops_match_status)
     AND (p_resolution IS NULL OR r.resolution = p_resolution::public.pops_row_resolution)
     AND (p_search IS NULL OR r.serial_norm ILIKE '%'||public.pops_norm_serial(p_search)||'%'
          OR r.client_name ILIKE '%'||p_search||'%'
          OR r.pops_client_code ILIKE '%'||p_search||'%');

  SELECT COALESCE(jsonb_agg(j ORDER BY (j->>'row_number')::int), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
               'id', r.id, 'row_number', r.row_number,
               'planilha', jsonb_build_object(
                 'serial_number', r.serial_number, 'pops_client_code', r.pops_client_code,
                 'client_name', r.client_name, 'dealer_location', r.dealer_location,
                 'model', r.model, 'product_series', r.product_series,
                 'manufacture_year', r.manufacture_year, 'platform', r.platform),
               'parque', jsonb_build_object(
                 'equipment_id', r.matched_equipment_id, 'client_code', r.park_client_code,
                 'client_name', r.park_client_name, 'filial_id', r.park_filial_id,
                 'filial_nome', f.nome, 'model', r.park_model, 'serial_chassis', r.park_serial),
               'match_status', r.match_status, 'match_score', r.match_score,
               'match_reason', r.match_reason, 'candidates', r.candidates,
               'client_code_divergence', r.client_code_divergence,
               'resolution', r.resolution, 'confirmed_machine_id', r.confirmed_machine_id
             ) AS j
        FROM public.pops_import_rows r
        LEFT JOIN public.filiais f ON f.id = r.park_filial_id
       WHERE r.batch_id = p_batch_id
         AND (p_status IS NULL OR r.match_status = p_status::public.pops_match_status)
         AND (p_resolution IS NULL OR r.resolution = p_resolution::public.pops_row_resolution)
         AND (p_search IS NULL OR r.serial_norm ILIKE '%'||public.pops_norm_serial(p_search)||'%'
              OR r.client_name ILIKE '%'||p_search||'%'
              OR r.pops_client_code ILIKE '%'||p_search||'%')
       ORDER BY r.row_number
       LIMIT GREATEST(COALESCE(p_limit,50),1) OFFSET GREATEST(COALESCE(p_offset,0),0)
    ) s;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_import_rows_list(uuid,text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_import_rows_list(uuid,text,text,text,integer,integer) TO authenticated;

-- ==========================================================
-- M2 — RPC: resolver linha (confirmar / vincular manual / ignorar / reabrir)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_resolve_import_row(
  p_row_id       uuid,
  p_action       text,                -- 'confirmar' | 'vincular_manual' | 'ignorar' | 'pendente'
  p_equipment_id uuid DEFAULT NULL,
  p_notes        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.pops_import_rows; v_program uuid;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.pops_import_rows WHERE id = p_row_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Linha inexistente'; END IF;
  SELECT program_id INTO v_program FROM public.pops_import_batches WHERE id = v_row.batch_id;

  IF p_action = 'ignorar' THEN
    UPDATE public.pops_import_rows
       SET resolution='ignorado', review_notes=COALESCE(p_notes, review_notes),
           resolved_by=(SELECT auth.uid()), resolved_at=now()
     WHERE id = p_row_id;

  ELSIF p_action = 'pendente' THEN
    UPDATE public.pops_import_rows
       SET resolution='pendente', review_notes=COALESCE(p_notes, review_notes),
           resolved_by=NULL, resolved_at=NULL
     WHERE id = p_row_id;

  ELSIF p_action = 'confirmar' THEN
    IF v_row.matched_equipment_id IS NULL THEN
      RAISE EXCEPTION 'Linha sem vínculo no Parque; use vincular_manual';
    END IF;
    UPDATE public.pops_import_rows
       SET resolution='confirmado', review_notes=COALESCE(p_notes, review_notes),
           resolved_by=(SELECT auth.uid()), resolved_at=now()
     WHERE id = p_row_id;

  ELSIF p_action = 'vincular_manual' THEN
    IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'p_equipment_id obrigatório'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.client_equipment WHERE id = p_equipment_id) THEN
      RAISE EXCEPTION 'Máquina do Parque inexistente';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pops_machines m
                WHERE m.program_id = v_program AND m.equipment_id = p_equipment_id) THEN
      RAISE EXCEPTION 'Máquina já vinculada ao programa POPS';
    END IF;

    UPDATE public.pops_import_rows r
       SET matched_equipment_id = p_equipment_id,
           resolution='vinculado_manual',
           match_status='MATCH_EXATO',
           match_score=99,
           match_reason='Vinculação manual pela gestão',
           candidates='[]'::jsonb,
           review_notes=COALESCE(p_notes, r.review_notes),
           resolved_by=(SELECT auth.uid()), resolved_at=now(),
           park_client_code=e.client_code, park_client_name=e.client_name,
           park_filial_id=e.filial_id, park_model=e.model, park_serial=e.serial_chassis,
           client_code_divergence = (
             r.pops_client_code_norm IS NOT NULL
             AND public.pops_norm_code(e.client_code) IS NOT NULL
             AND public.pops_norm_code(e.client_code) <> r.pops_client_code_norm)
      FROM public.client_equipment e
     WHERE r.id = p_row_id AND e.id = p_equipment_id;
  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action;
  END IF;

  RETURN (SELECT to_jsonb(r) FROM public.pops_import_rows r WHERE r.id = p_row_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_resolve_import_row(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_resolve_import_row(uuid,text,uuid,text) TO authenticated;

-- ==========================================================
-- M2 — RPC: confirmar lote em pops_machines (idempotente)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_confirm_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_program uuid; v_ins integer := 0;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT program_id INTO v_program FROM public.pops_import_batches WHERE id = p_batch_id;
  IF v_program IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;

  WITH elegiveis AS (
    SELECT r.id AS row_id, r.matched_equipment_id, r.pops_client_code_norm
      FROM public.pops_import_rows r
     WHERE r.batch_id = p_batch_id
       AND r.matched_equipment_id IS NOT NULL
       AND r.resolution IN ('confirmado','vinculado_manual')
       AND r.confirmed_machine_id IS NULL
       AND r.match_status <> 'JA_NO_POPS'
  ), ins AS (
    INSERT INTO public.pops_machines (program_id, equipment_id, responsible_user_id,
                                      source, import_batch_id, created_by)
    SELECT v_program, e.matched_equipment_id, ca.rac_user_id,
           'importacao', p_batch_id, (SELECT auth.uid())
      FROM elegiveis e
      LEFT JOIN public.pops_client_assignments ca
             ON ca.program_id = v_program
            AND ca.pops_client_code_norm = e.pops_client_code_norm
    ON CONFLICT (program_id, equipment_id) DO NOTHING
    RETURNING id, equipment_id
  )
  UPDATE public.pops_import_rows r
     SET confirmed_machine_id = ins.id
    FROM ins
   WHERE r.batch_id = p_batch_id AND r.matched_equipment_id = ins.equipment_id;

  SELECT count(*) INTO v_ins FROM public.pops_import_rows
   WHERE batch_id = p_batch_id AND confirmed_machine_id IS NOT NULL;

  UPDATE public.pops_import_batches
     SET status='confirmado', confirmed_by=(SELECT auth.uid()), confirmed_at=now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('maquinas_no_pops', v_ins);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_confirm_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_confirm_import_batch(uuid) TO authenticated;

-- ==========================================================
-- M2 — RPC: atribuir RAC por CLIENTE (chave = código da BASE POPS)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_assign_rac_by_client(
  p_program_id      uuid,
  p_pops_client_code text,
  p_rac_user_id     uuid,
  p_notes           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_norm text := public.pops_norm_code(p_pops_client_code); v_afetadas integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF v_norm IS NULL THEN RAISE EXCEPTION 'Código de cliente inválido'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = p_rac_user_id AND p.approval_status='approved'
       AND p.employment_status='active' AND public.has_role(p.user_id,'rac')
  ) THEN
    RAISE EXCEPTION 'Usuário alvo não é um RAC aprovado e ativo';
  END IF;

  INSERT INTO public.pops_client_assignments (program_id, pops_client_code, pops_client_code_norm,
                                              client_name, rac_user_id, assigned_by, notes)
  SELECT p_program_id, p_pops_client_code, v_norm,
         (SELECT min(r.client_name) FROM public.pops_import_rows r WHERE r.pops_client_code_norm = v_norm),
         p_rac_user_id, (SELECT auth.uid()), p_notes
  ON CONFLICT (program_id, pops_client_code_norm)
  DO UPDATE SET rac_user_id = EXCLUDED.rac_user_id,
                pops_client_code = EXCLUDED.pops_client_code,
                assigned_by = EXCLUDED.assigned_by,
                notes = COALESCE(EXCLUDED.notes, public.pops_client_assignments.notes);

  UPDATE public.pops_machines m
     SET responsible_user_id = p_rac_user_id
   WHERE m.program_id = p_program_id
     AND m.active
     AND EXISTS (
       SELECT 1 FROM public.pops_import_rows r
        WHERE r.confirmed_machine_id = m.id AND r.pops_client_code_norm = v_norm
     );
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;

  RETURN jsonb_build_object('cliente', v_norm, 'maquinas_atualizadas', v_afetadas);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_assign_rac_by_client(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_assign_rac_by_client(uuid,text,uuid,text) TO authenticated;

-- ==========================================================
-- M2 — RPC: atribuir RAC a máquinas (individual / lote)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_assign_rac_machines(
  p_machine_ids uuid[],
  p_rac_user_id uuid,
  p_force       boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conflitos jsonb; v_afetadas integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = p_rac_user_id AND p.approval_status='approved'
       AND p.employment_status='active' AND public.has_role(p.user_id,'rac')
  ) THEN
    RAISE EXCEPTION 'Usuário alvo não é um RAC aprovado e ativo';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'machine_id', m.id, 'pops_client_code_norm', r.pops_client_code_norm,
           'rac_padrao', ca.rac_user_id)), '[]'::jsonb)
    INTO v_conflitos
    FROM public.pops_machines m
    JOIN public.pops_import_rows r ON r.confirmed_machine_id = m.id
    JOIN public.pops_client_assignments ca
      ON ca.program_id = m.program_id AND ca.pops_client_code_norm = r.pops_client_code_norm
   WHERE m.id = ANY(p_machine_ids) AND ca.rac_user_id <> p_rac_user_id;

  IF jsonb_array_length(v_conflitos) > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Divergência com o RAC padrão do cliente. Use p_force=true para ação explícita da gestão. Conflitos: %', v_conflitos;
  END IF;

  UPDATE public.pops_machines
     SET responsible_user_id = p_rac_user_id
   WHERE id = ANY(p_machine_ids) AND active;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;

  -- ação explícita: o padrão do cliente passa a ser o novo RAC
  IF p_force AND jsonb_array_length(v_conflitos) > 0 THEN
    UPDATE public.pops_client_assignments ca
       SET rac_user_id = p_rac_user_id, assigned_by = (SELECT auth.uid())
     WHERE (ca.program_id, ca.pops_client_code_norm) IN (
       SELECT m.program_id, r.pops_client_code_norm
         FROM public.pops_machines m
         JOIN public.pops_import_rows r ON r.confirmed_machine_id = m.id
        WHERE m.id = ANY(p_machine_ids));
  END IF;

  RETURN jsonb_build_object('maquinas_atualizadas', v_afetadas, 'conflitos', v_conflitos, 'forcado', p_force);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_assign_rac_machines(uuid[],uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_assign_rac_machines(uuid[],uuid,boolean) TO authenticated;

-- ==========================================================
-- M2 — RPC: carteira POPS por cliente
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_portfolio_clients(
  p_program_id uuid,
  p_rac_user_id uuid DEFAULT NULL,
  p_filial_id  uuid DEFAULT NULL,
  p_search     text DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope jsonb := public.pops_scope(); v_total bigint; v_rows jsonb;
BEGIN
  IF (v_scope->>'scope') = 'none' THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _tmp_noop() ON COMMIT DROP;

  WITH base AS (
    SELECT r.pops_client_code_norm,
           min(r.pops_client_code) AS pops_client_code,
           min(COALESCE(r.client_name, r.park_client_name)) AS client_name,
           min(f.nome) AS filial_nome,
           m.responsible_user_id,
           count(*) AS maquinas,
           count(*) FILTER (WHERE m.status = 'servicada') AS servicadas,
           count(*) FILTER (WHERE m.status <> 'servicada') AS pendentes
      FROM public.pops_machines m
      JOIN public.pops_import_rows r ON r.confirmed_machine_id = m.id
      LEFT JOIN public.client_equipment e ON e.id = m.equipment_id
      LEFT JOIN public.filiais f ON f.id = e.filial_id
     WHERE m.program_id = p_program_id AND m.active
       AND (p_rac_user_id IS NULL OR m.responsible_user_id = p_rac_user_id)
       AND (p_filial_id IS NULL OR e.filial_id = p_filial_id)
       AND (p_search IS NULL OR COALESCE(r.client_name,'') ILIKE '%'||p_search||'%'
            OR COALESCE(r.pops_client_code,'') ILIKE '%'||p_search||'%')
       AND CASE (v_scope->>'scope')
             WHEN 'global' THEN true
             WHEN 'self'   THEN m.responsible_user_id = (v_scope->>'user_id')::uuid
             WHEN 'filial' THEN EXISTS (
               SELECT 1 FROM public.profiles p
                WHERE p.user_id = m.responsible_user_id
                  AND p.filial_id = (v_scope->>'filial_id')::uuid)
             ELSE false
           END
     GROUP BY r.pops_client_code_norm, m.responsible_user_id
  )
  SELECT count(*),
         COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.maquinas DESC) FILTER (WHERE true), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (SELECT * FROM base ORDER BY maquinas DESC
           LIMIT GREATEST(COALESCE(p_limit,50),1) OFFSET GREATEST(COALESCE(p_offset,0),0)) b;

  RETURN jsonb_build_object('rows', v_rows, 'page_count', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_portfolio_clients(uuid,uuid,uuid,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_portfolio_clients(uuid,uuid,uuid,text,integer,integer) TO authenticated;

-- ==========================================================
-- M2 — RPC: máquinas de um cliente da carteira (dados do Parque)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.pops_portfolio_client_machines(
  p_program_id uuid,
  p_pops_client_code text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope jsonb := public.pops_scope(); v_norm text := public.pops_norm_code(p_pops_client_code);
BEGIN
  IF (v_scope->>'scope') = 'none' THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'pops_machine_id', m.id, 'status', m.status,
             'responsible_user_id', m.responsible_user_id,
             'equipment_id', e.id, 'model', e.model, 'serial_chassis', e.serial_chassis,
             'year', e.year, 'hours', e.hours, 'machine_type', e.machine_type,
             'filial_id', e.filial_id, 'filial_nome', f.nome,
             'park_client_code', e.client_code, 'park_client_name', e.client_name,
             'pops_client_code', r.pops_client_code,
             'client_code_divergence', r.client_code_divergence
           ) ORDER BY e.model NULLS LAST, e.serial_chassis)
      FROM public.pops_machines m
      JOIN public.pops_import_rows r ON r.confirmed_machine_id = m.id
      JOIN public.client_equipment e ON e.id = m.equipment_id
      LEFT JOIN public.filiais f ON f.id = e.filial_id
     WHERE m.program_id = p_program_id AND m.active
       AND r.pops_client_code_norm = v_norm
       AND CASE (v_scope->>'scope')
             WHEN 'global' THEN true
             WHEN 'self'   THEN m.responsible_user_id = (v_scope->>'user_id')::uuid
             WHEN 'filial' THEN EXISTS (
               SELECT 1 FROM public.profiles p
                WHERE p.user_id = m.responsible_user_id
                  AND p.filial_id = (v_scope->>'filial_id')::uuid)
             ELSE false
           END
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_portfolio_client_machines(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_portfolio_client_machines(uuid,text) TO authenticated;
```

Observação técnica: na versão final aplicada removo a linha `CREATE TEMP TABLE IF NOT EXISTS _tmp_noop()` de `pops_portfolio_clients` (resíduo desnecessário) e mantenho a função como `STABLE` puro.

---

## Confirmações

1. **A migration da M2 cria apenas estrutura vazia**: 3 enums, 3 tabelas (`pops_import_batches`, `pops_import_rows`, `pops_client_assignments`), funções de normalização, 10 RPCs, triggers de `updated_at` e índices. Não há um único `INSERT` de dados de negócio.
2. **A nova base POPS não será importada nesta execução.** O upload, a auditoria da base real, o matching e a revisão acontecem na etapa **M2.1**, e nenhuma máquina entra em `pops_machines` sem sua confirmação explícita.
3. **`client_equipment` não é alterada** — apenas leitura, mais um índice funcional sobre o serial normalizado.
4. **`pops_assign_rac_by_filial` não existe** nesta M2 (adiada). A distribuição por filial só será decidida depois de ver os números via `pops_import_distribution`.
5. **Nenhuma RLS fora do prefixo `pops_` é tocada**; sem acesso `anon`; escrita de importação/atribuição restrita a `manager`/`admin`; leitura da carteira por `pops_scope()` (RAC próprio, Supervisor filial, Manager/Admin global). CPA/CSA não entram automaticamente.

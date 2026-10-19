-- Execute todo o script de uma vez no editor SQL, com o papel postgres.
-- Se houver erro ou cancelamento, execute ROLLBACK; antes de continuar.
-- Nenhum resultado abaixo representa um teste já executado.
-- PREPARE guarda um literal na sessão, não em tabelas permanentes.
-- Statements preparados sobrevivem ao ROLLBACK na MESMA conexão.
-- Diferentemente de tabelas TEMP criadas neste lote, preservam a referência.
DO $captura$
DECLARE
  v_original text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_prepared_statements
             WHERE name IN ('sim_park_original', 'sim_park_concluido')) THEN
    RAISE EXCEPTION 'Marcadores de teste anteriores: use uma conexão nova antes de executar.';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_original
  FROM pg_proc p
  WHERE p.oid = 'public.get_equipment_park_paginated(text,uuid,text,text,boolean,text,uuid[],text,text,integer,integer,uuid[],boolean)'::regprocedure;
  EXECUTE format('PREPARE sim_park_original AS SELECT %L::text AS definicao', v_original);
END
$captura$;

-- O marcador de conclusão só será preparado depois de TODOS os testes passarem.
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '10s';

-- =============================================================================
-- Validação de Máquinas — ordenação estável da listagem paginada
-- Única mudança: f.id como último critério de ORDER BY (desempate), mantendo
-- prioridade e data de atualização. Mesma assinatura e retorno: CREATE OR
-- REPLACE preserva as permissões atuais. Filtros, escopo e totais inalterados.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_equipment_park_paginated(
  p_search text DEFAULT NULL, p_filial_id uuid DEFAULT NULL, p_machine_status text DEFAULT NULL,
  p_puk_status text DEFAULT NULL, p_validation_priority boolean DEFAULT NULL, p_machine_type text DEFAULT NULL,
  p_validated_by uuid[] DEFAULT NULL, p_client_code text DEFAULT NULL, p_client_name text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(id uuid, client_code text, client_name text, filial_id uuid, filial_nome text, model text,
  serial_chassis text, hours numeric, year integer, observation text, machine_type text, product_raw text,
  puk_status text, machine_status text, last_validation_at timestamptz, validated_by uuid,
  validation_priority boolean, validation_source text, validation_priority_reason text,
  validation_priority_updated_at timestamptz, previous_client_code text, previous_client_name text,
  transferred_by uuid, transferred_at timestamptz, transfer_observation text, created_at timestamptz,
  updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_machine_type text := NULLIF(BTRIM(COALESCE(p_machine_type, '')), '');
  v_client_code text := NULLIF(BTRIM(COALESCE(p_client_code, '')), '');
  v_client_name text := NULLIF(BTRIM(COALESCE(p_client_name, '')), '');
  v_validated_by uuid[] := CASE WHEN p_validated_by IS NULL OR array_length(p_validated_by, 1) IS NULL THEN NULL ELSE p_validated_by END;
  s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao parque de maquinas';
  END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN QUERY
  WITH filtered AS (
    SELECT ce.* FROM public.client_equipment ce
    WHERE (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
      AND (p_machine_status IS NULL OR ce.machine_status = p_machine_status)
      AND (p_puk_status IS NULL OR ce.puk_status = p_puk_status)
      AND (p_validation_priority IS NULL OR ce.validation_priority = p_validation_priority)
      AND (v_machine_type IS NULL OR ce.machine_type = v_machine_type)
      AND (v_validated_by IS NULL OR ce.validated_by = ANY (v_validated_by))
      AND (v_client_code IS NULL OR ce.client_code = v_client_code)
      AND (v_client_name IS NULL OR ce.client_name ILIKE '%' || v_client_name || '%')
      AND (v_search IS NULL
        OR ce.client_name ILIKE '%' || v_search || '%'
        OR ce.client_code ILIKE '%' || v_search || '%'
        OR ce.model ILIKE '%' || v_search || '%'
        OR ce.serial_chassis ILIKE '%' || v_search || '%')
  ), counted AS (SELECT COUNT(*)::bigint AS total FROM filtered)
  SELECT f.id, f.client_code, f.client_name, f.filial_id, fi.nome, f.model, f.serial_chassis,
    f.hours, f.year, f.observation, f.machine_type, f.product_raw, f.puk_status,
    f.machine_status, f.last_validation_at, f.validated_by, f.validation_priority,
    f.validation_source, f.validation_priority_reason, f.validation_priority_updated_at,
    f.previous_client_code, f.previous_client_name, f.transferred_by, f.transferred_at,
    f.transfer_observation, f.created_at, f.updated_at, c.total
  FROM filtered f CROSS JOIN counted c
  LEFT JOIN public.filiais fi ON fi.id = f.filial_id
  ORDER BY f.validation_priority DESC, f.updated_at DESC, f.id
  LIMIT v_limit OFFSET v_offset;
END $$;

-- Referência independente construída como postgres, somente para comparar os IDs.
-- As chamadas paginadas abaixo serão feitas como authenticated, não como postgres.
CREATE TEMP TABLE sim_casos AS
SELECT 'Todas+Sem filial'::text AS nome, 20195::bigint AS esperado,
       true AS incluir_sem_filial,
       (SELECT array_agg(f.id ORDER BY f.id) FROM public.filiais f) AS filiais
UNION ALL
SELECT 'Querencia+Canarana', 584::bigint, false,
       ARRAY['f131ae2a-ba13-4abf-ab64-dfb7cea5c7e4',
             '5202c983-737b-4f78-a00d-6d9d12f713c3']::uuid[];

CREATE TEMP TABLE sim_esperadas AS
SELECT c.nome AS teste, ce.id
FROM pg_temp.sim_casos c
JOIN public.client_equipment ce
  ON ce.filial_id = ANY(c.filiais)
  OR (c.incluir_sem_filial AND ce.filial_id IS NULL);

CREATE TEMP TABLE sim_exportadas (
  teste text NOT NULL,
  id uuid NOT NULL,
  pagina_offset integer NOT NULL
);
CREATE TEMP TABLE sim_resultados (
  teste text NOT NULL,
  exportadas bigint NOT NULL,
  distintas bigint NOT NULL,
  faltantes bigint NOT NULL,
  extras bigint NOT NULL,
  esperado bigint NOT NULL,
  chamadas integer NOT NULL
);

GRANT SELECT ON pg_temp.sim_casos, pg_temp.sim_esperadas TO authenticated;
GRANT SELECT, INSERT ON pg_temp.sim_exportadas, pg_temp.sim_resultados TO authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"7c4cb176-3730-41de-b1e7-58bdb92da9e9","role":"authenticated"}',
  true
);
-- Também neutraliza eventuais claims individuais preexistentes na sessão.
SELECT set_config('request.jwt.claim.sub', '7c4cb176-3730-41de-b1e7-58bdb92da9e9', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $auth$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM '7c4cb176-3730-41de-b1e7-58bdb92da9e9'::uuid
     OR auth.role() IS DISTINCT FROM 'authenticated'
     OR public.has_role(auth.uid(), 'admin') IS DISTINCT FROM true
     OR public.can_view_equipment_park() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Contexto authenticated/Admin não confirmado; teste interrompido.';
  END IF;
  RAISE NOTICE 'CONTEXTO_ADMIN_AUTHENTICATED_OK';
END
$auth$;

DO $teste$
DECLARE
  c record;
  v_filiais uuid[];
  v_offset integer;
  v_linhas integer;
  v_chamadas integer;
  v_exportadas bigint;
  v_distintas bigint;
  v_faltantes bigint;
  v_extras bigint;
  v_total_banco bigint;
BEGIN
  FOR c IN
    SELECT nome, esperado, incluir_sem_filial, filiais FROM pg_temp.sim_casos
  LOOP
    v_filiais := c.filiais;
    SELECT count(*) INTO v_total_banco
    FROM pg_temp.sim_esperadas e
    WHERE e.teste = c.nome;

    IF v_total_banco <> c.esperado THEN
      RAISE EXCEPTION '%: total atual % diferente do esperado %. Teste interrompido.',
        c.nome, v_total_banco, c.esperado;
    END IF;

    v_offset := 0;
    v_chamadas := 0;
    LOOP
      -- Uma nova chamada da RPC para cada offset; sem reutilizar páginas.
      INSERT INTO pg_temp.sim_exportadas (teste, id, pagina_offset)
      SELECT c.nome, x.id, v_offset
      FROM public.get_equipment_park_paginated(
        p_limit => 200,
        p_offset => v_offset,
        p_filial_ids => v_filiais,
        p_include_sem_filial => c.incluir_sem_filial
      ) x;

      GET DIAGNOSTICS v_linhas = ROW_COUNT;
      v_chamadas := v_chamadas + 1;
      EXIT WHEN v_linhas = 0;
      v_offset := v_offset + 200;

      IF v_offset > c.esperado + 200 THEN
        RAISE EXCEPTION '%: paginação não terminou no limite esperado.', c.nome;
      END IF;
    END LOOP;

    SELECT count(*), count(DISTINCT s.id)
      INTO v_exportadas, v_distintas
    FROM pg_temp.sim_exportadas s
    WHERE s.teste = c.nome;

    SELECT count(*) INTO v_faltantes
    FROM pg_temp.sim_esperadas ce
    WHERE ce.teste = c.nome
      AND NOT EXISTS (
        SELECT 1 FROM pg_temp.sim_exportadas s
        WHERE s.teste = c.nome AND s.id = ce.id
      );

    SELECT count(*) INTO v_extras
    FROM pg_temp.sim_exportadas s
    WHERE s.teste = c.nome
      AND NOT EXISTS (
        SELECT 1 FROM pg_temp.sim_esperadas ce
        WHERE ce.id = s.id AND ce.teste = c.nome
      );

    IF v_exportadas <> v_distintas THEN
      RAISE EXCEPTION '%: % exportadas, % distintas; existem duplicações.',
        c.nome, v_exportadas, v_distintas;
    END IF;
    IF v_faltantes <> 0 THEN
      RAISE EXCEPTION '%: % máquinas faltantes.', c.nome, v_faltantes;
    END IF;
    IF v_exportadas <> c.esperado THEN
      RAISE EXCEPTION '%: % exportadas, esperado %.',
        c.nome, v_exportadas, c.esperado;
    END IF;
    IF v_extras <> 0 THEN
      RAISE EXCEPTION '%: % registros fora da seleção.', c.nome, v_extras;
    END IF;

    INSERT INTO pg_temp.sim_resultados
      (teste, exportadas, distintas, faltantes, extras, esperado, chamadas)
    VALUES
      (c.nome, v_exportadas, v_distintas, v_faltantes, v_extras,
       c.esperado, v_chamadas);
  END LOOP;
  IF (SELECT count(*) FROM pg_temp.sim_resultados) <> 2 THEN
    RAISE EXCEPTION 'Os dois testes completos não foram concluídos.';
  END IF;
  EXECUTE 'PREPARE sim_park_concluido AS SELECT true AS concluido';
END
$teste$;

SELECT teste, exportadas, distintas, exportadas - distintas AS duplicadas,
       faltantes, extras, esperado, chamadas
FROM pg_temp.sim_resultados
ORDER BY teste;

ROLLBACK;

-- Executado novamente no papel original do editor, depois do rollback.
-- O marcador só sai se a conclusão foi atingida e a definição original voltou.
DO $verifica_rollback$
DECLARE
  v_original text;
  v_atual text;
  v_concluido boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_prepared_statements
                 WHERE name = 'sim_park_concluido') THEN
    RAISE EXCEPTION 'Teste incompleto ou com erro: não há confirmação de sucesso.';
  END IF;
  EXECUTE 'EXECUTE sim_park_concluido' INTO v_concluido;
  IF v_concluido IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Teste incompleto ou com erro: não há confirmação de sucesso.';
  END IF;
  EXECUTE 'EXECUTE sim_park_original' INTO STRICT v_original;
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_atual
  FROM pg_proc p
  WHERE p.oid = 'public.get_equipment_park_paginated(text,uuid,text,text,boolean,text,uuid[],text,text,integer,integer,uuid[],boolean)'::regprocedure;
  IF v_atual IS DISTINCT FROM v_original THEN
    RAISE EXCEPTION 'Definição após rollback diferente da original; interromper e investigar.';
  END IF;
  RAISE NOTICE 'DEFINICAO_ORIGINAL_IDENTICA';
  RAISE NOTICE 'SIMULACAO_OK_ROLLBACK';
END
$verifica_rollback$;

-- Limpeza apenas dos statements preparados nesta sessão.
DEALLOCATE sim_park_original;
DEALLOCATE sim_park_concluido;

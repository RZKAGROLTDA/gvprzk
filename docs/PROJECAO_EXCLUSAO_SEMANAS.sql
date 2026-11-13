-- PROPOSTA PARA APROVAÇÃO — NÃO EXECUTADA.
-- Escopo: somente lançamentos semanais da Projeção e seu histórico.
BEGIN;

ALTER TABLE public.projection_entries
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid,
  ADD COLUMN deletion_reason text,
  ADD COLUMN version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT projection_entries_version_valid CHECK (version > 0),
  ADD CONSTRAINT projection_entries_deletion_valid CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL
        AND deletion_reason IS NOT NULL AND length(btrim(deletion_reason)) > 0)
  );

ALTER TABLE public.projection_entry_history
  ADD COLUMN deletion_reason text,
  ADD COLUMN entry_snapshot jsonb,
  ADD CONSTRAINT projection_entry_history_deletion_valid CHECK (
    acao <> 'excluido' OR (
      deletion_reason IS NOT NULL AND length(btrim(deletion_reason)) > 0
      AND entry_snapshot IS NOT NULL AND jsonb_typeof(entry_snapshot) = 'object'
    )
  );

-- Troca apenas a regra de unicidade; nenhum registro é removido.
ALTER TABLE public.projection_entries
  DROP CONSTRAINT projection_entries_filial_id_ano_mes_semana_key;
CREATE UNIQUE INDEX projection_entries_active_week_key
  ON public.projection_entries(filial_id, ano, mes, semana)
  WHERE deleted_at IS NULL;

-- Tabelas continuam fechadas; nenhuma concessão para usuários comuns.
REVOKE ALL ON public.projection_entries, public.projection_entry_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.projection_entries, public.projection_entry_history TO service_role;

CREATE OR REPLACE FUNCTION public.projection_entry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Exclusão física de lançamento não permitida' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'Novo lançamento deve estar ativo na versão inicial' USING ERRCODE='22023';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento excluído é imutável' USING ERRCODE='55000';
  END IF;
  IF (NEW.id,NEW.filial_id,NEW.ano,NEW.mes,NEW.semana,NEW.created_by,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.filial_id,OLD.ano,OLD.mes,OLD.semana,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Identidade e criação do lançamento são imutáveis' USING ERRCODE='55000';
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    IF (NEW.sem_risco,NEW.com_risco,NEW.observacao,NEW.updated_by)
        IS DISTINCT FROM (OLD.sem_risco,OLD.com_risco,OLD.observacao,OLD.updated_by) THEN
      RAISE EXCEPTION 'Exclusão deve preservar os dados originais' USING ERRCODE='55000';
    END IF;
    -- A trigger já existente atualiza updated_at; restaurar a data original na exclusão.
    NEW.updated_at := OLD.updated_at;
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
-- PostgreSQL executa triggers BEFORE em ordem alfabética: guard depois de trg_pe_validate.
CREATE TRIGGER zzzz_projection_entry_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.projection_entries FOR EACH ROW EXECUTE FUNCTION public.projection_entry_guard();

CREATE OR REPLACE FUNCTION public.projection_entry_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_entry public.projection_entries%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Histórico de lançamentos é imutável' USING ERRCODE='55000';
  END IF;
  IF NEW.acao = 'excluido' THEN
    SELECT e.id,e.filial_id,e.ano,e.mes,e.semana,e.sem_risco,e.com_risco,e.observacao,
           e.created_by,e.updated_by,e.created_at,e.updated_at,e.deleted_at,e.deleted_by,
           e.deletion_reason,e.version
      INTO v_entry FROM public.projection_entries e WHERE e.id=NEW.entry_id LIMIT 1;
    IF NOT FOUND OR v_entry.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Histórico de exclusão sem lançamento excluído' USING ERRCODE='22023';
    END IF;
    IF (NEW.filial_id,NEW.ano,NEW.mes,NEW.semana,NEW.sem_risco,NEW.com_risco,NEW.observacao,
        NEW.changed_by,NEW.changed_at,NEW.deletion_reason)
        IS DISTINCT FROM
       (v_entry.filial_id,v_entry.ano,v_entry.mes,v_entry.semana,v_entry.sem_risco,v_entry.com_risco,
        v_entry.observacao,v_entry.deleted_by,v_entry.deleted_at,v_entry.deletion_reason)
       OR NEW.entry_snapshot->'lancamento' IS DISTINCT FROM to_jsonb(v_entry) THEN
      RAISE EXCEPTION 'Snapshot de exclusão inconsistente' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projection_entry_history_immutable BEFORE INSERT OR UPDATE OR DELETE
  ON public.projection_entry_history FOR EACH ROW EXECUTE FUNCTION public.projection_entry_history_guard();
CREATE UNIQUE INDEX projection_entry_history_one_deletion
  ON public.projection_entry_history(entry_id) WHERE acao='excluido';

CREATE OR REPLACE FUNCTION public.projection_save_entry(p_active_filial uuid, p_filial uuid, p_ano integer, p_mes integer, p_semana integer, p_sem_risco numeric, p_com_risco numeric, p_observacao text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope uuid[]; v_id uuid; v_acao text := 'criado';
BEGIN
  IF NOT (public.projection_is_admin() OR (public.projection_role_ok() AND public.has_role(auth.uid(),'supervisor'))) THEN
    RAISE EXCEPTION 'Sem permissão de lançamento' USING ERRCODE='42501'; END IF;
  v_scope := public.projection_scope(p_active_filial);
  IF p_filial IS NULL OR NOT coalesce(p_filial = ANY(v_scope), false) THEN
    RAISE EXCEPTION 'Filial não autorizada' USING ERRCODE='42501'; END IF;
  IF p_sem_risco IS NULL OR p_com_risco IS NULL THEN
    RAISE EXCEPTION 'Informe as duas projeções' USING ERRCODE='22023'; END IF;
  IF NOT public.projection_filial_in(p_filial) THEN
    RAISE EXCEPTION 'Filial fora da Projeção' USING ERRCODE='42501'; END IF;
  IF NOT public.projection_is_admin() AND
      (p_active_filial IS NULL OR p_filial IS DISTINCT FROM p_active_filial) THEN
    RAISE EXCEPTION 'Utilize a Filial Ativa autorizada' USING ERRCODE='42501'; END IF;
  -- Serializa gravações e exclusões da mesma filial/período/semana, mesmo sem linha ativa.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'projection-entry:' || p_filial::text || ':' || p_ano::text || ':' || p_mes::text || ':' || p_semana::text,0));
  SELECT id INTO v_id FROM projection_entries
   WHERE filial_id=p_filial AND ano=p_ano AND mes=p_mes AND semana=p_semana AND deleted_at IS NULL FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO projection_entries(filial_id, ano, mes, semana, sem_risco, com_risco, observacao, created_by, updated_by)
    VALUES (p_filial,p_ano,p_mes,p_semana,p_sem_risco,p_com_risco,nullif(trim(p_observacao),''),auth.uid(),auth.uid())
    RETURNING id INTO v_id;
  ELSE
    v_acao := 'alterado';
    UPDATE projection_entries SET sem_risco=p_sem_risco, com_risco=p_com_risco,
      observacao=nullif(trim(p_observacao),''), updated_by=auth.uid() WHERE id=v_id;
  END IF;
  INSERT INTO projection_entry_history(entry_id, filial_id, ano, mes, semana, sem_risco, com_risco, observacao, acao, changed_by)
  VALUES (v_id,p_filial,p_ano,p_mes,p_semana,p_sem_risco,p_com_risco,nullif(trim(p_observacao),''),v_acao,auth.uid());
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.projection_delete_entry(
  p_active_filial uuid, p_entry_id uuid, p_expected_version bigint, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.projection_entries%ROWTYPE;
  v_scope uuid[];
  v_reason text := nullif(btrim(p_reason),'');
  v_actor uuid := auth.uid();
  v_created_name text; v_updated_name text; v_deleted_name text; v_filial_name text;
BEGIN
  IF NOT (public.projection_is_admin() OR
      (public.projection_role_ok() AND public.has_role(v_actor,'supervisor'))) THEN
    RAISE EXCEPTION 'Sem permissão de exclusão' USING ERRCODE='42501'; END IF;
  IF NOT public.projection_is_admin() AND p_active_filial IS NULL THEN
    RAISE EXCEPTION 'Selecione a Filial Ativa autorizada' USING ERRCODE='42501'; END IF;
  v_scope := public.projection_scope(p_active_filial);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da exclusão' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'Versão do lançamento obrigatória' USING ERRCODE='22023'; END IF;
  SELECT e.id,e.filial_id,e.ano,e.mes,e.semana,e.sem_risco,e.com_risco,e.observacao,
         e.created_by,e.updated_by,e.created_at,e.updated_at,e.deleted_at,e.deleted_by,
         e.deletion_reason,e.version
    INTO v_entry FROM public.projection_entries e
    WHERE e.id=p_entry_id AND e.filial_id=ANY(v_scope)
      AND public.projection_filial_in(e.filial_id) LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento inexistente ou não autorizado' USING ERRCODE='42501'; END IF;
  IF NOT public.projection_is_admin() AND v_entry.filial_id IS DISTINCT FROM p_active_filial THEN
    RAISE EXCEPTION 'Utilize a Filial Ativa autorizada' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'projection-entry:' || v_entry.filial_id::text || ':' || v_entry.ano::text || ':' || v_entry.mes::text || ':' || v_entry.semana::text,0));
  SELECT e.id,e.filial_id,e.ano,e.mes,e.semana,e.sem_risco,e.com_risco,e.observacao,
         e.created_by,e.updated_by,e.created_at,e.updated_at,e.deleted_at,e.deleted_by,
         e.deletion_reason,e.version
    INTO v_entry FROM public.projection_entries e
    WHERE e.id=p_entry_id AND e.filial_id=ANY(v_scope)
      AND public.projection_filial_in(e.filial_id) LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento inexistente ou não autorizado' USING ERRCODE='42501'; END IF;
  IF v_entry.deleted_at IS NOT NULL OR v_entry.version <> p_expected_version THEN
    RAISE EXCEPTION 'Lançamento alterado ou já excluído; atualize a lista' USING ERRCODE='40001'; END IF;
  SELECT pr.name INTO v_created_name FROM public.profiles pr WHERE pr.user_id=v_entry.created_by LIMIT 1;
  SELECT pr.name INTO v_updated_name FROM public.profiles pr WHERE pr.user_id=v_entry.updated_by LIMIT 1;
  SELECT pr.name INTO v_deleted_name FROM public.profiles pr WHERE pr.user_id=v_actor LIMIT 1;
  SELECT f.nome INTO v_filial_name FROM public.filiais f WHERE f.id=v_entry.filial_id LIMIT 1;
  UPDATE public.projection_entries SET deleted_at=clock_timestamp(),deleted_by=v_actor,deletion_reason=v_reason
    WHERE id=v_entry.id
    RETURNING id,filial_id,ano,mes,semana,sem_risco,com_risco,observacao,
      created_by,updated_by,created_at,updated_at,deleted_at,deleted_by,deletion_reason,version INTO v_entry;
  INSERT INTO public.projection_entry_history(entry_id,filial_id,ano,mes,semana,
    sem_risco,com_risco,observacao,acao,changed_by,changed_at,deletion_reason,entry_snapshot)
  VALUES (v_entry.id,v_entry.filial_id,v_entry.ano,v_entry.mes,v_entry.semana,
    v_entry.sem_risco,v_entry.com_risco,v_entry.observacao,'excluido',v_actor,v_entry.deleted_at,v_reason,
    jsonb_build_object('lancamento',to_jsonb(v_entry),'filial_nome',v_filial_name,
      'criador_nome',v_created_name,'editor_nome',v_updated_name,'excluido_por_nome',v_deleted_name));
  RETURN v_entry.id;
END $$;

CREATE OR REPLACE FUNCTION public.get_projection_entries(p_active_filial uuid,p_ano integer,p_mes integer)
RETURNS TABLE(entry_id uuid,filial_id uuid,filial_nome text,semana integer,sem_risco numeric,
  com_risco numeric,observacao text,version bigint,created_by uuid,created_at timestamptz,
  updated_by uuid,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY SELECT e.id,e.filial_id,f.nome::text,e.semana,e.sem_risco,e.com_risco,
    e.observacao,e.version,e.created_by,e.created_at,e.updated_by,e.updated_at
    FROM public.projection_entries e JOIN public.filiais f ON f.id=e.filial_id
    WHERE e.filial_id=ANY(v_scope) AND public.projection_filial_in(e.filial_id)
      AND e.ano=p_ano AND e.mes=p_mes AND e.deleted_at IS NULL
    ORDER BY f.nome,e.semana LIMIT 1000;
END $$;

CREATE OR REPLACE FUNCTION public.get_projection_deleted_entry(p_active_filial uuid,p_entry_id uuid)
RETURNS TABLE(entry_id uuid,snapshot jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY SELECT h.entry_id,h.entry_snapshot FROM public.projection_entry_history h
    WHERE h.entry_id=p_entry_id AND h.acao='excluido' AND h.filial_id=ANY(v_scope)
      AND public.projection_filial_in(h.filial_id) LIMIT 1;
END $$;

CREATE OR REPLACE FUNCTION public.get_projection_panel(p_active_filial uuid, p_ano integer, p_mes integer)
 RETURNS TABLE(filial_id uuid, filial_nome text, divisional text, meta numeric, s1_sem numeric, s1_com numeric, s2_sem numeric, s2_com numeric, s3_sem numeric, s3_com numeric, s4_sem numeric, s4_com numeric, ultima_semana integer, ultima_sem_risco numeric, ultima_com_risco numeric, ultima_atualizacao timestamp with time zone, atualizado_por text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY
  SELECT f.id, f.nome::text, d.divisional, g.meta,
    max(e.sem_risco) FILTER (WHERE e.semana=1), max(e.com_risco) FILTER (WHERE e.semana=1),
    max(e.sem_risco) FILTER (WHERE e.semana=2), max(e.com_risco) FILTER (WHERE e.semana=2),
    max(e.sem_risco) FILTER (WHERE e.semana=3), max(e.com_risco) FILTER (WHERE e.semana=3),
    max(e.sem_risco) FILTER (WHERE e.semana=4), max(e.com_risco) FILTER (WHERE e.semana=4),
    l.semana, l.sem_risco, l.com_risco, l.updated_at, l.autor
  FROM filiais f
  LEFT JOIN projection_filial_divisional d ON d.filial_id=f.id
  LEFT JOIN projection_goals g ON g.filial_id=f.id AND g.ano=p_ano AND g.mes=p_mes
  LEFT JOIN projection_entries e ON e.filial_id=f.id AND e.ano=p_ano AND e.mes=p_mes AND e.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT x.semana, x.sem_risco, x.com_risco, x.updated_at, pr.name::text AS autor
    FROM projection_entries x LEFT JOIN profiles pr ON pr.user_id = x.updated_by
    WHERE x.filial_id=f.id AND x.ano=p_ano AND x.mes=p_mes AND x.deleted_at IS NULL
    ORDER BY x.semana DESC LIMIT 1) l ON true
  WHERE f.id = ANY(v_scope) AND public.projection_filial_in(f.id)
  GROUP BY f.id, f.nome, d.divisional, g.meta, l.semana, l.sem_risco, l.com_risco, l.updated_at, l.autor
  ORDER BY d.divisional NULLS LAST, f.nome;
END $function$;

CREATE OR REPLACE FUNCTION public.get_projection_history(p_active_filial uuid,p_ano integer,p_mes integer)
RETURNS TABLE(tipo text,filial_id uuid,filial_nome text,semana integer,valor_anterior numeric,
  sem_risco numeric,com_risco numeric,observacao text,acao text,autor text,changed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY
  SELECT t.tipo,t.filial_id,t.filial_nome,t.semana,t.valor_anterior,t.sem_risco,t.com_risco,
         t.observacao,t.acao,t.autor,t.changed_at FROM (
    SELECT 'lancamento'::text AS tipo,h.filial_id,
      coalesce(h.entry_snapshot->>'filial_nome',f.nome)::text AS filial_nome,
      h.semana,NULL::numeric AS valor_anterior,h.sem_risco,h.com_risco,
      CASE WHEN h.acao='excluido' THEN concat_ws(' · ',h.observacao,'Motivo da exclusão: '||h.deletion_reason)
        ELSE h.observacao END AS observacao,h.acao,
      coalesce(h.entry_snapshot->>'excluido_por_nome',pr.name)::text AS autor,h.changed_at
    FROM public.projection_entry_history h JOIN public.filiais f ON f.id=h.filial_id
    LEFT JOIN public.profiles pr ON pr.user_id=h.changed_by
    WHERE h.filial_id=ANY(v_scope) AND public.projection_filial_in(h.filial_id) AND h.ano=p_ano AND h.mes=p_mes
    UNION ALL
    SELECT 'meta'::text,h.filial_id,f.nome::text,NULL::integer,h.meta_anterior,h.meta_nova,
      NULL::numeric,NULL::text,h.origem,pr.name::text,h.changed_at
    FROM public.projection_goal_history h JOIN public.filiais f ON f.id=h.filial_id
    LEFT JOIN public.profiles pr ON pr.user_id=h.changed_by
    WHERE h.filial_id=ANY(v_scope) AND public.projection_filial_in(h.filial_id) AND h.ano=p_ano AND h.mes=p_mes
  ) t ORDER BY t.changed_at DESC LIMIT 500;
END $$;

-- UUID do registro e snapshot para identificar a exclusão na interface, sem alterar o histórico antigo.
CREATE OR REPLACE FUNCTION public.get_projection_deletions(p_active_filial uuid,p_ano integer,p_mes integer)
RETURNS TABLE(entry_id uuid,filial_id uuid,semana integer,snapshot jsonb,changed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY SELECT h.entry_id,h.filial_id,h.semana,h.entry_snapshot,h.changed_at
    FROM public.projection_entry_history h WHERE h.filial_id=ANY(v_scope)
      AND public.projection_filial_in(h.filial_id) AND h.ano=p_ano AND h.mes=p_mes AND h.acao='excluido'
    ORDER BY h.changed_at DESC LIMIT 500;
END $$;

REVOKE ALL ON FUNCTION public.projection_entry_guard(),public.projection_entry_history_guard()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.projection_delete_entry(uuid,uuid,bigint,text),
  public.get_projection_entries(uuid,integer,integer),public.get_projection_deleted_entry(uuid,uuid),
  public.get_projection_deletions(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.projection_delete_entry(uuid,uuid,bigint,text),
  public.get_projection_entries(uuid,integer,integer),public.get_projection_deleted_entry(uuid,uuid),
  public.get_projection_deletions(uuid,integer,integer) TO authenticated,service_role;
-- CREATE OR REPLACE preserva as permissões das funções antigas.
COMMIT;

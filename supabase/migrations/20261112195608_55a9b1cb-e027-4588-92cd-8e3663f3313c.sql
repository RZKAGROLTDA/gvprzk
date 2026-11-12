CREATE TABLE public.projection_filial_divisional (
  filial_id uuid PRIMARY KEY REFERENCES public.filiais(id) ON DELETE CASCADE,
  divisional text,
  incluida boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.projection_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id uuid NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
  ano int NOT NULL, mes int NOT NULL,
  meta numeric(16,2) NOT NULL,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filial_id, ano, mes)
);
CREATE TABLE public.projection_goal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.projection_goals(id) ON DELETE CASCADE,
  filial_id uuid NOT NULL, ano int NOT NULL, mes int NOT NULL,
  meta_anterior numeric(16,2), meta_nova numeric(16,2) NOT NULL,
  origem text NOT NULL DEFAULT 'manual',
  changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.projection_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id uuid NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
  ano int NOT NULL, mes int NOT NULL, semana int NOT NULL,
  sem_risco numeric(16,2) NOT NULL,
  com_risco numeric(16,2) NOT NULL,
  observacao text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filial_id, ano, mes, semana)
);
CREATE TABLE public.projection_entry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.projection_entries(id) ON DELETE CASCADE,
  filial_id uuid NOT NULL, ano int NOT NULL, mes int NOT NULL, semana int NOT NULL,
  sem_risco numeric(16,2) NOT NULL, com_risco numeric(16,2) NOT NULL,
  observacao text, acao text NOT NULL,
  changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.projection_entries (ano, mes);
CREATE INDEX ON public.projection_goals (ano, mes);
CREATE INDEX ON public.projection_entry_history (filial_id, ano, mes);
CREATE INDEX ON public.projection_goal_history (filial_id, ano, mes);

REVOKE ALL ON public.projection_filial_divisional, public.projection_goals,
  public.projection_goal_history, public.projection_entries,
  public.projection_entry_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.projection_filial_divisional, public.projection_goals,
  public.projection_goal_history, public.projection_entries,
  public.projection_entry_history TO service_role;

ALTER TABLE public.projection_filial_divisional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_goal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_entry_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.projection_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_approved_user() AND public.has_role(auth.uid(),'admin')
$$;

CREATE OR REPLACE FUNCTION public.projection_role_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_approved_user() AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'supervisor'))
$$;

CREATE OR REPLACE FUNCTION public.projection_filial_in(p_filial uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM filiais f LEFT JOIN projection_filial_divisional d ON d.filial_id=f.id
    WHERE f.id=p_filial AND regexp_replace(lower(f.nome),'\s','','g') <> 'televendas'
      AND coalesce(d.incluida, true))
$$;

CREATE OR REPLACE FUNCTION public.projection_scope(p_filial_id uuid)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_allowed uuid[]; v_sel uuid;
BEGIN
  IF NOT public.projection_role_ok() THEN
    RAISE EXCEPTION 'Sem acesso à Projeção' USING ERRCODE='42501'; END IF;
  IF p_filial_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM filiais WHERE id=p_filial_id) THEN
    RAISE EXCEPTION 'Filial inexistente' USING ERRCODE='42501'; END IF;
  IF public.projection_is_admin() THEN
    IF p_filial_id IS NOT NULL THEN RETURN ARRAY[p_filial_id]; END IF;
    RETURN (SELECT coalesce(array_agg(id), '{}'::uuid[]) FROM filiais);
  END IF;
  v_allowed := public.get_user_filial_ids_internal(auth.uid());
  v_sel := coalesce(p_filial_id,
    (SELECT filial_id FROM profiles WHERE user_id=auth.uid()
      AND approval_status='approved' AND employment_status='active' LIMIT 1));
  IF v_sel IS NULL OR NOT coalesce(v_sel = ANY(coalesce(v_allowed,'{}'::uuid[])), false) THEN
    RAISE EXCEPTION 'Filial não autorizada' USING ERRCODE='42501'; END IF;
  RETURN ARRAY[v_sel];
END $$;

CREATE OR REPLACE FUNCTION public.projection_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'projection_filial_divisional' THEN
    IF NEW.divisional IS NOT NULL AND NEW.divisional NOT IN ('MT','GO','PA') THEN
      RAISE EXCEPTION 'Divisional inválida'; END IF;
  ELSE
    IF NEW.mes NOT BETWEEN 1 AND 12 OR NEW.ano NOT BETWEEN 2020 AND 2100 THEN
      RAISE EXCEPTION 'Mês/ano inválido'; END IF;
    IF TG_TABLE_NAME = 'projection_goals' AND NEW.meta < 0 THEN
      RAISE EXCEPTION 'Meta inválida'; END IF;
    IF TG_TABLE_NAME = 'projection_entries' AND (NEW.semana NOT BETWEEN 1 AND 4
       OR NEW.sem_risco < 0 OR NEW.com_risco < 0) THEN
      RAISE EXCEPTION 'Semana ou valor inválido'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pfd_validate BEFORE INSERT OR UPDATE ON public.projection_filial_divisional FOR EACH ROW EXECUTE FUNCTION public.projection_validate();
CREATE TRIGGER trg_pg_validate  BEFORE INSERT OR UPDATE ON public.projection_goals   FOR EACH ROW EXECUTE FUNCTION public.projection_validate();
CREATE TRIGGER trg_pe_validate  BEFORE INSERT OR UPDATE ON public.projection_entries FOR EACH ROW EXECUTE FUNCTION public.projection_validate();

CREATE OR REPLACE FUNCTION public.projection_set_divisional(p_filial uuid, p_divisional text, p_incluida boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.projection_is_admin() THEN
    RAISE EXCEPTION 'Somente administrador' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM filiais WHERE id=p_filial AND regexp_replace(lower(nome),'\s','','g')='televendas') THEN
    RAISE EXCEPTION 'Filial fora da Projeção' USING ERRCODE='42501'; END IF;
  INSERT INTO projection_filial_divisional(filial_id, divisional, incluida, updated_by)
  VALUES (p_filial, nullif(p_divisional,''), coalesce(p_incluida,true), auth.uid())
  ON CONFLICT (filial_id) DO UPDATE SET divisional=EXCLUDED.divisional,
    incluida=EXCLUDED.incluida, updated_by=auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.projection_upsert_goals(p_rows jsonb, p_origem text DEFAULT 'manual')
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_old numeric; v_id uuid; n int := 0;
BEGIN
  IF NOT public.projection_is_admin() THEN
    RAISE EXCEPTION 'Somente administrador' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Formato inválido' USING ERRCODE='22023'; END IF;
  IF coalesce(p_origem,'manual') NOT IN ('manual','importacao') THEN
    RAISE EXCEPTION 'Origem inválida' USING ERRCODE='22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF (r->>'meta') IS NULL OR (r->>'filial_id') IS NULL OR (r->>'ano') IS NULL OR (r->>'mes') IS NULL THEN
      RAISE EXCEPTION 'Linha de meta incompleta' USING ERRCODE='22023'; END IF;
    IF NOT public.projection_filial_in((r->>'filial_id')::uuid) THEN
      RAISE EXCEPTION 'Filial fora da Projeção' USING ERRCODE='42501'; END IF;
    SELECT id, meta INTO v_id, v_old FROM projection_goals
     WHERE filial_id=(r->>'filial_id')::uuid AND ano=(r->>'ano')::int AND mes=(r->>'mes')::int FOR UPDATE;
    IF v_id IS NULL THEN
      INSERT INTO projection_goals(filial_id, ano, mes, meta, created_by, updated_by)
      VALUES ((r->>'filial_id')::uuid,(r->>'ano')::int,(r->>'mes')::int,(r->>'meta')::numeric,auth.uid(),auth.uid())
      RETURNING id INTO v_id;
    ELSIF v_old IS DISTINCT FROM (r->>'meta')::numeric THEN
      UPDATE projection_goals SET meta=(r->>'meta')::numeric, updated_by=auth.uid() WHERE id=v_id;
    ELSE v_id := NULL; END IF;
    IF v_id IS NOT NULL THEN
      INSERT INTO projection_goal_history(goal_id, filial_id, ano, mes, meta_anterior, meta_nova, origem, changed_by)
      VALUES (v_id,(r->>'filial_id')::uuid,(r->>'ano')::int,(r->>'mes')::int,v_old,(r->>'meta')::numeric,
              coalesce(p_origem,'manual'),auth.uid());
      n := n + 1;
    END IF;
    v_id := NULL; v_old := NULL;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.projection_save_entry(
  p_active_filial uuid, p_filial uuid, p_ano int, p_mes int, p_semana int,
  p_sem_risco numeric, p_com_risco numeric, p_observacao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  SELECT id INTO v_id FROM projection_entries
   WHERE filial_id=p_filial AND ano=p_ano AND mes=p_mes AND semana=p_semana FOR UPDATE;
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
END $$;

CREATE OR REPLACE FUNCTION public.get_projection_panel(p_active_filial uuid, p_ano int, p_mes int)
RETURNS TABLE(filial_id uuid, filial_nome text, divisional text, meta numeric,
  s1_sem numeric, s1_com numeric, s2_sem numeric, s2_com numeric,
  s3_sem numeric, s3_com numeric, s4_sem numeric, s4_com numeric,
  ultima_semana int, ultima_sem_risco numeric, ultima_com_risco numeric,
  ultima_atualizacao timestamptz, atualizado_por text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  LEFT JOIN projection_entries e ON e.filial_id=f.id AND e.ano=p_ano AND e.mes=p_mes
  LEFT JOIN LATERAL (
    SELECT x.semana, x.sem_risco, x.com_risco, x.updated_at, pr.name::text AS autor
    FROM projection_entries x LEFT JOIN profiles pr ON pr.user_id = x.updated_by
    WHERE x.filial_id=f.id AND x.ano=p_ano AND x.mes=p_mes
    ORDER BY x.semana DESC LIMIT 1) l ON true
  WHERE f.id = ANY(v_scope) AND public.projection_filial_in(f.id)
  GROUP BY f.id, f.nome, d.divisional, g.meta, l.semana, l.sem_risco, l.com_risco, l.updated_at, l.autor
  ORDER BY d.divisional NULLS LAST, f.nome;
END $$;

CREATE OR REPLACE FUNCTION public.get_projection_history(p_active_filial uuid, p_ano int, p_mes int)
RETURNS TABLE(tipo text, filial_id uuid, filial_nome text, semana int, valor_anterior numeric,
  sem_risco numeric, com_risco numeric, observacao text, acao text, autor text, changed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 'lancamento'::text, h.filial_id, f.nome::text, h.semana, NULL::numeric, h.sem_risco, h.com_risco,
           h.observacao, h.acao, pr.name::text, h.changed_at
      FROM projection_entry_history h JOIN filiais f ON f.id=h.filial_id
      LEFT JOIN profiles pr ON pr.user_id=h.changed_by
     WHERE h.filial_id = ANY(v_scope) AND public.projection_filial_in(h.filial_id) AND h.ano=p_ano AND h.mes=p_mes
    UNION ALL
    SELECT 'meta'::text, h.filial_id, f.nome::text, NULL::int, h.meta_anterior, h.meta_nova, NULL::numeric,
           NULL::text, h.origem, pr.name::text, h.changed_at
      FROM projection_goal_history h JOIN filiais f ON f.id=h.filial_id
      LEFT JOIN profiles pr ON pr.user_id=h.changed_by
     WHERE h.filial_id = ANY(v_scope) AND public.projection_filial_in(h.filial_id) AND h.ano=p_ano AND h.mes=p_mes
  ) t ORDER BY 11 DESC LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.get_projection_filiais()
RETURNS TABLE(filial_id uuid, filial_nome text, divisional text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.projection_is_admin() THEN
    RAISE EXCEPTION 'Somente administrador' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT f.id, f.nome::text, d.divisional FROM filiais f
    LEFT JOIN projection_filial_divisional d ON d.filial_id=f.id
   WHERE public.projection_filial_in(f.id) ORDER BY f.nome;
END $$;

REVOKE ALL ON FUNCTION public.projection_set_divisional(uuid,text,boolean),
  public.projection_upsert_goals(jsonb,text),
  public.projection_save_entry(uuid,uuid,int,int,int,numeric,numeric,text),
  public.get_projection_panel(uuid,int,int),
  public.get_projection_history(uuid,int,int),
  public.get_projection_filiais(),
  public.projection_scope(uuid), public.projection_role_ok(), public.projection_is_admin(),
  public.projection_filial_in(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.projection_scope(uuid), public.projection_role_ok(),
  public.projection_is_admin(), public.projection_filial_in(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.projection_set_divisional(uuid,text,boolean),
  public.projection_upsert_goals(jsonb,text),
  public.projection_save_entry(uuid,uuid,int,int,int,numeric,numeric,text),
  public.get_projection_panel(uuid,int,int),
  public.get_projection_history(uuid,int,int),
  public.get_projection_filiais() TO authenticated;
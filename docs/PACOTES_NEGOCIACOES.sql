-- PROPOSTA PARA APROVAÇÃO. NÃO EXECUTADA.
-- Base oficial verificada: clients_master.id (UUID); responsável: profiles.user_id (UUID UNIQUE).
-- Não altera nenhuma tabela, política ou função existente.
BEGIN;

CREATE TABLE public.projection_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id uuid NOT NULL REFERENCES public.filiais(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients_master(id) ON DELETE RESTRICT,
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  ano integer NOT NULL,
  mes integer NOT NULL,
  titulo text NOT NULL,
  valor numeric(18,2) NOT NULL,
  situacao text NOT NULL,
  observacoes text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT projection_negotiations_year_valid CHECK (ano BETWEEN 2020 AND 2100),
  CONSTRAINT projection_negotiations_month_valid CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT projection_negotiations_version_valid CHECK (version > 0),
  CONSTRAINT projection_negotiations_value_valid CHECK (valor >= 0 AND valor < 10000000000000000 AND valor::text NOT IN ('NaN','Infinity','-Infinity')),
  CONSTRAINT projection_negotiations_required_text CHECK (length(btrim(titulo)) > 0 AND length(btrim(situacao)) > 0)
);
GRANT ALL ON public.projection_negotiations TO service_role;
ALTER TABLE public.projection_negotiations ENABLE ROW LEVEL SECURITY;
-- Sem políticas de acesso direto: usuários comuns usam somente as RPCs abaixo.

CREATE TABLE public.projection_negotiation_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  negotiation_id uuid NOT NULL REFERENCES public.projection_negotiations(id) ON DELETE RESTRICT,
  ano integer NOT NULL,
  mes integer NOT NULL,
  version bigint NOT NULL,
  acao text NOT NULL,
  valor_anterior numeric(18,2),
  valor_novo numeric(18,2) NOT NULL,
  situacao_anterior text,
  situacao_nova text NOT NULL,
  responsible_user_id_anterior uuid,
  responsible_user_id_novo uuid NOT NULL,
  responsible_name_anterior text,
  responsible_name_novo text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projection_negotiation_history_version_unique UNIQUE (negotiation_id,version),
  CONSTRAINT projection_negotiation_history_period_valid CHECK (ano BETWEEN 2020 AND 2100 AND mes BETWEEN 1 AND 12),
  CONSTRAINT projection_negotiation_history_version_valid CHECK (version > 0),
  CONSTRAINT projection_negotiation_history_value_valid CHECK (
    valor_novo >= 0 AND valor_novo < 10000000000000000 AND valor_novo::text NOT IN ('NaN','Infinity','-Infinity')
    AND (valor_anterior IS NULL OR (valor_anterior >= 0 AND valor_anterior < 10000000000000000 AND valor_anterior::text NOT IN ('NaN','Infinity','-Infinity')))),
  CONSTRAINT projection_negotiation_history_required_text CHECK (
    length(btrim(situacao_nova)) > 0 AND length(btrim(responsible_name_novo)) > 0 AND length(btrim(changed_by_name)) > 0),
  CONSTRAINT projection_negotiation_history_state_valid CHECK (
    (acao='criado' AND version=1 AND valor_anterior IS NULL AND situacao_anterior IS NULL
      AND responsible_user_id_anterior IS NULL AND responsible_name_anterior IS NULL AND dados_anteriores IS NULL)
    OR (acao='alterado' AND version>1 AND valor_anterior IS NOT NULL AND situacao_anterior IS NOT NULL
      AND length(btrim(situacao_anterior))>0 AND responsible_user_id_anterior IS NOT NULL
      AND responsible_name_anterior IS NOT NULL AND length(btrim(responsible_name_anterior))>0 AND dados_anteriores IS NOT NULL)),
  CONSTRAINT projection_negotiation_history_snapshot_valid CHECK (coalesce((
    jsonb_typeof(dados_novos)='object'
    AND dados_novos ?& ARRAY['client_id','cliente','codigo_cliente','responsible_user_id','responsavel','titulo','valor','situacao','observacoes']
    AND nullif(btrim(dados_novos->>'cliente'),'') IS NOT NULL
    AND nullif(btrim(dados_novos->>'client_id'),'') IS NOT NULL
    AND nullif(btrim(dados_novos->>'codigo_cliente'),'') IS NOT NULL
    AND nullif(btrim(dados_novos->>'titulo'),'') IS NOT NULL
    AND dados_novos->>'responsavel'=responsible_name_novo
    AND dados_novos->>'responsible_user_id'=responsible_user_id_novo::text
    AND dados_novos->>'situacao'=situacao_nova
    AND dados_novos->'valor'=to_jsonb(valor_novo)
    AND (dados_anteriores IS NULL OR (
      jsonb_typeof(dados_anteriores)='object'
      AND dados_anteriores ?& ARRAY['client_id','cliente','codigo_cliente','responsible_user_id','responsavel','titulo','valor','situacao','observacoes']
      AND nullif(btrim(dados_anteriores->>'cliente'),'') IS NOT NULL
      AND nullif(btrim(dados_anteriores->>'client_id'),'') IS NOT NULL
      AND nullif(btrim(dados_anteriores->>'codigo_cliente'),'') IS NOT NULL
      AND nullif(btrim(dados_anteriores->>'titulo'),'') IS NOT NULL
      AND dados_anteriores->>'responsavel'=responsible_name_anterior
      AND dados_anteriores->>'responsible_user_id'=responsible_user_id_anterior::text
      AND dados_anteriores->>'situacao'=situacao_anterior
      AND dados_anteriores->'valor'=to_jsonb(valor_anterior)))),false))
);
GRANT ALL ON public.projection_negotiation_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.projection_negotiation_history_id_seq TO service_role;
ALTER TABLE public.projection_negotiation_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.projection_negotiations, public.projection_negotiation_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.projection_negotiation_history_id_seq FROM PUBLIC, anon, authenticated;
CREATE INDEX projection_negotiations_period_idx ON public.projection_negotiations(ano,mes,filial_id,id);
CREATE INDEX projection_negotiation_history_entry_idx ON public.projection_negotiation_history(negotiation_id,id);

CREATE FUNCTION public.projection_negotiation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ano NOT BETWEEN 2020 AND 2100 OR NEW.mes NOT BETWEEN 1 AND 12
     OR nullif(btrim(NEW.titulo),'') IS NULL OR nullif(btrim(NEW.situacao),'') IS NULL
     OR NEW.valor::text IN ('NaN','Infinity','-Infinity') OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Dados da negociação inválidos' USING ERRCODE='22023';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.filial_id IS DISTINCT FROM OLD.filial_id
       OR NEW.ano IS DISTINCT FROM OLD.ano OR NEW.mes IS DISTINCT FROM OLD.mes
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Identidade e período da negociação não podem ser alterados' USING ERRCODE='22023';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER projection_negotiation_guard BEFORE INSERT OR UPDATE ON public.projection_negotiations
FOR EACH ROW EXECUTE FUNCTION public.projection_negotiation_guard();

CREATE FUNCTION public.projection_negotiation_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Histórico de negociação imutável' USING ERRCODE='42501'; END $$;
CREATE TRIGGER projection_negotiation_history_immutable BEFORE UPDATE OR DELETE ON public.projection_negotiation_history
FOR EACH ROW EXECUTE FUNCTION public.projection_negotiation_history_immutable();

-- Pesquisa na base oficial: só usuários com acesso à Projeção e filial autorizada.
-- A base mestre já é compartilhada com usuários aprovados/ativos; não há filial no cadastro mestre.
CREATE FUNCTION public.search_projection_negotiation_clients(p_active_filial uuid,p_filial uuid,p_query text,p_after uuid DEFAULT NULL)
RETURNS TABLE(id uuid,client_code text,client_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial); v_query text := btrim(coalesce(p_query,''));
BEGIN
  IF NOT coalesce(p_filial=ANY(v_scope),false) OR NOT public.projection_filial_in(p_filial) THEN
    RAISE EXCEPTION 'Filial não autorizada' USING ERRCODE='42501';
  END IF;
  IF length(v_query)<2 THEN RETURN; END IF;
  RETURN QUERY SELECT c.id,c.client_code,c.client_name FROM public.clients_master c
    WHERE c.active AND (p_after IS NULL OR c.id>p_after)
      AND (strpos(lower(c.client_name),lower(v_query))>0 OR strpos(lower(c.client_code),lower(v_query))>0)
    ORDER BY c.id LIMIT 50;
END $$;

CREATE FUNCTION public.get_projection_negotiation_responsibles(p_active_filial uuid,p_filial uuid,p_after uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid,nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[] := public.projection_scope(p_active_filial);
BEGIN
  IF NOT coalesce(p_filial=ANY(v_scope),false) OR NOT public.projection_filial_in(p_filial) THEN
    RAISE EXCEPTION 'Filial não autorizada' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT p.user_id,p.name FROM public.profiles p
    WHERE p.approval_status='approved' AND p.employment_status='active'
      AND coalesce(p_filial=ANY(public.get_user_filial_ids_internal(p.user_id)),false)
      AND (p_after IS NULL OR p.user_id>p_after)
    ORDER BY p.user_id LIMIT 500;
END $$;

CREATE FUNCTION public.projection_save_negotiation(
  p_active_filial uuid,p_filial uuid,p_ano integer,p_mes integer,p_client_id uuid,
  p_responsible_user_id uuid,p_titulo text,p_valor numeric,p_situacao text,p_observacoes text,
  p_id uuid DEFAULT NULL,p_expected_version bigint DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_scope uuid[]; v_old public.projection_negotiations; v_new public.projection_negotiations;
  v_old_data jsonb; v_new_data jsonb; v_author text; v_responsible text; v_old_responsible text;
  v_client_name text; v_client_code text;
BEGIN
  IF NOT (public.projection_is_admin() OR (public.projection_role_ok() AND public.has_role(auth.uid(),'supervisor'))) THEN
    RAISE EXCEPTION 'Sem permissão para alterar negociações' USING ERRCODE='42501';
  END IF;
  v_scope:=public.projection_scope(p_active_filial);
  IF NOT coalesce(p_filial=ANY(v_scope),false) OR NOT public.projection_filial_in(p_filial) THEN
    RAISE EXCEPTION 'Filial não autorizada' USING ERRCODE='42501';
  END IF;
  IF p_ano IS NULL OR p_ano NOT BETWEEN 2020 AND 2100 OR p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12
     OR nullif(btrim(p_titulo),'') IS NULL OR nullif(btrim(p_situacao),'') IS NULL
     OR p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Informe cliente, responsável, identificação, valor e situação válidos' USING ERRCODE='22023';
  END IF;
  IF p_valor<0 OR p_valor>=10000000000000000 OR p_valor<>round(p_valor,2) THEN
    RAISE EXCEPTION 'Valor inválido: use reais com até duas casas decimais' USING ERRCODE='22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT n.id,n.filial_id,n.client_id,n.responsible_user_id,n.ano,n.mes,n.titulo,n.valor,n.situacao,n.observacoes,
      n.created_by,n.updated_by,n.created_at,n.updated_at,n.version INTO v_old
      FROM public.projection_negotiations n WHERE n.id=p_id FOR UPDATE;
    IF v_old.id IS NULL OR v_old.filial_id<>p_filial OR v_old.ano<>p_ano OR v_old.mes<>p_mes THEN
      RAISE EXCEPTION 'Negociação não autorizada' USING ERRCODE='42501';
    END IF;
    IF p_expected_version IS DISTINCT FROM v_old.version THEN
      RAISE EXCEPTION 'Outra pessoa atualizou a negociação. Abra novamente antes de salvar.' USING ERRCODE='40001';
    END IF;
    -- Estado anterior é exatamente o snapshot persistido da versão bloqueada.
    -- Nunca reconstruir nomes anteriores usando cadastros que podem ter sido renomeados.
    SELECT h.dados_novos INTO v_old_data FROM public.projection_negotiation_history h
      WHERE h.negotiation_id=v_old.id AND h.version=v_old.version LIMIT 1;
    IF v_old_data IS NULL OR v_old_data->>'client_id' IS DISTINCT FROM v_old.client_id::text
      OR v_old_data->>'responsible_user_id' IS DISTINCT FROM v_old.responsible_user_id::text
      OR v_old_data->'valor' IS DISTINCT FROM to_jsonb(v_old.valor)
      OR v_old_data->>'situacao' IS DISTINCT FROM v_old.situacao
      OR v_old_data->>'titulo' IS DISTINCT FROM v_old.titulo
      OR v_old_data->>'observacoes' IS DISTINCT FROM v_old.observacoes THEN
      RAISE EXCEPTION 'Snapshot histórico da versão atual ausente ou inconsistente' USING ERRCODE='23514';
    END IF;
    v_old_responsible:=v_old_data->>'responsavel';
  END IF;
  -- Um cliente/responsável desativado já vinculado pode ser mantido; novas escolhas exigem cadastro ativo.
  IF NOT EXISTS(SELECT 1 FROM public.clients_master c WHERE c.id=p_client_id
    AND (c.active OR (v_old.id IS NOT NULL AND v_old.client_id=p_client_id))) THEN
    RAISE EXCEPTION 'Selecione um cliente cadastrado ativo' USING ERRCODE='22023';
  END IF;
  SELECT p.name INTO v_responsible FROM public.profiles p WHERE p.user_id=p_responsible_user_id
    AND ((p.approval_status='approved' AND p.employment_status='active'
      AND coalesce(p_filial=ANY(public.get_user_filial_ids_internal(p.user_id)),false))
      OR (v_old.id IS NOT NULL AND v_old.responsible_user_id=p_responsible_user_id));
  IF v_responsible IS NULL THEN RAISE EXCEPTION 'Responsável não autorizado para esta filial' USING ERRCODE='42501'; END IF;
  -- Mantendo o vínculo, conservar o nome original do snapshot também no novo estado.
  IF v_old.id IS NOT NULL AND v_old.responsible_user_id=p_responsible_user_id THEN
    v_responsible:=v_old_responsible;
  END IF;
  IF v_old.id IS NOT NULL AND v_old.client_id=p_client_id THEN
    v_client_name:=v_old_data->>'cliente';
    v_client_code:=v_old_data->>'codigo_cliente';
  ELSE
    SELECT c.client_name,c.client_code INTO v_client_name,v_client_code
      FROM public.clients_master c WHERE c.id=p_client_id LIMIT 1;
  END IF;
  SELECT p.name INTO v_author FROM public.profiles p WHERE p.user_id=auth.uid() LIMIT 1;
  IF v_old.id IS NULL THEN
    INSERT INTO public.projection_negotiations(filial_id,client_id,responsible_user_id,ano,mes,titulo,valor,situacao,observacoes,created_by,updated_by)
    VALUES(p_filial,p_client_id,p_responsible_user_id,p_ano,p_mes,btrim(p_titulo),p_valor,btrim(p_situacao),nullif(btrim(p_observacoes),''),auth.uid(),auth.uid())
    RETURNING id,filial_id,client_id,responsible_user_id,ano,mes,titulo,valor,situacao,observacoes,created_by,updated_by,created_at,updated_at,version INTO v_new;
  ELSE
    IF ROW(v_old.client_id,v_old.responsible_user_id,v_old.titulo,v_old.valor,v_old.situacao,v_old.observacoes)
      IS NOT DISTINCT FROM ROW(p_client_id,p_responsible_user_id,btrim(p_titulo),p_valor,btrim(p_situacao),nullif(btrim(p_observacoes),'')) THEN RETURN v_old.id; END IF;
    UPDATE public.projection_negotiations SET client_id=p_client_id,responsible_user_id=p_responsible_user_id,
      titulo=btrim(p_titulo),valor=p_valor,situacao=btrim(p_situacao),observacoes=nullif(btrim(p_observacoes),''),updated_by=auth.uid()
      WHERE id=v_old.id
      RETURNING id,filial_id,client_id,responsible_user_id,ano,mes,titulo,valor,situacao,observacoes,created_by,updated_by,created_at,updated_at,version INTO v_new;
  END IF;
  v_new_data:=jsonb_build_object('client_id',v_new.client_id,'cliente',v_client_name,'codigo_cliente',v_client_code,
    'responsible_user_id',v_new.responsible_user_id,'responsavel',v_responsible,
    'titulo',v_new.titulo,'valor',v_new.valor,'situacao',v_new.situacao,'observacoes',v_new.observacoes);
  INSERT INTO public.projection_negotiation_history(negotiation_id,ano,mes,version,acao,valor_anterior,valor_novo,situacao_anterior,situacao_nova,
    responsible_user_id_anterior,responsible_user_id_novo,responsible_name_anterior,responsible_name_novo,
    dados_anteriores,dados_novos,changed_by,changed_by_name)
  VALUES(v_new.id,v_new.ano,v_new.mes,v_new.version,CASE WHEN v_old.id IS NULL THEN 'criado' ELSE 'alterado' END,v_old.valor,v_new.valor,v_old.situacao,v_new.situacao,
    v_old.responsible_user_id,v_new.responsible_user_id,v_old_responsible,v_responsible,
    v_old_data,v_new_data,auth.uid(),coalesce(v_author,auth.uid()::text));
  RETURN v_new.id;
END $$;

CREATE FUNCTION public.get_projection_negotiations(p_active_filial uuid,p_ano integer,p_mes integer,p_after uuid DEFAULT NULL)
RETURNS TABLE(id uuid,filial_id uuid,filial_nome text,divisional text,ano integer,mes integer,
  client_id uuid,client_code text,client_name text,valor numeric,responsible_user_id uuid,responsible_name text,
  titulo text,situacao text,observacoes text,updated_by uuid,autor text,created_at timestamptz,updated_at timestamptz,version bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[]:=public.projection_scope(p_active_filial);
BEGIN
  RETURN QUERY SELECT n.id,n.filial_id,f.nome::text,d.divisional::text,n.ano,n.mes,
    n.client_id,c.client_code,c.client_name,n.valor,n.responsible_user_id,r.name::text,
    n.titulo,n.situacao,n.observacoes,n.updated_by,a.name::text,n.created_at,n.updated_at,n.version
    FROM public.projection_negotiations n JOIN public.filiais f ON f.id=n.filial_id
    JOIN public.clients_master c ON c.id=n.client_id JOIN public.profiles r ON r.user_id=n.responsible_user_id
    LEFT JOIN public.projection_filial_divisional d ON d.filial_id=n.filial_id
    LEFT JOIN public.profiles a ON a.user_id=n.updated_by
    WHERE n.filial_id=ANY(v_scope) AND public.projection_filial_in(n.filial_id)
      AND n.ano=p_ano AND n.mes=p_mes AND (p_after IS NULL OR n.id>p_after)
    ORDER BY n.id LIMIT 500;
END $$;

CREATE FUNCTION public.get_projection_negotiation_history(p_active_filial uuid,p_id uuid,p_after bigint DEFAULT NULL)
RETURNS TABLE(id bigint,acao text,valor_anterior numeric,valor_novo numeric,situacao_anterior text,situacao_nova text,
  responsible_user_id_anterior uuid,responsible_user_id_novo uuid,responsible_name_anterior text,responsible_name_novo text,
  dados_anteriores jsonb,dados_novos jsonb,changed_by uuid,autor text,changed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scope uuid[]:=public.projection_scope(p_active_filial);
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.projection_negotiations n WHERE n.id=p_id AND n.filial_id=ANY(v_scope)
    AND public.projection_filial_in(n.filial_id)) THEN RAISE EXCEPTION 'Negociação não autorizada' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT h.id,h.acao,h.valor_anterior,h.valor_novo,h.situacao_anterior,h.situacao_nova,
    h.responsible_user_id_anterior,h.responsible_user_id_novo,h.responsible_name_anterior,h.responsible_name_novo,
    h.dados_anteriores,h.dados_novos,h.changed_by,h.changed_by_name,h.created_at
    FROM public.projection_negotiation_history h WHERE h.negotiation_id=p_id AND (p_after IS NULL OR h.id>p_after)
    ORDER BY h.id LIMIT 500;
END $$;

REVOKE ALL ON FUNCTION public.projection_negotiation_guard(), public.projection_negotiation_history_immutable() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION
 public.search_projection_negotiation_clients(uuid,uuid,text,uuid),
 public.get_projection_negotiation_responsibles(uuid,uuid,uuid),
 public.projection_save_negotiation(uuid,uuid,integer,integer,uuid,uuid,text,numeric,text,text,uuid,bigint),
 public.get_projection_negotiations(uuid,integer,integer,uuid),
 public.get_projection_negotiation_history(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION
 public.search_projection_negotiation_clients(uuid,uuid,text,uuid),
 public.get_projection_negotiation_responsibles(uuid,uuid,uuid),
 public.projection_save_negotiation(uuid,uuid,integer,integer,uuid,uuid,text,numeric,text,text,uuid,bigint),
 public.get_projection_negotiations(uuid,integer,integer,uuid),
 public.get_projection_negotiation_history(uuid,uuid,bigint) TO authenticated,service_role;
COMMIT;
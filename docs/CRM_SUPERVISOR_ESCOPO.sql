-- =====================================================================
-- CRM — ESCOPO ÚNICO DO SUPERVISOR (PROPOSTA PARA APROVAÇÃO — NÃO EXECUTADO)
-- ---------------------------------------------------------------------
-- Regra única da filial operacional (igual à listagem get_secure_tasks_paginated):
--   1) filial do último acompanhamento (task_followups) com filial;
--   2) na ausência, filial de quem criou (task_access_metadata.creator_filial_id).
-- Supervisor: detalhe/localização, fotos, documentos, produtos e lembretes
-- só liberados se a filial operacional = Filial Ativa autorizada.
-- Nenhum caminho por get_user_filial_ids (união), filial principal, criador
-- ou tasks.filial. Demais cargos: regras atuais preservadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Filial Ativa no servidor (contexto para a policy do Storage)
-- O Storage não recebe p_filial_id. A Filial Ativa passa a ser gravada no
-- servidor somente via RPC, que valida com effective_filial_ids (42501 se
-- não autorizada). O usuário não grava a tabela diretamente; ele só pode
-- escolher entre as filiais que já lhe são autorizadas — o mesmo poder que
-- já tem no seletor. Sem registro => filial principal (nunca a união).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_active_filial (
  user_id    uuid PRIMARY KEY,
  filial_id  uuid NOT NULL REFERENCES public.filiais(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_active_filial TO authenticated;
GRANT ALL ON public.user_active_filial TO service_role;
ALTER TABLE public.user_active_filial ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_active_filial_select_own ON public.user_active_filial
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Sem policies de INSERT/UPDATE/DELETE: escrita apenas pela RPC abaixo.

CREATE OR REPLACE FUNCTION public.set_active_filial(p_filial_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_uid uuid := auth.uid(); v_ids uuid[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_approved_user() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_filial_id IS NULL THEN
    DELETE FROM public.user_active_filial WHERE user_id = v_uid;
    RETURN NULL;
  END IF;
  v_ids := public.effective_filial_ids(p_filial_id); -- 42501 se não autorizada
  INSERT INTO public.user_active_filial(user_id, filial_id, updated_at)
  VALUES (v_uid, p_filial_id, now())
  ON CONFLICT (user_id) DO UPDATE SET filial_id = EXCLUDED.filial_id, updated_at = now();
  RETURN p_filial_id;
END $f$;
REVOKE ALL ON FUNCTION public.set_active_filial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_filial(uuid) TO authenticated;

-- Escopo do servidor: Filial Ativa gravada, revalidada a cada uso
-- (se o vínculo foi desativado, cai para a filial principal; nunca soma).
CREATE OR REPLACE FUNCTION public.server_active_scope()
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_fid uuid;
BEGIN
  SELECT a.filial_id INTO v_fid FROM public.user_active_filial a WHERE a.user_id = auth.uid();
  IF v_fid IS NOT NULL AND NOT public.user_can_access_filial(v_fid) THEN
    v_fid := NULL;
  END IF;
  RETURN public.effective_filial_ids(v_fid);
EXCEPTION WHEN others THEN
  RETURN '{}'::uuid[];
END $f$;
REVOKE ALL ON FUNCTION public.server_active_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_active_scope() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Filial operacional (regra única)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_operational_filial_id(p_task_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE(
    (SELECT tf.filial_id FROM public.task_followups tf
      WHERE tf.task_id = p_task_id AND tf.filial_id IS NOT NULL
      ORDER BY tf.created_at DESC, tf.id DESC LIMIT 1),
    (SELECT tam.creator_filial_id FROM public.task_access_metadata tam
      WHERE tam.task_id = p_task_id LIMIT 1))
$f$;
REVOKE ALL ON FUNCTION public.task_operational_filial_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_operational_filial_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.task_op_filial_in(p_task_id uuid, p_ids uuid[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT coalesce(array_length(p_ids,1),0) > 0
     AND public.task_operational_filial_id(p_task_id) = ANY(p_ids)
$f$;
REVOKE ALL ON FUNCTION public.task_op_filial_in(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_op_filial_in(uuid, uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Detalhe/localização (get_secure_task_by_id): troca apenas a condição
--    do Supervisor (tasks.filial -> filial operacional da Filial Ativa).
-- ---------------------------------------------------------------------
DO $d$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.get_secure_task_by_id(uuid, uuid)'::regprocedure);
  IF position('public.supervisor_task_filial_ok(t.filial, p_filial_id)' in v) = 0 THEN
    RAISE EXCEPTION 'get_secure_task_by_id: trecho do supervisor não encontrado';
  END IF;
  EXECUTE replace(v, 'public.supervisor_task_filial_ok(t.filial, p_filial_id)',
                     'public.task_op_filial_in(t.id, public.effective_filial_ids(p_filial_id))');
END $d$;

-- ---------------------------------------------------------------------
-- 4. get_secure_task_media — versão antiga (uuid) REMOVIDA; só existe a nova.
--    Supervisor: Filial Ativa validada antes de qualquer liberação,
--    inclusive para atividades próprias.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_secure_task_media(uuid);
CREATE OR REPLACE FUNCTION public.get_secure_task_media(p_task_id uuid, p_filial_id uuid DEFAULT NULL)
RETURNS TABLE(photos text[], documents text[], technical_visit_data jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '10s' AS $f$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text; v_is_approved boolean; v_is_active boolean; v_scope uuid[];
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  SELECT p.role, (p.approval_status = 'approved'), (COALESCE(p.employment_status, 'active') = 'active')
    INTO v_user_role, v_is_approved, v_is_active
  FROM profiles p WHERE p.user_id = v_user_id;
  IF NOT COALESCE(v_is_approved, false) OR NOT COALESCE(v_is_active, false) THEN RETURN; END IF;

  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY SELECT t.photos, t.documents, t.technical_visit_data FROM tasks t WHERE t.id = p_task_id LIMIT 1;
    RETURN;
  END IF;

  IF v_user_role = 'supervisor' THEN
    v_scope := public.effective_filial_ids(p_filial_id); -- 42501 se não autorizada
    IF NOT public.task_op_filial_in(p_task_id, v_scope) THEN RETURN; END IF;
    RETURN QUERY SELECT t.photos, t.documents, t.technical_visit_data FROM tasks t WHERE t.id = p_task_id LIMIT 1;
    RETURN;
  END IF;

  -- Demais cargos: inalterado (somente atividades próprias).
  RETURN QUERY SELECT t.photos, t.documents, t.technical_visit_data FROM tasks t
  WHERE t.id = p_task_id AND t.created_by = v_user_id LIMIT 1;
END;
$f$;
REVOKE ALL ON FUNCTION public.get_secure_task_media(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secure_task_media(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Storage (fotos) — Supervisor pela Filial Ativa do servidor.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_media_object(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_task_id uuid; v_created_by uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_approved_user() THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') THEN RETURN true; END IF;
  BEGIN
    v_task_id := split_part(p_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  SELECT t.created_by INTO v_created_by FROM public.tasks t WHERE t.id = v_task_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'supervisor') THEN
    RETURN public.task_op_filial_in(v_task_id, public.server_active_scope());
  END IF;
  RETURN v_created_by = auth.uid();  -- demais cargos: inalterado
END;
$f$;

-- Policy de leitura: a exceção "owner = auth.uid()" deixa de valer para
-- Supervisor (fotos próprias só pela Filial Ativa). Demais cargos: inalterado.
DROP POLICY IF EXISTS media_photos_select ON storage.objects;
CREATE POLICY media_photos_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['task-photos','product-photos'])
  AND public.is_active_approved_user()
  AND (
    public.can_access_media_object(name)
    OR (owner = auth.uid() AND NOT public.has_role(auth.uid(), 'supervisor'))
  )
);

-- ---------------------------------------------------------------------
-- 6. Produtos e lembretes — ativo/aprovado; Supervisor pela Filial Ativa
--    do servidor, sem caminhos alternativos. RAC/CPA/CSA e demais: inalterado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_task_related_data(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_created_by uuid; v_task_filial text; v_role text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_approved_user() THEN RETURN false; END IF;
  SELECT t.created_by, t.filial INTO v_created_by, v_task_filial FROM public.tasks t WHERE t.id = p_task_id;
  IF v_created_by IS NULL THEN RETURN false; END IF;
  v_role := public.get_user_role();
  IF v_role IN ('manager','admin') THEN RETURN true; END IF;
  IF v_role = 'supervisor' THEN
    RETURN public.task_op_filial_in(p_task_id, public.server_active_scope());
  END IF;
  IF auth.uid() = v_created_by THEN RETURN true; END IF;
  IF v_role IN ('rac','cpa','csa') THEN
    IF EXISTS (SELECT 1 FROM public.profiles p1 JOIN public.profiles p2 ON p2.user_id = v_created_by
               WHERE p1.user_id = auth.uid() AND p1.filial_id IS NOT NULL AND p1.filial_id = p2.filial_id) THEN
      RETURN true;
    END IF;
    IF v_task_filial IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles p1 JOIN public.filiais f ON f.id = p1.filial_id
      WHERE p1.user_id = auth.uid() AND p1.approval_status = 'approved' AND f.nome = v_task_filial) THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$f$;

-- ---------------------------------------------------------------------
-- 7. Verificação pós-aplicação (leitura): deve restar só a versão (uuid, uuid)
-- SELECT oid::regprocedure FROM pg_proc WHERE proname = 'get_secure_task_media';
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 8. Criação de atividade pelo Supervisor: filial operacional = Filial Ativa
--    validada no servidor (antes: sempre a filial principal do perfil).
--    UPDATE de atividade de Supervisor preserva a filial já gravada
--    (atividades históricas não são recalculadas). Demais cargos: inalterado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_task_access_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_scope uuid[]; v_fid uuid; v_is_sup boolean;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_is_sup := NEW.created_by IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.created_by AND ur.role = 'supervisor');
    IF v_is_sup AND TG_OP = 'UPDATE'
       AND EXISTS (SELECT 1 FROM public.task_access_metadata m
                   WHERE m.task_id = NEW.id AND m.created_by = NEW.created_by) THEN
      RETURN NEW; -- preserva filial operacional de origem
    END IF;
    IF v_is_sup AND TG_OP = 'INSERT' AND NEW.created_by = auth.uid() THEN
      v_scope := public.server_active_scope();
      IF coalesce(array_length(v_scope,1),0) = 1 THEN v_fid := v_scope[1]; END IF;
    END IF;
    INSERT INTO task_access_metadata (task_id, created_by, creator_filial_id, creator_approval_status)
    SELECT NEW.id, NEW.created_by, COALESCE(v_fid, p.filial_id), p.approval_status
    FROM profiles p WHERE p.user_id = NEW.created_by
    ON CONFLICT (task_id) DO UPDATE SET
      created_by = EXCLUDED.created_by,
      creator_filial_id = EXCLUDED.creator_filial_id,
      creator_approval_status = EXCLUDED.creator_approval_status,
      updated_at = now();
  END IF;
  RETURN NEW;
END $f$;

-- ---------------------------------------------------------------------
-- 9. Painel de Emergência (get_secure_task_data): Supervisor somente pela
--    Filial Ativa validada no servidor. Manager/Admin e demais: inalterado.
-- ---------------------------------------------------------------------
DO $d$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.get_secure_task_data(uuid)'::regprocedure);
  IF position($s$current_user_role = 'supervisor' AND user_filial_id = task_creator_filial$s$ in v) = 0 THEN
    RAISE EXCEPTION 'get_secure_task_data: trecho do supervisor não encontrado';
  END IF;
  v := replace(v, $s$current_user_role = 'supervisor' AND user_filial_id = task_creator_filial$s$,
    $s$current_user_role = 'supervisor' AND public.task_op_filial_in(task_id_param, public.server_active_scope())$s$);
  -- Supervisor fora da Filial Ativa não cai no nível 'limited' por filial principal.
  v := replace(v, $s$ELSIF user_filial_id = task_creator_filial THEN$s$,
    $s$ELSIF current_user_role <> 'supervisor' AND user_filial_id = task_creator_filial THEN$s$);
  EXECUTE v;
END $d$;

-- ---------------------------------------------------------------------
-- 10. RLS de leitura de tasks: Supervisor somente pela Filial Ativa do
--     servidor (sem união de filiais e sem exceção de "próprias").
--     Admin/Gerente e demais cargos: inalterado.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS secure_task_select_enhanced ON public.tasks;
CREATE POLICY secure_task_select_enhanced ON public.tasks FOR SELECT
USING (
  ((created_by = (SELECT auth.uid())) AND NOT (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role)))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR ((SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
      AND public.task_op_filial_in(id, public.server_active_scope()))
);

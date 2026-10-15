-- =====================================================================
-- CRM SUPERVISOR — ESCOPO PELA FILIAL ATIVA (VERSÃO DEFINITIVA)
-- ---------------------------------------------------------------------
-- Migração única e atômica (executada em uma transação: entra tudo ou nada).
-- Sem alteração de dados históricos, cargos, vínculos ou perfis.
--
-- Regras:
--  * Supervisor enxerga somente a Filial Ativa gravada no servidor
--    (set_active_filial), validada contra as filiais autorizadas.
--  * Sem Filial Ativa válida: somente a filial principal. Nunca a união.
--  * Filial operacional da atividade: filial do último acompanhamento com
--    filial; na ausência, filial de quem criou (task_access_metadata).
--  * p_filial_id enviado pelas telas não pode contornar a Filial Ativa.
--  * Admin/Gerente e demais cargos: regras atuais preservadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Filial Ativa no servidor
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_active_filial (
  user_id    uuid PRIMARY KEY,
  filial_id  uuid NOT NULL REFERENCES public.filiais(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_active_filial TO authenticated;
GRANT ALL ON public.user_active_filial TO service_role;
ALTER TABLE public.user_active_filial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_active_filial_select_own ON public.user_active_filial;
CREATE POLICY user_active_filial_select_own ON public.user_active_filial
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Sem policies de escrita: gravação somente pela RPC abaixo.

CREATE OR REPLACE FUNCTION public.set_active_filial(p_filial_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_approved_user() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_filial_id IS NULL THEN
    DELETE FROM public.user_active_filial WHERE user_id = v_uid;
    RETURN NULL;
  END IF;
  -- Validação explícita: a filial precisa estar entre as autorizadas
  -- (globais podem escolher qualquer filial existente).
  IF NOT EXISTS (SELECT 1 FROM public.filiais f WHERE f.id = p_filial_id) THEN
    RAISE EXCEPTION 'Filial inexistente' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager'))
     AND NOT (p_filial_id = ANY (public.get_user_filial_ids_internal(v_uid))) THEN
    RAISE EXCEPTION 'Acesso negado: filial não autorizada' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.user_active_filial(user_id, filial_id, updated_at)
  VALUES (v_uid, p_filial_id, now())
  ON CONFLICT (user_id) DO UPDATE SET filial_id = EXCLUDED.filial_id, updated_at = now();
  RETURN p_filial_id;
END $f$;
REVOKE ALL ON FUNCTION public.set_active_filial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_filial(uuid) TO authenticated;

-- Escopo do servidor: uma única filial. Revalida a cada uso.
CREATE OR REPLACE FUNCTION public.server_active_scope()
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_uid uuid := auth.uid(); v_fid uuid; v_primary uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_approved_user() THEN
    RETURN '{}'::uuid[];
  END IF;
  SELECT a.filial_id INTO v_fid FROM public.user_active_filial a WHERE a.user_id = v_uid;
  IF v_fid IS NOT NULL AND v_fid = ANY (public.get_user_filial_ids_internal(v_uid)) THEN
    RETURN ARRAY[v_fid];
  END IF;
  SELECT p.filial_id INTO v_primary FROM public.profiles p
   WHERE p.user_id = v_uid AND p.approval_status = 'approved' AND p.employment_status = 'active';
  RETURN CASE WHEN v_primary IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_primary] END;
END $f$;
REVOKE ALL ON FUNCTION public.server_active_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_active_scope() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Filial operacional e escopo do Supervisor
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

-- Uma atividade está no escopo do Supervisor logado?
CREATE OR REPLACE FUNCTION public.task_in_supervisor_scope(p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT coalesce(public.task_operational_filial_id(p_task_id) = ANY (public.server_active_scope()), false)
$f$;
REVOKE ALL ON FUNCTION public.task_in_supervisor_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_in_supervisor_scope(uuid) TO authenticated, service_role;

-- Otimização: conjunto de atividades da Filial Ativa, calculado uma vez
-- por consulta (usado nas policies em vez de checagem linha a linha).
CREATE OR REPLACE FUNCTION public.supervisor_scope_task_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH s AS (
    SELECT public.server_active_scope() AS ids
    WHERE public.has_role(auth.uid(), 'supervisor')
  ),
  lf AS (
    SELECT DISTINCT ON (tf.task_id) tf.task_id, tf.filial_id
      FROM public.task_followups tf
     WHERE tf.task_id IS NOT NULL AND tf.filial_id IS NOT NULL
     ORDER BY tf.task_id, tf.created_at DESC, tf.id DESC
  )
  SELECT lf.task_id FROM lf, s WHERE lf.filial_id = ANY (s.ids)
  UNION
  SELECT m.task_id FROM public.task_access_metadata m, s
   WHERE m.creator_filial_id = ANY (s.ids)
     AND NOT EXISTS (SELECT 1 FROM public.task_followups tf
                      WHERE tf.task_id = m.task_id AND tf.filial_id IS NOT NULL)
$f$;
REVOKE ALL ON FUNCTION public.supervisor_scope_task_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_scope_task_ids() TO authenticated, service_role;

-- Atividade própria recém-criada (antes do gatilho de metadados).
CREATE OR REPLACE FUNCTION public.filial_name_in_active_scope(p_filial text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT p_filial IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.filiais f
    WHERE f.id = ANY (public.server_active_scope())
      AND lower(trim(f.nome)) = lower(trim(p_filial)))
$f$;
REVOKE ALL ON FUNCTION public.filial_name_in_active_scope(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.filial_name_in_active_scope(text) TO authenticated, service_role;

-- Parâmetro das telas: só é aceito se for a própria Filial Ativa do servidor.
CREATE OR REPLACE FUNCTION public.assert_supervisor_param(p_filial_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF p_filial_id IS NOT NULL AND NOT (p_filial_id = ANY (public.server_active_scope())) THEN
    RAISE EXCEPTION 'Acesso negado: filial diferente da Filial Ativa' USING ERRCODE = '42501';
  END IF;
END $f$;
REVOKE ALL ON FUNCTION public.assert_supervisor_param(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_supervisor_param(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Detalhe/localização: get_secure_task_by_id (apenas ramo do Supervisor)
-- ---------------------------------------------------------------------
DO $d$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.get_secure_task_by_id(uuid, uuid)'::regprocedure);
  IF position('public.supervisor_task_filial_ok(t.filial, p_filial_id)' in v) = 0 THEN
    RAISE EXCEPTION 'get_secure_task_by_id: trecho do supervisor não encontrado';
  END IF;
  v := replace(v, $s$IF v_user_role = 'supervisor' THEN
    RETURN QUERY$s$, $s$IF v_user_role = 'supervisor' THEN
    PERFORM public.assert_supervisor_param(p_filial_id);
    RETURN QUERY$s$);
  IF position('assert_supervisor_param' in v) = 0 THEN
    RAISE EXCEPTION 'get_secure_task_by_id: ramo do supervisor não encontrado';
  END IF;
  v := replace(v, 'public.supervisor_task_filial_ok(t.filial, p_filial_id)',
                  'public.task_in_supervisor_scope(t.id)');
  EXECUTE v;
END $d$;

-- ---------------------------------------------------------------------
-- 4. Mídia: versão antiga (uuid) removida; nova (uuid, uuid).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_secure_task_media(uuid);
CREATE OR REPLACE FUNCTION public.get_secure_task_media(p_task_id uuid, p_filial_id uuid DEFAULT NULL)
RETURNS TABLE(photos text[], documents text[], technical_visit_data jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '10s' AS $f$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text; v_is_approved boolean; v_is_active boolean;
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
    PERFORM public.assert_supervisor_param(p_filial_id);
    IF NOT public.task_in_supervisor_scope(p_task_id) THEN RETURN; END IF;
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
-- 5. Storage (fotos guardadas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_media_object(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_task_id uuid; v_created_by uuid;
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
    RETURN public.task_in_supervisor_scope(v_task_id);
  END IF;
  RETURN v_created_by = auth.uid();  -- demais cargos: inalterado
END;
$f$;
REVOKE ALL ON FUNCTION public.can_access_media_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_media_object(text) TO authenticated, service_role;

-- Leitura: a exceção "owner = auth.uid()" não vale para Supervisor
-- (fotos próprias só na Filial Ativa). Demais cargos: inalterado.
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
-- 6. Produtos e lembretes (leitura)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_task_related_data(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_created_by uuid; v_task_filial text; v_role text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_approved_user() THEN RETURN false; END IF;
  SELECT t.created_by, t.filial INTO v_created_by, v_task_filial FROM public.tasks t WHERE t.id = p_task_id;
  IF v_created_by IS NULL THEN RETURN false; END IF;
  v_role := public.get_user_role();
  IF v_role IN ('manager','admin') THEN RETURN true; END IF;
  IF v_role = 'supervisor' THEN
    RETURN public.task_in_supervisor_scope(p_task_id);
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
-- 7. Criação de atividade pelo Supervisor na Filial Ativa
--    UPDATE de atividade de Supervisor preserva a filial já gravada.
--    Demais cargos: inalterado.
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
      RETURN NEW;
    END IF;
    IF v_is_sup AND TG_OP = 'INSERT' AND NEW.created_by = auth.uid() THEN
      v_scope := public.server_active_scope();
      IF coalesce(array_length(v_scope, 1), 0) = 1 THEN v_fid := v_scope[1]; END IF;
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
-- 8. Painel de emergência (get_secure_task_data)
--    Continua SECURITY INVOKER (a RLS de tasks é o teto). Supervisor fora
--    da Filial Ativa: nenhuma linha. Falha do registro de auditoria não
--    derruba a consulta. Demais cargos: níveis de acesso inalterados.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_secure_task_data(task_id_param uuid)
RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, email text, sales_value numeric, is_masked boolean)
LANGUAGE plpgsql SET search_path TO '' AS $f$
DECLARE
  current_user_role text;
  user_filial_id uuid;
  task_creator_filial uuid;
  access_level text;
BEGIN
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF current_user_role = 'supervisor' AND NOT public.task_in_supervisor_scope(task_id_param) THEN
    RETURN;
  END IF;

  SELECT p.filial_id INTO task_creator_filial
  FROM public.tasks t JOIN public.profiles p ON t.created_by = p.user_id
  WHERE t.id = task_id_param;

  IF current_user_role = 'manager' THEN
    access_level := 'full';
  ELSIF current_user_role = 'supervisor' THEN
    access_level := 'full';
  ELSIF user_filial_id = task_creator_filial THEN
    access_level := 'limited';
  ELSE
    access_level := 'none';
  END IF;

  BEGIN
    PERFORM public.secure_log_security_event(
      'secure_task_data_access', auth.uid(),
      jsonb_build_object('task_id', task_id_param, 'access_level', access_level, 'user_role', current_user_role), 2);
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN QUERY
  SELECT t.id, t.name, t.responsible,
    CASE WHEN access_level = 'full' THEN t.client
         WHEN access_level = 'limited' THEN LEFT(t.client, 3) || '***' ELSE '***' END,
    CASE WHEN access_level = 'full' THEN t.property
         WHEN access_level = 'limited' THEN LEFT(t.property, 3) || '***' ELSE '***' END,
    t.filial,
    CASE WHEN access_level = 'full' THEN t.email ELSE '***@***.***' END,
    CASE WHEN access_level = 'full' THEN t.sales_value
         WHEN access_level = 'limited' THEN CASE WHEN t.sales_value > 25000 THEN NULL ELSE t.sales_value END
         ELSE NULL END,
    (access_level != 'full')
  FROM public.tasks t WHERE t.id = task_id_param;
END;
$f$;
REVOKE ALL ON FUNCTION public.get_secure_task_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secure_task_data(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. Policies: ramo do Supervisor passa a usar a Filial Ativa do servidor.
--    Ramos de Admin/Gerente e dos demais cargos ficam como estão.
-- ---------------------------------------------------------------------
-- 9.1 tasks (leitura)
DROP POLICY IF EXISTS secure_task_select_enhanced ON public.tasks;
CREATE POLICY secure_task_select_enhanced ON public.tasks FOR SELECT
USING (
  ((created_by = (SELECT auth.uid())) AND NOT (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role)))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR ((SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
      AND (id IN (SELECT public.supervisor_scope_task_ids())
           OR (created_by = (SELECT auth.uid())
               AND NOT EXISTS (SELECT 1 FROM public.task_access_metadata m WHERE m.task_id = tasks.id)
               AND public.filial_name_in_active_scope(filial))))
);

-- 9.2 task_followups
DROP POLICY IF EXISTS task_followups_select ON public.task_followups;
CREATE POLICY task_followups_select ON public.task_followups FOR SELECT
USING (
  (responsible_user_id = (SELECT auth.uid()) AND NOT (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role)))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR ((SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
      AND filial_id = ANY ((SELECT public.server_active_scope())))
);
DROP POLICY IF EXISTS task_followups_update ON public.task_followups;
CREATE POLICY task_followups_update ON public.task_followups FOR UPDATE
USING (
  (responsible_user_id = (SELECT auth.uid()) AND NOT (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role)))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR ((SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
      AND filial_id = ANY ((SELECT public.server_active_scope())))
)
WITH CHECK (
  (responsible_user_id = (SELECT auth.uid()) AND NOT (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role)))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR ((SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
      AND filial_id = ANY ((SELECT public.server_active_scope())))
);
DROP POLICY IF EXISTS task_followups_insert ON public.task_followups;
CREATE POLICY task_followups_insert ON public.task_followups FOR INSERT
WITH CHECK (
  (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR ((SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role))
      AND filial_id = ANY ((SELECT public.server_active_scope())))
  OR (responsible_user_id = (SELECT auth.uid()) AND created_by = (SELECT auth.uid())
      AND NOT (SELECT public.has_role((SELECT auth.uid()), 'supervisor'::app_role)))
);

-- 9.3 task_access_metadata (leitura)
DROP POLICY IF EXISTS task_access_metadata_select ON public.task_access_metadata;
CREATE POLICY task_access_metadata_select ON public.task_access_metadata FOR SELECT TO authenticated
USING (
  (created_by = auth.uid() AND NOT public.has_role(auth.uid(), 'supervisor'::app_role))
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND task_id IN (SELECT public.supervisor_scope_task_ids()))
);

-- 9.4 opportunities
DROP POLICY IF EXISTS opportunities_select_with_supervisor_filial_access ON public.opportunities;
CREATE POLICY opportunities_select_with_supervisor_filial_access ON public.opportunities FOR SELECT
USING (
  public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.has_role(auth.uid(), 'supervisor'::app_role)
      AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = opportunities.task_id AND t.created_by = auth.uid()))
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND task_id IN (SELECT public.supervisor_scope_task_ids()))
);
DROP POLICY IF EXISTS "Users can create opportunities for their tasks" ON public.opportunities;
CREATE POLICY "Users can create opportunities for their tasks" ON public.opportunities FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = opportunities.task_id
          AND ((t.created_by = auth.uid() AND NOT public.has_role(auth.uid(), 'supervisor'::app_role))
               OR public.has_role(auth.uid(), 'manager'::app_role)
               OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.task_in_supervisor_scope(t.id))))
);
DROP POLICY IF EXISTS "Users can update opportunities for their tasks" ON public.opportunities;
CREATE POLICY "Users can update opportunities for their tasks" ON public.opportunities FOR UPDATE TO authenticated
USING (public.can_view_opportunity(id)
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)))
WITH CHECK (public.can_view_opportunity(id)
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)));

-- 9.5 opportunity_items
DROP POLICY IF EXISTS opportunity_items_access ON public.opportunity_items;
CREATE POLICY opportunity_items_access ON public.opportunity_items FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.opportunities o JOIN public.tasks t ON t.id = o.task_id
          WHERE o.id = opportunity_items.opportunity_id
            AND ((t.created_by = auth.uid() AND NOT public.has_role(auth.uid(), 'supervisor'::app_role))
                 OR public.has_role(auth.uid(), 'manager'::app_role)
                 OR public.has_role(auth.uid(), 'admin'::app_role)
                 OR (public.has_role(auth.uid(), 'supervisor'::app_role)
                     AND t.id IN (SELECT public.supervisor_scope_task_ids()))))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.opportunities o JOIN public.tasks t ON t.id = o.task_id
          WHERE o.id = opportunity_items.opportunity_id
            AND ((t.created_by = auth.uid() AND NOT public.has_role(auth.uid(), 'supervisor'::app_role))
                 OR public.has_role(auth.uid(), 'manager'::app_role)
                 OR public.has_role(auth.uid(), 'admin'::app_role)
                 OR (public.has_role(auth.uid(), 'supervisor'::app_role)
                     AND public.task_in_supervisor_scope(t.id))))
);
DROP POLICY IF EXISTS "Users can create opportunity items for their tasks" ON public.opportunity_items;
CREATE POLICY "Users can create opportunity items for their tasks" ON public.opportunity_items FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.opportunities o JOIN public.tasks t ON t.id = o.task_id
          WHERE o.id = opportunity_items.opportunity_id AND t.created_by = auth.uid()
            AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(t.id)))
);

-- 9.6 task_equipment
DROP POLICY IF EXISTS task_equipment_select ON public.task_equipment;
CREATE POLICY task_equipment_select ON public.task_equipment FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.has_role(auth.uid(), 'supervisor'::app_role)
      AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_equipment.task_id AND t.created_by = auth.uid()))
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND task_id IN (SELECT public.supervisor_scope_task_ids()))
);
DROP POLICY IF EXISTS task_equipment_insert ON public.task_equipment;
CREATE POLICY task_equipment_insert ON public.task_equipment FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (NOT public.has_role(auth.uid(), 'supervisor'::app_role)
        AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_equipment.task_id AND t.created_by = auth.uid()))
    OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.task_in_supervisor_scope(task_id)))
);
DROP POLICY IF EXISTS task_equipment_delete ON public.task_equipment;
CREATE POLICY task_equipment_delete ON public.task_equipment FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.has_role(auth.uid(), 'supervisor'::app_role)
      AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_equipment.task_id AND t.created_by = auth.uid()))
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.task_in_supervisor_scope(task_id))
);

-- 9.7 products / reminders (gravação): Supervisor só na Filial Ativa.
DROP POLICY IF EXISTS "Users can create products for their tasks" ON public.products;
CREATE POLICY "Users can create products for their tasks" ON public.products FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = products.task_id
          AND ((t.created_by = auth.uid() AND NOT public.has_role(auth.uid(), 'supervisor'::app_role))
               OR public.has_role(auth.uid(), 'manager'::app_role)
               OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.task_in_supervisor_scope(t.id))))
);
DROP POLICY IF EXISTS "Users can update products for their tasks" ON public.products;
CREATE POLICY "Users can update products for their tasks" ON public.products FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = products.task_id AND public.can_access_customer_data(t.created_by))
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = products.task_id AND public.can_access_customer_data(t.created_by))
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)));
DROP POLICY IF EXISTS "Users can delete products for their tasks" ON public.products;
CREATE POLICY "Users can delete products for their tasks" ON public.products FOR DELETE
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = products.task_id AND t.created_by = auth.uid())
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)));

DROP POLICY IF EXISTS "Users can create reminders for their tasks" ON public.reminders;
CREATE POLICY "Users can create reminders for their tasks" ON public.reminders FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = reminders.task_id AND t.created_by = auth.uid())
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)));
DROP POLICY IF EXISTS "Users can update reminders for their tasks" ON public.reminders;
CREATE POLICY "Users can update reminders for their tasks" ON public.reminders FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = reminders.task_id AND public.can_access_customer_data(t.created_by))
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = reminders.task_id AND public.can_access_customer_data(t.created_by))
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)));
DROP POLICY IF EXISTS "Users can delete reminders for their tasks" ON public.reminders;
CREATE POLICY "Users can delete reminders for their tasks" ON public.reminders FOR DELETE
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = reminders.task_id AND t.created_by = auth.uid())
       AND (NOT public.has_role(auth.uid(), 'supervisor'::app_role) OR public.task_in_supervisor_scope(task_id)));

-- ---------------------------------------------------------------------
-- 10. Consultas antigas não usadas pelas telas: acesso retirado.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_completely_secure_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_supervisor_filial_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_secure_tasks_enhanced(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_secure_tasks_new_with_customer_protection() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supervisor_task_filial_ok(text, uuid) FROM PUBLIC, anon, authenticated;

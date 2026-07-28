
-- Helper: usuário atual aprovado e ativo
CREATE OR REPLACE FUNCTION public.is_active_approved_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  )
$$;

-- Helper: acesso de LEITURA a um objeto de mídia com path {task_id}/{arquivo}
CREATE OR REPLACE FUNCTION public.can_access_media_object(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_created_by uuid;
  v_filial text;
  v_found boolean := false;
  v_sup_filial text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_active_approved_user() THEN
    RETURN false;
  END IF;

  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') THEN
    RETURN true;
  END IF;

  BEGIN
    v_task_id := split_part(p_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  SELECT t.created_by, t.filial INTO v_created_by, v_filial
  FROM public.tasks t
  WHERE t.id = v_task_id;

  v_found := FOUND;

  -- Rascunho (tarefa ainda não salva): a política complementa com owner = auth.uid()
  IF NOT v_found THEN
    RETURN false;
  END IF;

  IF v_created_by = auth.uid() THEN
    RETURN true;
  END IF;

  IF public.has_role(auth.uid(), 'supervisor') THEN
    SELECT f.nome INTO v_sup_filial
    FROM public.filiais f
    WHERE f.id = public.get_supervisor_filial_id();

    RETURN COALESCE(v_sup_filial, '') <> ''
       AND LOWER(TRIM(COALESCE(v_filial, ''))) = LOWER(TRIM(v_sup_filial));
  END IF;

  RETURN false;
END;
$$;

-- Helper: usuário atual é o criador da tarefa referenciada pelo path
CREATE OR REPLACE FUNCTION public.is_media_task_owner(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_created_by uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_task_id := split_part(p_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  SELECT t.created_by INTO v_created_by
  FROM public.tasks t
  WHERE t.id = v_task_id;

  RETURN v_created_by IS NOT NULL AND v_created_by = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_active_approved_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_media_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_media_task_owner(text) TO authenticated;

-- Políticas dos buckets privados
DROP POLICY IF EXISTS "media_photos_select" ON storage.objects;
CREATE POLICY "media_photos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN ('task-photos', 'product-photos')
  AND public.is_active_approved_user()
  AND (owner = auth.uid() OR public.can_access_media_object(name))
);

DROP POLICY IF EXISTS "media_photos_insert" ON storage.objects;
CREATE POLICY "media_photos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('task-photos', 'product-photos')
  AND public.is_active_approved_user()
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "media_photos_update" ON storage.objects;
CREATE POLICY "media_photos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('task-photos', 'product-photos')
  AND public.is_active_approved_user()
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
)
WITH CHECK (
  bucket_id IN ('task-photos', 'product-photos')
  AND public.is_active_approved_user()
);

-- DELETE: somente owner do arquivo, criador da tarefa, admin ou manager.
-- Supervisores NÃO recebem permissão de exclusão via can_access_media_object().
DROP POLICY IF EXISTS "media_photos_delete" ON storage.objects;
CREATE POLICY "media_photos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('task-photos', 'product-photos')
  AND public.is_active_approved_user()
  AND (
    owner = auth.uid()
    OR public.is_media_task_owner(name)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);

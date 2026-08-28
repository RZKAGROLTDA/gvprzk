-- =========================================================
-- R1.1 — Regularização do Parque: operação global + travas
-- =========================================================

-- 1) Helpers
CREATE OR REPLACE FUNCTION public.can_operate_equipment_regularization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_view_equipment_park();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_equipment_regularization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- 2) Trigger guard: imutabilidade de created_by / status finais
CREATE OR REPLACE FUNCTION public.equipment_regularization_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'created_by e imutavel apos a criacao do lote';
    END IF;

    IF OLD.status IN ('enviado', 'cancelado') THEN
      RAISE EXCEPTION 'Lote % nao pode ser alterado', OLD.status;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'gerado' AND NEW.status = 'enviado' THEN
        IF current_setting('app.reg_confirm_send', true) IS DISTINCT FROM OLD.id::text THEN
          RAISE EXCEPTION 'Confirmacao de envio somente via equipment_regularization_confirm_send()';
        END IF;
        IF NEW.sent_by IS NULL OR NEW.sent_at IS NULL THEN
          RAISE EXCEPTION 'Envio exige sent_by e sent_at';
        END IF;
      ELSIF OLD.status = 'gerado' AND NEW.status = 'cancelado' THEN
        IF NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL THEN
          RAISE EXCEPTION 'Cancelamento exige cancelled_by e cancelled_at';
        END IF;
      ELSE
        RAISE EXCEPTION 'Transicao de status invalida: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('enviado', 'cancelado') THEN
      RAISE EXCEPTION 'Lote % nao pode ser excluido', OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_regularization_guard ON public.equipment_regularization_batches;
CREATE TRIGGER trg_equipment_regularization_guard
BEFORE UPDATE OR DELETE ON public.equipment_regularization_batches
FOR EACH ROW EXECUTE FUNCTION public.equipment_regularization_guard();

-- 3) Guard de itens: bloqueia escrita quando o lote nao esta 'gerado'
CREATE OR REPLACE FUNCTION public.equipment_regularization_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_batch uuid;
BEGIN
  v_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  SELECT status INTO v_status FROM public.equipment_regularization_batches WHERE id = v_batch;

  IF v_status IS DISTINCT FROM 'gerado' THEN
    RAISE EXCEPTION 'Itens so podem ser alterados enquanto o lote estiver gerado (status atual: %)', COALESCE(v_status, 'inexistente');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_regularization_items_guard ON public.equipment_regularization_items;
CREATE TRIGGER trg_equipment_regularization_items_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.equipment_regularization_items
FOR EACH ROW EXECUTE FUNCTION public.equipment_regularization_items_guard();

-- 4) RPC de confirmacao de envio
CREATE OR REPLACE FUNCTION public.equipment_regularization_confirm_send(p_batch_id uuid)
RETURNS public.equipment_regularization_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.equipment_regularization_batches;
  v_items integer;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  SELECT * INTO v_batch FROM public.equipment_regularization_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  IF NOT (public.can_manage_equipment_regularization() OR v_batch.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Somente o autor do lote ou um gestor pode confirmar o envio';
  END IF;

  IF v_batch.status <> 'gerado' THEN
    RAISE EXCEPTION 'Somente lotes gerados podem ser enviados (status atual: %)', v_batch.status;
  END IF;

  SELECT count(*) INTO v_items FROM public.equipment_regularization_items WHERE batch_id = p_batch_id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'Lote sem itens nao pode ser enviado';
  END IF;

  PERFORM set_config('app.reg_confirm_send', p_batch_id::text, true);

  UPDATE public.equipment_regularization_batches
     SET status = 'enviado',
         sent_at = now(),
         sent_by = auth.uid()
   WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  PERFORM set_config('app.reg_confirm_send', '', true);

  RETURN v_batch;
END;
$$;

-- 5) RPC de cancelamento
CREATE OR REPLACE FUNCTION public.equipment_regularization_cancel(p_batch_id uuid, p_reason text DEFAULT NULL)
RETURNS public.equipment_regularization_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.equipment_regularization_batches;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  SELECT * INTO v_batch FROM public.equipment_regularization_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  IF NOT (public.can_manage_equipment_regularization() OR v_batch.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Somente o autor do lote ou um gestor pode cancelar';
  END IF;

  IF v_batch.status <> 'gerado' THEN
    RAISE EXCEPTION 'Somente lotes gerados podem ser cancelados (status atual: %)', v_batch.status;
  END IF;

  UPDATE public.equipment_regularization_batches
     SET status = 'cancelado',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         notes = COALESCE(notes, '') || CASE WHEN p_reason IS NULL THEN '' ELSE E'\n[cancelamento] ' || p_reason END
   WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

-- 6) Policies — batches
DROP POLICY IF EXISTS "Aprovados podem ver lotes de regularizacao" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Gestores podem criar lotes de regularizacao" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Gestores podem atualizar lotes gerados" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Gestores podem excluir lotes nao enviados" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Aprovado ve lote de regularizacao" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Aprovado cria lote como autor" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Autor ou gestor atualiza lote gerado" ON public.equipment_regularization_batches;
DROP POLICY IF EXISTS "Autor ou gestor exclui lote gerado" ON public.equipment_regularization_batches;

CREATE POLICY "Aprovado ve lote de regularizacao"
ON public.equipment_regularization_batches FOR SELECT TO authenticated
USING (public.can_view_equipment_park());

CREATE POLICY "Aprovado cria lote como autor"
ON public.equipment_regularization_batches FOR INSERT TO authenticated
WITH CHECK (
  public.can_operate_equipment_regularization()
  AND created_by = auth.uid()
  AND status = 'gerado'
);

CREATE POLICY "Autor ou gestor atualiza lote gerado"
ON public.equipment_regularization_batches FOR UPDATE TO authenticated
USING (
  status = 'gerado'
  AND (
    public.can_manage_equipment_regularization()
    OR (public.can_operate_equipment_regularization() AND created_by = auth.uid())
  )
)
WITH CHECK (
  public.can_manage_equipment_regularization()
  OR (public.can_operate_equipment_regularization() AND created_by = auth.uid())
);

CREATE POLICY "Autor ou gestor exclui lote gerado"
ON public.equipment_regularization_batches FOR DELETE TO authenticated
USING (
  status = 'gerado'
  AND (
    public.can_manage_equipment_regularization()
    OR (public.can_operate_equipment_regularization() AND created_by = auth.uid())
  )
);

-- 7) Policies — items
DROP POLICY IF EXISTS "Aprovados podem ver itens de regularizacao" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Gestores podem criar itens em lote gerado" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Gestores podem atualizar itens de lote gerado" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Gestores podem excluir itens de lote gerado" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Aprovado ve item de regularizacao" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Autor ou gestor cria item em lote gerado" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Autor ou gestor atualiza item de lote gerado" ON public.equipment_regularization_items;
DROP POLICY IF EXISTS "Autor ou gestor exclui item de lote gerado" ON public.equipment_regularization_items;

CREATE POLICY "Aprovado ve item de regularizacao"
ON public.equipment_regularization_items FOR SELECT TO authenticated
USING (public.can_view_equipment_park());

CREATE POLICY "Autor ou gestor cria item em lote gerado"
ON public.equipment_regularization_items FOR INSERT TO authenticated
WITH CHECK (
  public.can_operate_equipment_regularization()
  AND EXISTS (
    SELECT 1 FROM public.equipment_regularization_batches b
     WHERE b.id = batch_id
       AND b.status = 'gerado'
       AND (public.can_manage_equipment_regularization() OR b.created_by = auth.uid())
  )
);

CREATE POLICY "Autor ou gestor atualiza item de lote gerado"
ON public.equipment_regularization_items FOR UPDATE TO authenticated
USING (
  public.can_operate_equipment_regularization()
  AND EXISTS (
    SELECT 1 FROM public.equipment_regularization_batches b
     WHERE b.id = batch_id
       AND b.status = 'gerado'
       AND (public.can_manage_equipment_regularization() OR b.created_by = auth.uid())
  )
)
WITH CHECK (
  public.can_operate_equipment_regularization()
  AND EXISTS (
    SELECT 1 FROM public.equipment_regularization_batches b
     WHERE b.id = batch_id
       AND b.status = 'gerado'
       AND (public.can_manage_equipment_regularization() OR b.created_by = auth.uid())
  )
);

CREATE POLICY "Autor ou gestor exclui item de lote gerado"
ON public.equipment_regularization_items FOR DELETE TO authenticated
USING (
  public.can_operate_equipment_regularization()
  AND EXISTS (
    SELECT 1 FROM public.equipment_regularization_batches b
     WHERE b.id = batch_id
       AND b.status = 'gerado'
       AND (public.can_manage_equipment_regularization() OR b.created_by = auth.uid())
  )
);

-- 8) Grants
GRANT EXECUTE ON FUNCTION public.can_operate_equipment_regularization() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_equipment_regularization() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_confirm_send(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_cancel(uuid, text) TO authenticated, service_role;
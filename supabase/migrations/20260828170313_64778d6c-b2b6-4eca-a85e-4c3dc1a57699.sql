-- =========================================================
-- Regularização do Parque — R1: estrutura de lotes
-- Nenhuma alteração em client_equipment / validation_priority*
-- =========================================================

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

REVOKE ALL ON FUNCTION public.can_manage_equipment_regularization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_equipment_regularization() TO authenticated;

-- ---------------------------------------------------------
-- 1. Lotes (apenas dados do documento; sem filial única)
-- ---------------------------------------------------------
CREATE TABLE public.equipment_regularization_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  header_city text NOT NULL,
  header_state text NOT NULL,
  document_date date NOT NULL DEFAULT CURRENT_DATE,
  pmp_number text,
  signer_name text NOT NULL,
  signer_role text NOT NULL DEFAULT 'Gerente Corporativo de Serviços',
  recipient_name text,
  recipient_email text,
  status text NOT NULL DEFAULT 'gerado',
  notes text,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamp with time zone,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_regularization_batches_status_chk
    CHECK (status IN ('gerado', 'enviado', 'cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_regularization_batches TO authenticated;
GRANT ALL ON public.equipment_regularization_batches TO service_role;

ALTER TABLE public.equipment_regularization_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aprovados podem ver lotes de regularizacao"
  ON public.equipment_regularization_batches
  FOR SELECT
  TO authenticated
  USING ((SELECT public.can_view_equipment_park()));

CREATE POLICY "Gestores podem criar lotes de regularizacao"
  ON public.equipment_regularization_batches
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.can_manage_equipment_regularization()));

-- Somente lote 'gerado' pode ser atualizado.
-- USING avalia a linha ANTES do update, então gerado -> enviado e
-- gerado -> cancelado continuam permitidos; enviado/cancelado não editam.
CREATE POLICY "Gestores podem atualizar lotes gerados"
  ON public.equipment_regularization_batches
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.can_manage_equipment_regularization()) AND status = 'gerado')
  WITH CHECK ((SELECT public.can_manage_equipment_regularization()));

-- DELETE permitido para gerado e cancelado; nunca para enviado.
CREATE POLICY "Gestores podem excluir lotes nao enviados"
  ON public.equipment_regularization_batches
  FOR DELETE
  TO authenticated
  USING ((SELECT public.can_manage_equipment_regularization()) AND status <> 'enviado');

-- ---------------------------------------------------------
-- 2. Itens do lote (snapshot completo do PDF)
-- ---------------------------------------------------------
CREATE TABLE public.equipment_regularization_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.equipment_regularization_batches(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.client_equipment(id) ON DELETE RESTRICT,
  filial_id uuid REFERENCES public.filiais(id),
  dealer_location text,
  serial_chassis text,
  responsible_account text,
  pmp_number text,
  expiration_date date,
  client_code text,
  client_name text,
  city text,
  state text,
  machine_situation text NOT NULL,
  model text,
  year integer,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_regularization_items_situation_chk
    CHECK (machine_situation IN ('vendida', 'inativa', 'sucata')),
  CONSTRAINT equipment_regularization_items_unique_per_batch
    UNIQUE (batch_id, equipment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_regularization_items TO authenticated;
GRANT ALL ON public.equipment_regularization_items TO service_role;

ALTER TABLE public.equipment_regularization_items ENABLE ROW LEVEL SECURITY;

-- Helper: status do lote do item (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.equipment_regularization_batch_status(p_batch_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.status
  FROM public.equipment_regularization_batches b
  WHERE b.id = p_batch_id;
$$;

REVOKE ALL ON FUNCTION public.equipment_regularization_batch_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_batch_status(uuid) TO authenticated;

CREATE POLICY "Aprovados podem ver itens de regularizacao"
  ON public.equipment_regularization_items
  FOR SELECT
  TO authenticated
  USING ((SELECT public.can_view_equipment_park()));

-- Itens só podem ser incluídos/alterados/removidos enquanto o lote estiver 'gerado'.
CREATE POLICY "Gestores podem criar itens em lote gerado"
  ON public.equipment_regularization_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.can_manage_equipment_regularization())
    AND public.equipment_regularization_batch_status(batch_id) = 'gerado'
  );

CREATE POLICY "Gestores podem atualizar itens de lote gerado"
  ON public.equipment_regularization_items
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.can_manage_equipment_regularization())
    AND public.equipment_regularization_batch_status(batch_id) = 'gerado'
  )
  WITH CHECK (
    (SELECT public.can_manage_equipment_regularization())
    AND public.equipment_regularization_batch_status(batch_id) = 'gerado'
  );

CREATE POLICY "Gestores podem excluir itens de lote gerado"
  ON public.equipment_regularization_items
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.can_manage_equipment_regularization())
    AND public.equipment_regularization_batch_status(batch_id) = 'gerado'
  );

-- ---------------------------------------------------------
-- 3. Índices de apoio
-- ---------------------------------------------------------
CREATE INDEX idx_erb_status_generated
  ON public.equipment_regularization_batches (status, generated_at DESC);

CREATE INDEX idx_eri_batch
  ON public.equipment_regularization_items (batch_id);

CREATE INDEX idx_eri_equipment_batch
  ON public.equipment_regularization_items (equipment_id, batch_id);

-- ---------------------------------------------------------
-- 4. Triggers de updated_at
-- ---------------------------------------------------------
CREATE TRIGGER trg_erb_updated_at
  BEFORE UPDATE ON public.equipment_regularization_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_eri_updated_at
  BEFORE UPDATE ON public.equipment_regularization_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
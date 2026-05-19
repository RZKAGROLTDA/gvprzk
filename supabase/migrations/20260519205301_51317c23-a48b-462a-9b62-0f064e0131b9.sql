
CREATE TABLE public.special_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text NOT NULL,
  client_name text NOT NULL,
  filial_id uuid,
  filial_name text,
  seller_id uuid NOT NULL DEFAULT auth.uid(),
  seller_name text,
  sale_value numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  total_discount_value numeric GENERATED ALWAYS AS (round((sale_value * discount_percent / 100)::numeric, 2)) STORED,
  invoice_number text,
  payment_condition text,
  sale_date date,
  nf_date date,
  status text NOT NULL DEFAULT 'pendente',
  approved_by uuid,
  approved_at timestamptz,
  observation text,
  attachments text[] DEFAULT '{}'::text[],
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT special_conditions_status_chk CHECK (status IN ('pendente','aprovado','rejeitado')),
  CONSTRAINT special_conditions_discount_range_chk CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT special_conditions_sale_value_chk CHECK (sale_value >= 0)
);

CREATE INDEX idx_special_conditions_client_code ON public.special_conditions(client_code);
CREATE INDEX idx_special_conditions_sale_date   ON public.special_conditions(sale_date DESC);
CREATE INDEX idx_special_conditions_seller      ON public.special_conditions(seller_id);
CREATE INDEX idx_special_conditions_filial      ON public.special_conditions(filial_id);
CREATE INDEX idx_special_conditions_status      ON public.special_conditions(status);
CREATE INDEX idx_special_conditions_created     ON public.special_conditions(created_at DESC);

ALTER TABLE public.special_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY special_conditions_select ON public.special_conditions
FOR SELECT TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
);

CREATE POLICY special_conditions_insert ON public.special_conditions
FOR INSERT TO authenticated
WITH CHECK (
  (seller_id = auth.uid())
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
);

CREATE POLICY special_conditions_update ON public.special_conditions
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
  OR (seller_id = auth.uid() AND status = 'pendente')
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
  OR (seller_id = auth.uid() AND status = 'pendente')
);

CREATE POLICY special_conditions_delete ON public.special_conditions
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
  OR (seller_id = auth.uid() AND status = 'pendente')
);

CREATE TRIGGER trg_special_conditions_updated_at
BEFORE UPDATE ON public.special_conditions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.special_conditions_fill_seller_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seller_name IS NULL OR btrim(NEW.seller_name) = '' THEN
    SELECT p.name INTO NEW.seller_name
    FROM public.profiles p
    WHERE p.user_id = NEW.seller_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_special_conditions_fill_seller_name
BEFORE INSERT ON public.special_conditions
FOR EACH ROW EXECUTE FUNCTION public.special_conditions_fill_seller_name();

CREATE OR REPLACE FUNCTION public.special_conditions_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_priv boolean := has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'admin'::app_role);
  is_sup  boolean := has_role(auth.uid(),'supervisor'::app_role);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_priv AND NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'Apenas gerente/admin podem criar com status diferente de pendente';
    END IF;
    IF NOT is_priv AND is_sup AND NEW.status IN ('aprovado','rejeitado')
       AND NEW.filial_id IS DISTINCT FROM get_supervisor_filial_id(auth.uid()) THEN
      RAISE EXCEPTION 'Supervisor só pode aprovar/rejeitar registros da própria filial';
    END IF;
    IF NEW.status IN ('aprovado','rejeitado') AND NEW.approved_at IS NULL THEN
      NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
      NEW.approved_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'aprovado' AND NOT is_priv THEN
      RAISE EXCEPTION 'Registro aprovado só pode ser alterado por gerente/admin';
    END IF;
    IF NOT is_priv AND NOT is_sup AND OLD.status <> 'pendente' THEN
      RAISE EXCEPTION 'Vendedor só pode editar registros pendentes';
    END IF;
    IF NOT is_priv AND is_sup AND NEW.status <> OLD.status
       AND OLD.filial_id IS DISTINCT FROM get_supervisor_filial_id(auth.uid()) THEN
      RAISE EXCEPTION 'Supervisor só pode aprovar/rejeitar registros da própria filial';
    END IF;
    IF NEW.status IN ('aprovado','rejeitado') AND NEW.status <> OLD.status THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
    IF NEW.status = 'pendente' AND OLD.status <> 'pendente' THEN
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_special_conditions_status_guard
BEFORE INSERT OR UPDATE ON public.special_conditions
FOR EACH ROW EXECUTE FUNCTION public.special_conditions_status_guard();

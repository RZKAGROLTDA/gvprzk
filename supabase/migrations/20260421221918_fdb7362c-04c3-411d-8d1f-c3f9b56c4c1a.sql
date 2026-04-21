-- ============================================
-- CAMPANHAS MODULE
-- ============================================

-- 1. Master de clientes (autocomplete + cadastro manual)
CREATE TABLE public.campaign_clients_master (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_code text NOT NULL UNIQUE,
  client_name text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_clients_master_name ON public.campaign_clients_master USING gin (client_name gin_trgm_ops);
CREATE INDEX idx_campaign_clients_master_code ON public.campaign_clients_master (client_code);

ALTER TABLE public.campaign_clients_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_clients_master_select_authenticated"
ON public.campaign_clients_master FOR SELECT
TO authenticated USING (true);

CREATE POLICY "campaign_clients_master_insert_authenticated"
ON public.campaign_clients_master FOR INSERT
TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "campaign_clients_master_update_managers"
ON public.campaign_clients_master FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "campaign_clients_master_delete_admin"
ON public.campaign_clients_master FOR DELETE
TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Regras da campanha
CREATE TABLE public.campaign_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_name text NOT NULL,
  trigger_min numeric(14,2) NOT NULL DEFAULT 0,
  trigger_max numeric(14,2) NULL,
  gained_april numeric(5,2) NOT NULL DEFAULT 0,
  gained_may numeric(5,2) NOT NULL DEFAULT 0,
  gained_june numeric(5,2) NOT NULL DEFAULT 0,
  commitment_value numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_rules_active ON public.campaign_rules (active);

ALTER TABLE public.campaign_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_rules_select_authenticated"
ON public.campaign_rules FOR SELECT
TO authenticated USING (true);

CREATE POLICY "campaign_rules_insert_managers"
ON public.campaign_rules FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "campaign_rules_update_managers"
ON public.campaign_rules FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "campaign_rules_delete_managers"
ON public.campaign_rules FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Lançamentos da campanha
CREATE TABLE public.campaign_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_rule_id uuid REFERENCES public.campaign_rules(id) ON DELETE SET NULL,
  client_code text NOT NULL,
  client_name text NOT NULL,
  filial_id uuid REFERENCES public.filiais(id),
  seller_id uuid NOT NULL DEFAULT auth.uid(),
  campaign_trigger_value numeric(14,2) NOT NULL DEFAULT 0,
  gained_april numeric(5,2) NOT NULL DEFAULT 0,
  gained_may numeric(5,2) NOT NULL DEFAULT 0,
  gained_june numeric(5,2) NOT NULL DEFAULT 0,
  commitment_value numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_clients_seller ON public.campaign_clients (seller_id);
CREATE INDEX idx_campaign_clients_filial ON public.campaign_clients (filial_id);
CREATE INDEX idx_campaign_clients_code ON public.campaign_clients (client_code);
CREATE INDEX idx_campaign_clients_rule ON public.campaign_clients (campaign_rule_id);

ALTER TABLE public.campaign_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_clients_select"
ON public.campaign_clients FOR SELECT
TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
);

CREATE POLICY "campaign_clients_insert"
ON public.campaign_clients FOR INSERT
TO authenticated
WITH CHECK (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
);

CREATE POLICY "campaign_clients_update"
ON public.campaign_clients FOR UPDATE
TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
)
WITH CHECK (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND filial_id = get_supervisor_filial_id(auth.uid()))
);

CREATE POLICY "campaign_clients_delete"
ON public.campaign_clients FOR DELETE
TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Triggers de timestamp
CREATE TRIGGER update_campaign_clients_master_updated_at
BEFORE UPDATE ON public.campaign_clients_master
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_rules_updated_at
BEFORE UPDATE ON public.campaign_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_clients_updated_at
BEFORE UPDATE ON public.campaign_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Trigger: ao inserir lançamento, garantir cliente no master (upsert)
CREATE OR REPLACE FUNCTION public.ensure_campaign_client_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campaign_clients_master (client_code, client_name, source, created_by)
  VALUES (NEW.client_code, NEW.client_name, 'campaign', NEW.seller_id)
  ON CONFLICT (client_code) DO UPDATE
    SET client_name = EXCLUDED.client_name,
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_campaign_client_master
AFTER INSERT ON public.campaign_clients
FOR EACH ROW EXECUTE FUNCTION public.ensure_campaign_client_master();

-- 6. RPC de autocomplete (master + tasks históricos)
CREATE OR REPLACE FUNCTION public.search_clients_for_campaigns(p_query text)
RETURNS TABLE (client_code text, client_name text, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH combined AS (
    SELECT m.client_code, m.client_name, m.source
    FROM public.campaign_clients_master m
    WHERE p_query IS NULL OR p_query = ''
       OR m.client_name ILIKE '%' || p_query || '%'
       OR m.client_code ILIKE '%' || p_query || '%'
    UNION
    SELECT DISTINCT t.clientcode AS client_code, t.client AS client_name, 'tasks'::text AS source
    FROM public.tasks t
    WHERE t.clientcode IS NOT NULL
      AND t.client IS NOT NULL
      AND (
        p_query IS NULL OR p_query = ''
        OR t.client ILIKE '%' || p_query || '%'
        OR t.clientcode ILIKE '%' || p_query || '%'
      )
  )
  SELECT DISTINCT ON (combined.client_code)
    combined.client_code, combined.client_name, combined.source
  FROM combined
  ORDER BY combined.client_code, combined.source
  LIMIT 50;
END;
$$;
CREATE TABLE public.clients_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text NOT NULL,
  client_code_norm text NOT NULL,
  client_name text NOT NULL,
  client_name_norm text NOT NULL,
  client_code_root text,
  establishment_code text,
  name_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  name_conflict boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'erp_import',
  active boolean NOT NULL DEFAULT true,
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clients_master_code_norm_key ON public.clients_master (client_code_norm);
CREATE INDEX clients_master_name_norm_idx ON public.clients_master (client_name_norm);
CREATE INDEX clients_master_name_norm_trgm_idx ON public.clients_master USING gin (client_name_norm gin_trgm_ops);
CREATE INDEX clients_master_code_idx ON public.clients_master (client_code);
CREATE INDEX clients_master_code_root_idx ON public.clients_master (client_code_root);

GRANT SELECT ON public.clients_master TO authenticated;
GRANT ALL ON public.clients_master TO service_role;

ALTER TABLE public.clients_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_master_select_authenticated"
ON public.clients_master FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  )
);

CREATE POLICY "clients_master_insert_admin"
ON public.clients_master FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "clients_master_update_admin"
ON public.clients_master FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "clients_master_delete_admin"
ON public.clients_master FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_clients_master_updated_at
BEFORE UPDATE ON public.clients_master
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
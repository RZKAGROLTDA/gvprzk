-- 1) Unique index (case-insensitive) on filiais.nome
CREATE UNIQUE INDEX IF NOT EXISTS filiais_nome_unique_ci
  ON public.filiais (lower(nome));

-- 2) RLS policies for INSERT / UPDATE / DELETE (admin + manager)
DROP POLICY IF EXISTS "Admins and managers can insert filiais" ON public.filiais;
CREATE POLICY "Admins and managers can insert filiais"
  ON public.filiais
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "Admins and managers can update filiais" ON public.filiais;
CREATE POLICY "Admins and managers can update filiais"
  ON public.filiais
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "Admins and managers can delete filiais" ON public.filiais;
CREATE POLICY "Admins and managers can delete filiais"
  ON public.filiais
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- 3) Backfill the 8 new filiais (idempotent)
INSERT INTO public.filiais (nome)
VALUES
  ('Redenção'),
  ('Paragominas'),
  ('Santana'),
  ('Dom Eliseu'),
  ('Santarém'),
  ('Marabá'),
  ('Ananindeua'),
  ('Tailândia')
ON CONFLICT (lower(nome)) DO NOTHING;
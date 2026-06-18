-- Ajuste de RLS em client_equipment:
-- Equipamentos importados em massa ficam com created_by/filial_id nulos, e a RLS
-- atual de SELECT/UPDATE só liberava o dono/manager/admin/supervisor da filial,
-- causando "Cannot coerce the result to a single JSON object" ao salvar pelo
-- modal de edição (UPDATE retornava 0 linhas).
-- Nova regra: todo authenticated vê e atualiza dados operacionais.
-- DELETE continua restrito a manager/admin.

DROP POLICY IF EXISTS client_equipment_select ON public.client_equipment;
DROP POLICY IF EXISTS client_equipment_update ON public.client_equipment;

CREATE POLICY client_equipment_select
  ON public.client_equipment
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY client_equipment_update
  ON public.client_equipment
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

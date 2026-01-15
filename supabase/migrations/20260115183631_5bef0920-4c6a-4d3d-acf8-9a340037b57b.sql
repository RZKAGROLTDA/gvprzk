
-- Habilitar RLS nas tabelas de backup (apenas admin pode acessar)
ALTER TABLE tasks_backup_oct2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities_backup_oct2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_backup_oct2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_items_backup_oct2025 ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso apenas para admin
CREATE POLICY "Admin only access" ON tasks_backup_oct2025 FOR ALL USING (simple_is_admin());
CREATE POLICY "Admin only access" ON opportunities_backup_oct2025 FOR ALL USING (simple_is_admin());
CREATE POLICY "Admin only access" ON products_backup_oct2025 FOR ALL USING (simple_is_admin());
CREATE POLICY "Admin only access" ON opportunity_items_backup_oct2025 FOR ALL USING (simple_is_admin());

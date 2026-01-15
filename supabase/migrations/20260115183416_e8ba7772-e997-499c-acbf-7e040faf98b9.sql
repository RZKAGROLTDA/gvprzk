
-- ========================================
-- BACKUP DE DADOS ANTERIORES A NOVEMBRO/2025
-- ========================================

-- Backup de Tasks
CREATE TABLE IF NOT EXISTS tasks_backup_oct2025 AS 
SELECT * FROM tasks WHERE start_date < '2025-11-01';

-- Backup de Opportunities
CREATE TABLE IF NOT EXISTS opportunities_backup_oct2025 AS 
SELECT * FROM opportunities WHERE data_criacao < '2025-11-01';

-- Backup de Products (relacionados às tasks antigas)
CREATE TABLE IF NOT EXISTS products_backup_oct2025 AS 
SELECT p.* FROM products p 
JOIN tasks t ON p.task_id = t.id 
WHERE t.start_date < '2025-11-01';

-- Backup de Opportunity Items (relacionados às opportunities antigas)
CREATE TABLE IF NOT EXISTS opportunity_items_backup_oct2025 AS 
SELECT oi.* FROM opportunity_items oi 
JOIN opportunities o ON oi.opportunity_id = o.id 
WHERE o.data_criacao < '2025-11-01';

-- Adicionar comentários às tabelas de backup
COMMENT ON TABLE tasks_backup_oct2025 IS 'Backup de tasks anteriores a Nov/2025 - Criado em Jan/2026';
COMMENT ON TABLE opportunities_backup_oct2025 IS 'Backup de opportunities anteriores a Nov/2025 - Criado em Jan/2026';
COMMENT ON TABLE products_backup_oct2025 IS 'Backup de products anteriores a Nov/2025 - Criado em Jan/2026';
COMMENT ON TABLE opportunity_items_backup_oct2025 IS 'Backup de opportunity_items anteriores a Nov/2025 - Criado em Jan/2026';

-- Índice GIN com pg_trgm para buscas ILIKE em observations (ex.: busca por CPF).
-- Reduz full table scan e Disk I/O ao permitir uso de índice em padrões como %valor%.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_tasks_observations_trgm
  ON public.tasks USING gin (observations gin_trgm_ops);

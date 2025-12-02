-- Índice para a coluna data_criacao usada no ORDER BY
CREATE INDEX IF NOT EXISTS idx_opportunities_data_criacao ON public.opportunities(data_criacao DESC);

-- Índice composto incluindo data_criacao para queries com filtros + ordenação
CREATE INDEX IF NOT EXISTS idx_opportunities_status_data_criacao ON public.opportunities(status, data_criacao DESC);
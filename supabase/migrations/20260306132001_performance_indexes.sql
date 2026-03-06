-- Migration: Índices de performance para reduzir Disk IO (EBS IO burst)
--
-- Problema: Queries em tasks sem cobertura de índice para filial_atendida,
-- is_prospect e sales_confirmed causam full table scans.
-- Queries de rate-limit em security_audit_log sem índice em event_type e
-- na expressão metadata->>'email' também causam full scans.
--
-- Nota: CREATE INDEX CONCURRENTLY não é compatível com transaction blocks (usado pelo Supabase).
-- Os índices abaixo usam CREATE INDEX padrão. Para tabelas pequenas (< 100k linhas),
-- o lock é mínimo (< 1s). Em produção com tabelas grandes, execute manualmente fora
-- de transação via psql ou o SQL Editor do Supabase.

-- ============================================================
-- ÍNDICES NA TABELA tasks
-- ============================================================

-- Usado por: get_secure_tasks_paginated_filtered (p_filial_atendida)
--            useConsolidatedSalesMetrics (filial_atendida filter)
CREATE INDEX IF NOT EXISTS idx_tasks_filial_atendida_created_at
  ON public.tasks (filial_atendida, created_at DESC)
  WHERE filial_atendida IS NOT NULL;

-- Usado por: useConsolidatedSalesMetrics (prospectsQuery)
--            get_reports_aggregated_stats (prospects count)
CREATE INDEX IF NOT EXISTS idx_tasks_is_prospect_created_at
  ON public.tasks (is_prospect, created_at DESC)
  WHERE is_prospect = true;

-- Usado por: useConsolidatedSalesMetrics (salesQuery WHERE sales_confirmed = true)
--            get_reports_aggregated_stats (sales aggregation)
CREATE INDEX IF NOT EXISTS idx_tasks_sales_confirmed_type_created_at
  ON public.tasks (sales_confirmed, sales_type, created_at DESC)
  WHERE sales_confirmed = true;

-- ============================================================
-- ÍNDICES NA TABELA security_audit_log
-- ============================================================

-- Consultas por janela de tempo (rate-limit, monitoramento, cleanup)
-- Sem este índice, qualquer query com created_at > NOW() - INTERVAL '...'
-- faz full scan (a tabela não tem particionamento por data).
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at
  ON public.security_audit_log (created_at DESC);

-- Consultas de monitoramento filtradas por event_type + janela de tempo
-- Ex: WHERE event_type = 'failed_login' AND created_at > ...
CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type_created_at
  ON public.security_audit_log (event_type, created_at DESC);

-- Índice de expressão para check_login_rate_limit:
-- WHERE event_type = 'failed_login' AND metadata->>'email' = user_email
-- Sem este índice, a extração do JSONB obriga full scan na tabela inteira.
CREATE INDEX IF NOT EXISTS idx_security_audit_log_metadata_email
  ON public.security_audit_log ((metadata->>'email'))
  WHERE metadata->>'email' IS NOT NULL;

-- Migration: Otimizações adicionais para reduzir Disk IO
--
-- Baseado em pg_stat_statements: queries em tasks e security_audit_log
-- são as principais fontes de shared_blks_read (leitura em disco).
--
-- 1. Índices adicionais em tasks para filtros de data e task_type
-- 2. RPC get_security_audit_log_summary para evitar full scan em COUNT/MIN/MAX

-- ============================================================
-- ÍNDICES ADICIONAIS EM tasks
-- ============================================================

-- useConsolidatedSalesMetrics: filtro created_at em todas as queries
-- get_secure_tasks_paginated_filtered: p_start_date, p_end_date
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc
  ON public.tasks (created_at DESC);

-- useConsolidatedSalesMetrics: .in('task_type', visitasTypes/ligacaoTypes/checklistTypes)
-- Permite index-only scan para contagens por tipo de atividade
CREATE INDEX IF NOT EXISTS idx_tasks_task_type_created_at
  ON public.tasks (task_type, created_at DESC);

-- ============================================================
-- RPC: Resumo de security_audit_log (evita full scan)
-- ============================================================
-- Usado quando precisar de count/min/max sem varrer a tabela inteira.
-- Usa idx_security_audit_log_created_at para range scan.

CREATE OR REPLACE FUNCTION public.get_security_audit_log_summary(
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_count bigint,
  min_created_at timestamptz,
  max_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint,
    min(sal.created_at),
    max(sal.created_at)
  FROM public.security_audit_log sal
  WHERE (p_since IS NULL OR sal.created_at >= p_since);
END;
$$;

REVOKE ALL ON FUNCTION public.get_security_audit_log_summary(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_security_audit_log_summary(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_security_audit_log_summary(timestamptz) TO service_role;

COMMENT ON FUNCTION public.get_security_audit_log_summary(timestamptz) IS
  'Retorna count, min e max de created_at em security_audit_log. Usa índice em created_at.';

-- ============================================================
-- RPC: Métricas de segurança (24h) - uma query, sem full scan
-- ============================================================
-- Substitui fetch de 200 linhas + filtro client-side por agregação no banco.
-- Usa idx_security_audit_log_created_at para range scan.

CREATE OR REPLACE FUNCTION public.get_security_metrics_24h()
RETURNS TABLE (
  total_events bigint,
  customer_access_events bigint,
  high_risk_events bigint,
  bulk_export_events bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '24 hours';
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE sal.event_type ILIKE '%customer%' OR sal.event_type ILIKE '%data_access%')::bigint,
    count(*) FILTER (WHERE sal.risk_score >= 4)::bigint,
    count(*) FILTER (WHERE sal.event_type ILIKE '%bulk%' OR sal.event_type ILIKE '%export%')::bigint
  FROM public.security_audit_log sal
  WHERE sal.created_at >= v_since;
END;
$$;

REVOKE ALL ON FUNCTION public.get_security_metrics_24h() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_security_metrics_24h() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_security_metrics_24h() TO service_role;

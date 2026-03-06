-- Migration: Retenção automática de security_audit_log via pg_cron
--
-- Problema: a tabela security_audit_log cresce sem limite pois cleanup_old_security_logs()
-- existe mas nunca é chamada automaticamente. Além disso, a função atual requer
-- permissão de admin (simple_is_admin()), o que impede chamada via cron.
--
-- Solução:
--   1. Criar função interna de cleanup sem verificação de papel (uso exclusivo do cron)
--   2. Agendar via pg_cron para rodar diariamente às 03:00 UTC
--
-- NOTA: pg_cron requer Supabase Pro ou superior.
-- Em caso de erro no agendamento, a função de cleanup ainda fica disponível
-- para chamada manual via dashboard do Supabase.

-- ============================================================
-- FUNÇÃO INTERNA DE CLEANUP (sem verificação de papel)
-- ============================================================

CREATE OR REPLACE FUNCTION public.internal_cleanup_security_logs_cron()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Remove logs com mais de 90 dias
  DELETE FROM public.security_audit_log
  WHERE created_at < now() - interval '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Revogar acesso público (apenas o próprio banco/cron pode chamar)
REVOKE ALL ON FUNCTION public.internal_cleanup_security_logs_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_cleanup_security_logs_cron() FROM anon;
REVOKE ALL ON FUNCTION public.internal_cleanup_security_logs_cron() FROM authenticated;

-- ============================================================
-- AGENDAMENTO VIA pg_cron (Supabase Pro+)
-- ============================================================

DO $$
BEGIN
  -- Verificar se pg_cron está disponível
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remover job anterior (caso exista) para evitar duplicatas
    PERFORM cron.unschedule('cleanup-security-audit-log')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'cleanup-security-audit-log'
    );

    -- Agendar cleanup diário às 03:00 UTC
    PERFORM cron.schedule(
      'cleanup-security-audit-log',
      '0 3 * * *',
      'SELECT public.internal_cleanup_security_logs_cron()'
    );

    RAISE NOTICE 'pg_cron job agendado: cleanup-security-audit-log (diário às 03:00 UTC)';
  ELSE
    RAISE WARNING 'pg_cron não disponível. Cleanup de security_audit_log não foi agendado. '
      'Execute manualmente: SELECT public.internal_cleanup_security_logs_cron();'
      'Ou habilite pg_cron no painel do Supabase (Extensions > pg_cron).';
  END IF;
END $$;

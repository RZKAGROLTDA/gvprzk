import { Button } from '@/components/ui/button';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

export const SessionRefreshButton = () => {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleRefreshSession = async () => {
    setIsRefreshing(true);
    try {
      toast.loading('🔄 Renovando sessão JWT...', { id: 'session-refresh' });
      
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        toast.error('❌ Sessão expirada. Redirecionando para login...', { id: 'session-refresh' });
        await signOut();
        return;
      }

      toast.success('✅ Token JWT renovado! Recarregando dados...', { id: 'session-refresh' });
      
      // Limpar cache React Query
      queryClient.clear();
      
      // Forçar reload da página após 1 segundo
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('Erro ao renovar sessão:', error);
      toast.error('❌ Erro na renovação. Faça login novamente.', { id: 'session-refresh' });
      await signOut();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetCache = async () => {
    setIsResetting(true);
    try {
      toast.loading('🗑️ Limpando cache...', { id: 'cache-reset' });
      
      // Limpar todos os caches
      queryClient.clear();
      
      // Limpar localStorage do Supabase
      localStorage.removeItem('sb-wuvbrkbhunifudaewhng-auth-token');
      
      toast.success('✅ Cache limpo! Forçando nova requisição...', { id: 'cache-reset' });
      
      // Reload após 500ms
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('Erro ao resetar cache:', error);
      toast.error('❌ Erro ao limpar cache', { id: 'cache-reset' });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onClick={handleRefreshSession}
        disabled={isRefreshing || isResetting}
        className="flex items-center gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        {isRefreshing ? 'Renovando...' : 'Renovar Sessão'}
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleResetCache}
        disabled={isRefreshing || isResetting}
        className="flex items-center gap-2"
      >
        <RotateCcw className={`h-4 w-4 ${isResetting ? 'animate-spin' : ''}`} />
        {isResetting ? 'Limpando...' : 'Reset'}
      </Button>
    </div>
  );
};
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

export const SessionRefreshButton = () => {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshSession = async () => {
    setIsRefreshing(true);
    try {
      // Tentar renovar a sessão
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        toast.error('Sessão expirada. Redirecionando para login...');
        await signOut();
        return;
      }

      // Limpar cache e recarregar
      queryClient.clear();
      toast.success('Sessão renovada! Recarregando dados...');
      
      // Forçar reload da página após 500ms
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('Erro ao renovar sessão:', error);
      toast.error('Erro ao renovar sessão. Faça login novamente.');
      await signOut();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefreshSession}
      disabled={isRefreshing}
      className="flex items-center gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      {isRefreshing ? 'Renovando...' : 'Renovar Sessão'}
    </Button>
  );
};
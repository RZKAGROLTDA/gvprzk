import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const ForceUpdateButton: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleForceUpdate = async () => {
    setLoading(true);
    try {
      toast.loading('Limpando cache e atualizando...', { id: 'force-update' });

      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      // Clear all caches
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }

      // Clear storage (preserve auth token)
      const authKey = 'sb-wuvbrkbhunifudaewhng-auth-token';
      const authToken = localStorage.getItem(authKey);
      try {
        sessionStorage.clear();
      } catch {}
      Object.keys(localStorage).forEach((k) => {
        if (k !== authKey) localStorage.removeItem(k);
      });
      if (authToken) localStorage.setItem(authKey, authToken);

      toast.success('Atualizando...', { id: 'force-update' });

      // Hard reload bypassing cache
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('_v', Date.now().toString());
        window.location.replace(url.toString());
      }, 400);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao atualizar', { id: 'force-update' });
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleForceUpdate}
      disabled={loading}
      title="Forçar atualização (limpa cache do app)"
      className="h-8 sm:h-10 gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Atualizar agora</span>
    </Button>
  );
};

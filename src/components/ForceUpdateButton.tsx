import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { forceUpdateNow } from '@/lib/appUpdate';

/**
 * Contingência manual. Recarrega buscando o bundle novo, sem apagar
 * sessão, rascunhos ou fila offline (nenhuma limpeza de localStorage/IndexedDB).
 */
export const ForceUpdateButton: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleForceUpdate = async () => {
    setLoading(true);
    try {
      toast.loading('Buscando a versão mais recente...', { id: 'force-update' });
      await forceUpdateNow();
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
      title="Forçar atualização (busca a versão mais recente)"
      className="h-8 sm:h-10 gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Atualizar agora</span>
    </Button>
  );
};

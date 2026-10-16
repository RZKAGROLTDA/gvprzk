import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { forceUpdateNow, hasUnsavedWork } from '@/lib/appUpdate';

/**
 * Contingência manual. Confirma a versão nova na rede antes de recarregar,
 * sem apagar sessão, rascunhos, fotos ou fila offline.
 */
export const ForceUpdateButton: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleForceUpdate = async () => {
    if (
      hasUnsavedWork() &&
      !window.confirm('Há trabalho em andamento. A página será recarregada. Atualizar agora?')
    ) {
      return;
    }
    setLoading(true);
    toast.loading('Buscando a versão mais recente...', { id: 'force-update' });
    const r = await forceUpdateNow();
    if (!r.ok) {
      toast.error(
        r.reason === 'offline'
          ? 'Sem internet. Tente novamente quando a conexão voltar.'
          : 'Não foi possível baixar a nova versão. Tente novamente.',
        { id: 'force-update' },
      );
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

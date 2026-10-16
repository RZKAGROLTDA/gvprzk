import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { hasUnsavedWork } from '@/lib/appUpdate';

/**
 * Aviso "Nova versão disponível". Fica visível até o usuário atualizar.
 * Com trabalho em andamento, pede confirmação antes de recarregar.
 * Sem internet ou falha: o app continua utilizável e oferece nova tentativa.
 */
export const VersionUpdateNotification: React.FC = () => {
  const { shouldUpdate, updateFailed, refreshPage } = useVersionCheck();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!shouldUpdate) return null;

  const handleUpdate = async () => {
    if (
      hasUnsavedWork() &&
      !window.confirm(
        'Há uma tela aberta ou trabalho em andamento. Salve antes de continuar, pois a página será recarregada. Atualizar agora?',
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const r = await refreshPage();
    if (!r.ok) {
      setLoading(false);
      setError(
        r.reason === 'offline'
          ? 'Sem internet. Tente novamente quando a conexão voltar.'
          : 'Não foi possível baixar a nova versão. Tente novamente.',
      );
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="border-primary/40 bg-card shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Nova versão disponível</CardTitle>
          <CardDescription className="text-xs">
            {updateFailed
              ? 'A atualização automática não foi concluída. '
              : ''}
            Seus dados, rascunhos, fotos e envios pendentes são preservados.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" onClick={() => void handleUpdate()} disabled={loading} className="flex items-center gap-1 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {error ? 'Tentar novamente' : 'Atualizar agora'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

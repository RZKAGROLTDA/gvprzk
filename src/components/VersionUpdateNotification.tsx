import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/hooks/useVersionCheck';

/**
 * Só aparece quando a atualização automática NÃO conseguiu ser aplicada.
 * No fluxo normal a nova versão entra sozinha, sem card.
 */
export const VersionUpdateNotification: React.FC = () => {
  const { updateFailed, refreshPage } = useVersionCheck();

  if (!updateFailed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="border-destructive/40 bg-card shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Atualização pendente</CardTitle>
          <CardDescription className="text-xs">
            Não foi possível aplicar a nova versão automaticamente. Seus dados e rascunhos estão preservados.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button size="sm" onClick={() => void refreshPage()} className="flex items-center gap-1 text-xs">
            <RefreshCw className="h-3 w-3" />
            Forçar atualização
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, X } from 'lucide-react';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { formatVersion } from '@/config/version';

/**
 * Component to show version update notification
 */
export const VersionUpdateNotification: React.FC = () => {
  const { shouldUpdate, versionInfo, refreshPage, dismissUpdate } = useVersionCheck();

  if (!shouldUpdate) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <Card className="border-primary bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Nova Versão</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissUpdate}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-xs">
            {formatVersion(versionInfo)} está disponível
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={refreshPage}
              className="flex items-center gap-1 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={dismissUpdate}
              className="text-xs"
            >
              Depois
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
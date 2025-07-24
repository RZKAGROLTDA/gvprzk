import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useOffline } from '@/hooks/useOffline';
import { Wifi, WifiOff, RefreshCw, Database, Clock, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const OfflineIndicator: React.FC = () => {
  const { 
    isOnline, 
    isSyncing, 
    pendingSync, 
    syncData, 
    clearOfflineData,
    loadOfflineData 
  } = useOffline();

  const offlineData = loadOfflineData();

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-500" />
            )}
            Status de Conectividade
          </div>
          <Badge variant={isOnline ? "default" : "destructive"}>
            {isOnline ? "Online" : "Offline"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status de Sincronização */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="text-sm">Dados pendentes:</span>
          </div>
          <Badge variant="outline">
            {pendingSync} {pendingSync === 1 ? 'item' : 'itens'}
          </Badge>
        </div>

        {/* Última Sincronização */}
        {offlineData.lastSyncTime && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Última sync: {format(offlineData.lastSyncTime, "PPp", { locale: ptBR })}
            </span>
          </div>
        )}

        <Separator />

        {/* Estatísticas Offline */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Tarefas offline:</span>
            <p className="font-medium">{offlineData.tasks.length}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Fila de sync:</span>
            <p className="font-medium">{offlineData.syncQueue.length}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={syncData}
            disabled={!isOnline || isSyncing || pendingSync === 0}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          
          <Button
            onClick={clearOfflineData}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar Cache
          </Button>
        </div>

        {/* Indicador de Sincronização */}
        {isSyncing && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-md">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-primary">
              Sincronizando dados com o servidor...
            </span>
          </div>
        )}

        {/* Aviso Offline */}
        {!isOnline && (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              ⚠️ Modo offline ativo. Suas alterações serão sincronizadas quando a conexão for restaurada.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
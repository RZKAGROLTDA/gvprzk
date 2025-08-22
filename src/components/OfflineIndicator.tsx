import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useOffline } from '@/hooks/useOffline';
import { useProfile } from '@/hooks/useProfile';
import { Wifi, WifiOff, RefreshCw, Database, Clock, Trash2, User, Building } from 'lucide-react';
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
  const {
    profile
  } = useProfile();
  const offlineData = loadOfflineData();
  return <Card className={`border-l-4 ${isOnline ? 'border-l-green-500' : 'border-l-orange-500'} shadow-md`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <div className="flex items-center gap-1">
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-700 dark:text-green-400">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <WifiOff className="h-4 w-4 text-orange-500" />
                <span className="text-orange-700 dark:text-orange-400">Offline</span>
              </div>
            )}
          </div>
          <Badge 
            variant={isOnline ? "default" : "secondary"} 
            className={`text-xs ${isOnline ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'}`}
          >
            {pendingSync > 0 ? `${pendingSync} pendente${pendingSync > 1 ? 's' : ''}` : '✅ Sincronizado'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        {/* Informações do Usuário - Mais compacto */}
        <div className="bg-secondary/20 rounded-lg p-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-primary" />
              <span className="font-medium truncate">{profile?.name || 'Carregando...'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Building className="h-3 w-3 text-primary" />
              <span className="truncate">{profile?.filial_nome || 'Sem filial'}</span>
            </div>
          </div>
        </div>

        {/* Status Compacto */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Database className="h-3 w-3" />
              <span className="font-medium">{pendingSync}</span>
            </div>
            <span className="text-muted-foreground">Pendentes</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="font-medium">{offlineData.tasks.length}</span>
            </div>
            <span className="text-muted-foreground">Offline</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="font-medium">{offlineData.syncQueue.length}</span>
            </div>
            <span className="text-muted-foreground">Fila</span>
          </div>
        </div>

        {/* Última Sincronização - Mais compacto */}
        {offlineData.lastSyncTime && (
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {format(offlineData.lastSyncTime, "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-1">
          <Button 
            onClick={syncData} 
            disabled={!isOnline || isSyncing || pendingSync === 0} 
            size="sm" 
            variant="outline" 
            className="flex-1 h-7 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sync...' : 'Sincronizar'}
          </Button>
          
          <Button 
            onClick={clearOfflineData} 
            size="sm" 
            variant="outline" 
            className="h-7 px-2"
            title="Limpar cache offline"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        {/* Indicador de Sincronização */}
        {isSyncing && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-md">
            <RefreshCw className="h-3 w-3 animate-spin text-primary" />
            <span className="text-xs text-primary">Sincronizando...</span>
          </div>
        )}

        {/* Aviso Offline */}
        {!isOnline && (
          <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-md">
            <p className="text-xs text-orange-700 dark:text-orange-300 text-center">
              ⚠️ Modo offline - dados serão sincronizados quando conectar
            </p>
          </div>
        )}
      </CardContent>
    </Card>;
};
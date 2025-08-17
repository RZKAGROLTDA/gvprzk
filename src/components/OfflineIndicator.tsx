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
  return <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            {isOnline ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
            Status de Conectividade
          </div>
          <Badge variant={isOnline ? "default" : "destructive"} className="text-xs">
            {isOnline ? "Online" : "Offline"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-1">
        {/* Informações do Usuário */}
        <div className="bg-secondary/20 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-primary" />
            <span className="text-xs font-medium">Vendedor:</span>
            <span className="text-xs">{profile?.name || 'Carregando...'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building className="h-3 w-3 text-primary" />
            <span className="text-xs font-medium">Filial:</span>
            <span className="text-xs">{profile?.filial_nome || 'Não informado'}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-primary" />
            <span className="text-xs font-medium">Email:</span>
            <span className="text-xs">{profile?.email || 'Não informado'}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-primary" />
            <span className="text-xs font-medium">Cargo:</span>
            <span className="text-xs">{profile?.role === 'manager' ? 'Gerente' : profile?.role === 'supervisor' ? 'Supervisor' : profile?.role === 'sales_consultant' ? 'Consultor de Vendas' : profile?.role === 'rac' ? 'RAC' : profile?.role === 'technical_consultant' ? 'Consultor Técnico' : profile?.role || 'Não informado'}</span>
          </div>
        </div>

        <Separator className="my-1" />
        
        {/* Status de Sincronização */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-3 w-3" />
            <span className="text-xs">Dados pendentes:</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {pendingSync} {pendingSync === 1 ? 'item' : 'itens'}
          </Badge>
        </div>

        {/* Última Sincronização */}
        {offlineData.lastSyncTime && <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              Última sync: {format(offlineData.lastSyncTime, "PPp", {
            locale: ptBR
          })}
            </span>
          </div>}

        <Separator className="my-1" />

        {/* Estatísticas Offline */}
        <div className="grid grid-cols-2 gap-2 text-xs">
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
        <div className="flex gap-2 pt-1">
          <Button onClick={syncData} disabled={!isOnline || isSyncing || pendingSync === 0} size="sm" variant="outline" className="flex-1 h-7 text-xs">
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          
          <Button onClick={clearOfflineData} size="sm" variant="outline" className="flex-1 h-7 text-xs">
            <Trash2 className="h-3 w-3 mr-1" />
            Limpar Cache
          </Button>
        </div>

        {/* Indicador de Sincronização */}
        {isSyncing && <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-md">
            <RefreshCw className="h-3 w-3 animate-spin text-primary" />
            <span className="text-xs text-primary">
              Sincronizando dados com o servidor...
            </span>
          </div>}

        {/* Aviso Offline */}
        {!isOnline && <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              ⚠️ Modo offline ativo. Suas alterações serão sincronizadas quando a conexão for restaurada.
            </p>
          </div>}
      </CardContent>
    </Card>;
};
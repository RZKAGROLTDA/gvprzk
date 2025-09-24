import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEmergencyData } from '@/hooks/useEmergencyData';
import { useAuth } from '@/hooks/useAuth';
import { Wifi, WifiOff, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export const EmergencyDashboard: React.FC = () => {
  const { user } = useAuth();
  const { 
    isConnected, 
    lastPing, 
    connectionAttempts, 
    emergencyMode,
    testConnection,
    getEmergencyTasks,
    forceReconnect
  } = useEmergencyData();
  
  const [emergencyTasks, setEmergencyTasks] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Teste automático de conectividade
  useEffect(() => {
    if (user) {
      testConnection();
      const interval = setInterval(testConnection, 5000); // A cada 5s
      return () => clearInterval(interval);
    }
  }, [user, testConnection]);

  const handleEmergencyLoad = async () => {
    setIsLoading(true);
    try {
      const tasks = await getEmergencyTasks();
      setEmergencyTasks(tasks);
      
      if (tasks.length > 0) {
        toast({
          title: "🚨 Dados de Emergência Carregados",
          description: `${tasks.length} registros encontrados`,
        });
      } else {
        toast({
          title: "⚠️ Nenhum Dado Encontrado",
          description: "Mesmo no modo emergência",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "❌ Falha no Carregamento",
        description: "Erro no modo emergência",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!user) return 'secondary';
    if (emergencyMode) return 'destructive';
    if (!isConnected) return 'destructive';
    return 'default';
  };

  const getStatusIcon = () => {
    if (!user) return <AlertTriangle className="w-4 h-4" />;
    if (emergencyMode) return <AlertTriangle className="w-4 h-4" />;
    if (!isConnected) return <WifiOff className="w-4 h-4" />;
    return <Wifi className="w-4 h-4" />;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          Sistema de Emergência
          <Badge variant={getStatusColor()}>
            {!user ? 'Não Logado' : 
             emergencyMode ? 'EMERGÊNCIA' : 
             isConnected ? 'CONECTADO' : 'OFFLINE'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status da Conexão */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Último Ping:</strong>
            <br />
            {lastPing ? lastPing.toLocaleTimeString() : 'Nunca'}
          </div>
          <div>
            <strong>Tentativas:</strong>
            <br />
            {connectionAttempts}/3
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={testConnection}
            variant="outline"
            size="sm"
          >
            <Wifi className="w-4 h-4 mr-2" />
            Testar Conexão
          </Button>
          
          <Button 
            onClick={forceReconnect}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Força Reconexão
          </Button>
          
          <Button 
            onClick={handleEmergencyLoad}
            variant={emergencyMode ? "destructive" : "secondary"}
            size="sm"
            disabled={isLoading}
          >
            <Zap className="w-4 h-4 mr-2" />
            {isLoading ? 'Carregando...' : 'Modo Emergência'}
          </Button>
        </div>

        {/* Dados de Emergência */}
        {emergencyTasks.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Dados de Emergência ({emergencyTasks.length})</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {emergencyTasks.map((task, index) => (
                <div key={task.id} className="text-xs p-2 bg-muted rounded">
                  <strong>{task.name}</strong> - {task.responsible} 
                  <Badge variant="outline" className="ml-2 text-xs">
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alertas */}
        {emergencyMode && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4" />
              <strong>MODO EMERGÊNCIA ATIVO</strong>
            </div>
            <p className="text-xs mt-1 text-muted-foreground">
              Múltiplas falhas de conectividade detectadas. Usando acesso simplificado.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTasksOptimized } from '@/hooks/useTasksOptimized';
import { useAuth } from '@/hooks/useAuth';
import { Activity, Wifi, WifiOff, AlertTriangle, CheckCircle, RefreshCw, Zap } from 'lucide-react';

export const TasksHealthMonitor: React.FC = () => {
  const { user, session } = useAuth();
  const { 
    tasks, 
    loading, 
    error, 
    debugInfo, 
    diagnose, 
    forceRefresh, 
    resetAndRefresh, 
    emergencyAccess 
  } = useTasksOptimized();
  
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'warning' | 'critical'>('healthy');
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [emergencyData, setEmergencyData] = useState<any>(null);

  // Monitoramento automático da saúde
  useEffect(() => {
    if (error || !tasks?.length) {
      setHealthStatus('critical');
    } else if (debugInfo.lastError || debugInfo.sessionStatus !== 'valid') {
      setHealthStatus('warning');
    } else {
      setHealthStatus('healthy');
    }
  }, [error, tasks, debugInfo]);

  const runDiagnostic = async () => {
    setIsRunningDiagnostic(true);
    try {
      const results = await diagnose();
      setDiagnosticResults(results);
    } catch (error) {
      console.error('Erro no diagnóstico:', error);
    }
    setIsRunningDiagnostic(false);
  };

  const handleEmergencyAccess = async () => {
    try {
      const data = await emergencyAccess();
      setEmergencyData(data);
    } catch (error) {
      console.error('Erro no acesso de emergência:', error);
    }
  };

  const getHealthIcon = () => {
    switch (healthStatus) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical': return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
  };

  const getHealthColor = () => {
    switch (healthStatus) {
      case 'healthy': return 'bg-green-50 border-green-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'critical': return 'bg-red-50 border-red-200';
    }
  };

  return (
    <Card className={`w-full border-2 ${getHealthColor()}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getHealthIcon()}
            <CardTitle>Monitor de Saúde - Tasks</CardTitle>
            <Badge variant={healthStatus === 'healthy' ? 'default' : 'destructive'}>
              {healthStatus.toUpperCase()}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={runDiagnostic}
              disabled={isRunningDiagnostic}
              variant="outline"
              size="sm"
            >
              {isRunningDiagnostic ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Activity className="h-4 w-4 mr-2" />
              )}
              Diagnóstico
            </Button>
            <Button
              onClick={forceRefresh}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={resetAndRefresh}
              variant="outline"
              size="sm"
            >
              <Zap className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status em Tempo Real */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>Usuário: {user ? 'Conectado' : 'Desconectado'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${session ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>Sessão: {debugInfo.sessionStatus}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            <span>Loading: {loading ? 'Sim' : 'Não'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${tasks?.length ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>Tasks: {tasks?.length || 0}</span>
          </div>
        </div>

        {/* Informações de Debug */}
        {debugInfo && (
          <div className="bg-background/50 border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2">Informações de Debug</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="font-medium">Última Tentativa:</span>
                <div>{debugInfo.lastAttempt?.toLocaleString() || 'Nunca'}</div>
              </div>
              <div>
                <span className="font-medium">Tentativas por Função:</span>
                <div>
                  Segura: {debugInfo.functionAttempts.secure} | 
                  Fallback: {debugInfo.functionAttempts.fallback} | 
                  Direta: {debugInfo.functionAttempts.direct}
                </div>
              </div>
              <div>
                <span className="font-medium">Último Erro:</span>
                <div className="text-red-600">
                  {debugInfo.lastError ? 
                    (typeof debugInfo.lastError === 'string' ? 
                      debugInfo.lastError : 
                      debugInfo.lastError.message || 'Erro desconhecido') 
                    : 'Nenhum'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resultados do Diagnóstico */}
        {diagnosticResults && (
          <div className="bg-background/50 border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2">Resultados do Diagnóstico</h4>
            <pre className="text-xs overflow-auto max-h-40">
              {JSON.stringify(diagnosticResults, null, 2)}
            </pre>
          </div>
        )}

        {/* Acesso de Emergência (só para managers) */}
        {user && (
          <div className="flex gap-2">
            <Button
              onClick={handleEmergencyAccess}
              variant="destructive"
              size="sm"
              className="text-xs"
            >
              <Zap className="h-3 w-3 mr-1" />
              Acesso Emergência (Manager)
            </Button>
            {emergencyData && (
              <Badge variant="outline">
                Emergência: {emergencyData?.length || 0} tasks
              </Badge>
            )}
          </div>
        )}

        {/* Mensagem de Status */}
        {healthStatus === 'critical' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <strong>⚠️ Sistema com Problemas:</strong> Não foi possível carregar os dados. 
            Tente executar um diagnóstico ou reset completo.
          </div>
        )}
        
        {healthStatus === 'warning' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <strong>🟡 Atenção:</strong> Sistema funcionando com limitações. 
            Alguns recursos podem estar indisponíveis.
          </div>
        )}
        
        {healthStatus === 'healthy' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            <strong>✅ Sistema Saudável:</strong> Todos os componentes funcionando normalmente.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
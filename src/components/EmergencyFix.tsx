import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Database, AlertTriangle, RefreshCw, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CleanupResult {
  operation: string;
  success: boolean;
  message: string;
  details?: any;
}

export const EmergencyFix: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<CleanupResult[]>([]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    const diagnostics: CleanupResult[] = [];

    try {
      // Teste 1: Verificar conectividade básica
      const connectTest = await supabase.from('profiles').select('count').limit(1);
      diagnostics.push({
        operation: 'Conectividade Básica',
        success: !connectTest.error,
        message: connectTest.error ? connectTest.error.message : 'Conexão OK'
      });

      // Teste 2: Verificar funções problemáticas
      const functionsTest = await supabase.rpc('get_secure_task_data').limit(1);
      diagnostics.push({
        operation: 'Funções RPC',
        success: !functionsTest.error,
        message: functionsTest.error ? functionsTest.error.message : 'RPC OK'
      });

      // Teste 3: Verificar tabelas críticas
      const tablesTest = await supabase.from('tasks').select('id').limit(1);
      diagnostics.push({
        operation: 'Acesso a Tabelas',
        success: !tablesTest.error,
        message: tablesTest.error ? tablesTest.error.message : 'Tabelas OK'
      });

      setResults(diagnostics);
    } catch (error: any) {
      console.error('Erro nos diagnósticos:', error);
      diagnostics.push({
        operation: 'Sistema',
        success: false,
        message: `Erro crítico: ${error.message}`
      });
      setResults(diagnostics);
    } finally {
      setIsRunning(false);
    }
  };

  const runEmergencyCleanup = async () => {
    setIsRunning(true);
    setResults([]);
    const cleanupResults: CleanupResult[] = [];

    try {
      console.log('🚨 Iniciando limpeza de emergência...');

      // Etapa 1: Chamar função edge de limpeza
      try {
        const { data, error } = await supabase.functions.invoke('emergency-cleanup', {
          body: { action: 'full_cleanup' }
        });
        
        cleanupResults.push({
          operation: 'Limpeza Edge Function',
          success: !error,
          message: error ? error.message : 'Limpeza automática executada',
          details: data
        });
      } catch (error: any) {
        cleanupResults.push({
          operation: 'Limpeza Edge Function',
          success: false,
          message: `Erro na função edge: ${error.message}`
        });
      }

      // Etapa 2: Limpeza direta via SQL (fallback)
      try {
        // Limpar logs antigos
        const logsCleanup = await supabase
          .from('postgres_logs')
          .delete()
          .lt('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        cleanupResults.push({
          operation: 'Limpeza de Logs',
          success: !logsCleanup.error,
          message: logsCleanup.error ? logsCleanup.error.message : 'Logs antigos removidos'
        });
      } catch (error: any) {
        cleanupResults.push({
          operation: 'Limpeza de Logs',
          success: false,
          message: `Erro: ${error.message}`
        });
      }

      // Etapa 3: Verificar integridade após limpeza
      const integrityCheck = await supabase.from('profiles').select('count').limit(1);
      cleanupResults.push({
        operation: 'Verificação Final',
        success: !integrityCheck.error,
        message: integrityCheck.error ? 'Sistema ainda instável' : 'Sistema estabilizado'
      });

      setResults(cleanupResults);
      
      const allSuccess = cleanupResults.every(r => r.success);
      if (allSuccess) {
        toast.success('✅ Limpeza de emergência concluída com sucesso!');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      } else {
        toast.error('⚠️ Limpeza parcial. Alguns problemas persistem.');
      }

    } catch (error: any) {
      console.error('❌ Erro na limpeza de emergência:', error);
      cleanupResults.push({
        operation: 'Sistema',
        success: false,
        message: `Erro crítico: ${error.message}`
      });
      setResults(cleanupResults);
    } finally {
      setIsRunning(false);
    }
  };

  const forceSystemReset = async () => {
    if (!confirm('⚠️ ATENÇÃO: Isso irá resetar configurações críticas do sistema. Continuar?')) {
      return;
    }

    setIsRunning(true);
    setResults([]);

    try {
      console.log('🔄 Executando reset forçado do sistema...');
      
      // Reset completo via edge function
      const { data, error } = await supabase.functions.invoke('emergency-cleanup', {
        body: { action: 'force_reset' }
      });

      setResults([{
        operation: 'Reset Forçado',
        success: !error,
        message: error ? error.message : 'Sistema resetado com sucesso',
        details: data
      }]);

      if (!error) {
        toast.success('✅ Reset do sistema concluído!');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      }
    } catch (error: any) {
      console.error('❌ Erro no reset forçado:', error);
      setResults([{
        operation: 'Reset Forçado',
        success: false,
        message: `Erro: ${error.message}`
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="h-6 w-6" />
              🚨 FERRAMENTA DE EMERGÊNCIA
            </CardTitle>
            <CardDescription>
              Diagnóstico e correção de problemas críticos do sistema.
              Use quando o sistema estiver inacessível ou com timeouts.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert className="border-destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>ATENÇÃO:</strong> Esta ferramenta executa operações críticas no sistema.
                Use apenas quando necessário e siga as instruções cuidadosamente.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-3">
              <Button 
                onClick={runDiagnostics}
                disabled={isRunning}
                variant="outline"
                className="h-20 flex-col gap-2"
              >
                {isRunning ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <Database className="h-6 w-6" />
                )}
                <span className="text-sm">Executar Diagnóstico</span>
              </Button>

              <Button 
                onClick={runEmergencyCleanup}
                disabled={isRunning}
                variant="destructive"
                className="h-20 flex-col gap-2"
              >
                {isRunning ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <Trash2 className="h-6 w-6" />
                )}
                <span className="text-sm">Limpeza de Emergência</span>
              </Button>

              <Button 
                onClick={forceSystemReset}
                disabled={isRunning}
                variant="destructive"
                className="h-20 flex-col gap-2 bg-red-700 hover:bg-red-800"
              >
                {isRunning ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
                <span className="text-sm">Reset Forçado</span>
              </Button>
            </div>

            {results.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resultados da Operação</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {results.map((result, index) => (
                      <div 
                        key={index}
                        className={`p-3 rounded border flex items-start gap-3 ${
                          result.success 
                            ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' 
                            : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {result.operation}: {result.success ? '✅ Sucesso' : '❌ Falha'}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {result.message}
                          </div>
                          {result.details && (
                            <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                              {JSON.stringify(result.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-center">
              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/dashboard'}
                className="w-full"
              >
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
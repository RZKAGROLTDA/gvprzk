import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Activity, AlertCircle, CheckCircle, Clock, Database, User, Wifi } from 'lucide-react';

interface DiagnosticResult {
  test: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  data?: any;
  timestamp: Date;
}

export const DashboardDiagnostic: React.FC = () => {
  const { user } = useAuth();
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (test: string, status: 'success' | 'error' | 'warning', message: string, data?: any) => {
    setResults(prev => [...prev, {
      test,
      status,
      message,
      data,
      timestamp: new Date()
    }]);
  };

  const runDashboardDiagnostic = async () => {
    setIsRunning(true);
    setResults([]);

    try {
      // 1. Teste de autenticação
      addResult('Authentication', user ? 'success' : 'error', 
        user ? `Usuário autenticado: ${user.email}` : 'Usuário não autenticado');

      if (!user) {
        setIsRunning(false);
        return;
      }

      // 2. Teste de perfil do usuário
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError) {
          addResult('User Profile', 'error', `Erro ao buscar perfil: ${profileError.message}`, profileError);
        } else if (!profile) {
          addResult('User Profile', 'warning', 'Perfil não encontrado', null);
        } else {
          addResult('User Profile', 'success', 
            `Perfil encontrado: ${profile.name} (${profile.role}) - Status: ${profile.approval_status}`, profile);
        }
      } catch (error) {
        addResult('User Profile', 'error', `Erro crítico no perfil: ${error}`, error);
      }

      // 3. Teste de conectividade com tasks
      try {
        const startTime = performance.now();
        const { data: directTasks, error: directError } = await supabase
          .from('tasks')
          .select('id, name, client, created_by')
          .limit(5);
          
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);

        if (directError) {
          addResult('Direct Tasks Query', 'error', `Erro no acesso direto: ${directError.message}`, directError);
        } else {
          addResult('Direct Tasks Query', 'success', 
            `Acesso direto funcionando: ${directTasks?.length || 0} tasks (${responseTime}ms)`, 
            { count: directTasks?.length, responseTime });
        }
      } catch (error) {
        addResult('Direct Tasks Query', 'error', `Erro na query direta: ${error}`, error);
      }

      // 4. Teste da função segura
      try {
        const startTime = performance.now();
        const { data: secureTasks, error: secureError } = await supabase
          .rpc('get_secure_tasks_with_customer_protection');
          
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);

        if (secureError) {
          addResult('Secure Function', 'error', `Função segura falhou: ${secureError.message}`, secureError);
        } else {
          addResult('Secure Function', 'success', 
            `Função segura funcionando: ${secureTasks?.length || 0} tasks (${responseTime}ms)`, 
            { count: secureTasks?.length, responseTime });
        }
      } catch (error) {
        addResult('Secure Function', 'error', `Erro na função segura: ${error}`, error);
      }

      // 5. Teste da função alternativa
      try {
        const startTime = performance.now();
        const { data: fallbackTasks, error: fallbackError } = await supabase
          .rpc('get_secure_customer_data_enhanced');
          
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);

        if (fallbackError) {
          addResult('Fallback Function', 'error', `Função alternativa falhou: ${fallbackError.message}`, fallbackError);
        } else {
          addResult('Fallback Function', 'success', 
            `Função alternativa funcionando: ${fallbackTasks?.length || 0} tasks (${responseTime}ms)`, 
            { count: fallbackTasks?.length, responseTime });
        }
      } catch (error) {
        addResult('Fallback Function', 'error', `Erro na função alternativa: ${error}`, error);
      }

      // 6. Teste de filiais
      try {
        const { data: filiais, error: filiaisError } = await supabase
          .from('filiais')
          .select('id, nome')
          .limit(5);

        if (filiaisError) {
          addResult('Filiais Access', 'error', `Erro ao acessar filiais: ${filiaisError.message}`, filiaisError);
        } else {
          addResult('Filiais Access', 'success', 
            `Filiais acessíveis: ${filiais?.length || 0}`, filiais);
        }
      } catch (error) {
        addResult('Filiais Access', 'error', `Erro crítico em filiais: ${error}`, error);
      }

      // 7. Verificar logs de segurança recentes
      try {
        const { data: securityLogs, error: logsError } = await supabase
          .from('security_audit_log')
          .select('event_type, created_at, risk_score, metadata')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (logsError) {
          addResult('Security Logs', 'warning', `Não foi possível acessar logs: ${logsError.message}`, logsError);
        } else {
          addResult('Security Logs', 'success', 
            `Logs de segurança: ${securityLogs?.length || 0} eventos recentes`, securityLogs);
        }
      } catch (error) {
        addResult('Security Logs', 'warning', `Erro ao acessar logs: ${error}`, error);
      }

      // 8. Teste de timing de requests
      const requestTimes = results
        .filter(r => r.data?.responseTime)
        .map(r => r.data.responseTime);
        
      if (requestTimes.length > 0) {
        const avgTime = Math.round(requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length);
        const maxTime = Math.max(...requestTimes);
        
        addResult('Performance', avgTime < 2000 ? 'success' : avgTime < 5000 ? 'warning' : 'error',
          `Tempo médio de resposta: ${avgTime}ms (máximo: ${maxTime}ms)`, 
          { average: avgTime, maximum: maxTime, samples: requestTimes.length });
      }

    } catch (error) {
      addResult('System', 'error', `Erro geral do sistema: ${error}`, error);
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>Diagnóstico do Dashboard</CardTitle>
          </div>
          <Button 
            onClick={runDashboardDiagnostic}
            disabled={isRunning}
            variant="outline"
            size="sm"
          >
            {isRunning ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Executar Diagnóstico
              </>
            )}
          </Button>
        </div>
        
        {results.length > 0 && (
          <div className="flex gap-2 mt-2">
            {successCount > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                ✅ {successCount} Sucessos
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                ⚠️ {warningCount} Avisos
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                ❌ {errorCount} Erros
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {results.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Clique em "Executar Diagnóstico" para verificar o status do sistema</p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((result, index) => (
              <div 
                key={index}
                className={`p-3 rounded-lg border ${getStatusColor(result.status)}`}
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(result.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{result.test}</span>
                      <span className="text-xs text-muted-foreground">
                        {result.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                    
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                          Ver detalhes técnicos
                        </summary>
                        <pre className="text-xs mt-1 p-2 bg-background/50 rounded border overflow-auto max-h-32">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
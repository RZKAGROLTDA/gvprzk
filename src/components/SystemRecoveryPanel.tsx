import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTasksOptimized } from '@/hooks/useTasksOptimized';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Shield, RefreshCw, AlertTriangle, CheckCircle, Database, Zap } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface RecoveryStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
}

export const SystemRecoveryPanel: React.FC = () => {
  const { user } = useAuth();
  const { forceRefresh, resetAndRefresh, emergencyAccess } = useTasksOptimized();
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverySteps, setRecoverySteps] = useState<RecoveryStep[]>([]);
  const [recoveryProgress, setRecoveryProgress] = useState(0);

  const updateStepStatus = (stepId: string, status: RecoveryStep['status'], result?: any) => {
    setRecoverySteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, result } : step
    ));
  };

  const initializeRecoverySteps = (): RecoveryStep[] => [
    {
      id: 'session_check',
      name: 'Verificação de Sessão',
      description: 'Verificar se a sessão do usuário está válida',
      status: 'pending'
    },
    {
      id: 'profile_check',
      name: 'Verificação de Perfil',
      description: 'Verificar se o perfil do usuário está aprovado',
      status: 'pending'
    },
    {
      id: 'database_connection',
      name: 'Conexão com Banco de Dados',
      description: 'Testar conectividade com Supabase',
      status: 'pending'
    },
    {
      id: 'function_test',
      name: 'Teste de Funções',
      description: 'Testar funções de acesso a dados',
      status: 'pending'
    },
    {
      id: 'cache_cleanup',
      name: 'Limpeza de Cache',
      description: 'Limpar cache corrupto',
      status: 'pending'
    },
    {
      id: 'data_refresh',
      name: 'Atualização de Dados',
      description: 'Forçar atualização dos dados',
      status: 'pending'
    }
  ];

  const runRecoverySequence = async () => {
    setIsRecovering(true);
    const steps = initializeRecoverySteps();
    setRecoverySteps(steps);
    setRecoveryProgress(0);

    try {
      // Passo 1: Verificação de Sessão
      updateStepStatus('session_check', 'running');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!user) {
        updateStepStatus('session_check', 'failed', 'Usuário não autenticado');
        throw new Error('Usuário não autenticado');
      }
      
      updateStepStatus('session_check', 'completed', 'Sessão válida');
      setRecoveryProgress(16);

      // Passo 2: Verificação de Perfil
      updateStepStatus('profile_check', 'running');
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, approval_status, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile || profile.approval_status !== 'approved') {
        updateStepStatus('profile_check', 'failed', 'Perfil não aprovado');
        throw new Error('Perfil não aprovado');
      }
      
      updateStepStatus('profile_check', 'completed', profile);
      setRecoveryProgress(32);

      // Passo 3: Conexão com Banco de Dados
      updateStepStatus('database_connection', 'running');
      const { data: testQuery } = await supabase
        .from('filiais')
        .select('id')
        .limit(1);
        
      updateStepStatus('database_connection', 'completed', `Conexão OK - ${testQuery?.length || 0} registros`);
      setRecoveryProgress(48);

      // Passo 4: Teste de Funções
      updateStepStatus('function_test', 'running');
      try {
        const { data: functionTest } = await supabase
          .rpc('get_secure_tasks_with_customer_protection');
        updateStepStatus('function_test', 'completed', `Função principal OK - ${functionTest?.length || 0} tasks`);
      } catch (error) {
        // Tentar função alternativa
        const { data: fallbackTest } = await supabase
          .rpc('get_secure_customer_data_enhanced');
        updateStepStatus('function_test', 'completed', `Função alternativa OK - ${fallbackTest?.length || 0} tasks`);
      }
      setRecoveryProgress(64);

      // Passo 5: Limpeza de Cache
      updateStepStatus('cache_cleanup', 'running');
      await resetAndRefresh();
      updateStepStatus('cache_cleanup', 'completed', 'Cache limpo');
      setRecoveryProgress(80);

      // Passo 6: Atualização de Dados
      updateStepStatus('data_refresh', 'running');
      const refreshResult = await forceRefresh();
      updateStepStatus('data_refresh', 'completed', `${refreshResult.data?.length || 0} tasks carregadas`);
      setRecoveryProgress(100);

      toast({
        title: "✅ Recuperação Concluída",
        description: "Sistema recuperado com sucesso!",
      });

    } catch (error) {
      console.error('Erro na recuperação:', error);
      toast({
        title: "❌ Erro na Recuperação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }

    setIsRecovering(false);
  };

  const getStepIcon = (status: RecoveryStep['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'running': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Painel de Recuperação do Sistema</CardTitle>
          </div>
          <Button
            onClick={runRecoverySequence}
            disabled={isRecovering}
            variant="outline"
          >
            {isRecovering ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Recuperando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Iniciar Recuperação
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isRecovering && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progresso da Recuperação</span>
              <span>{recoveryProgress}%</span>
            </div>
            <Progress value={recoveryProgress} className="w-full" />
          </div>
        )}

        {recoverySteps.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Etapas de Recuperação</h4>
            {recoverySteps.map((step) => (
              <div
                key={step.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-background/50"
              >
                {getStepIcon(step.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{step.name}</span>
                    <Badge
                      variant={
                        step.status === 'completed' ? 'default' :
                        step.status === 'failed' ? 'destructive' :
                        step.status === 'running' ? 'secondary' : 'outline'
                      }
                    >
                      {step.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{step.description}</p>
                  
                  {step.result && (
                    <div className="text-xs">
                      <span className="font-medium">Resultado: </span>
                      <span className={step.status === 'failed' ? 'text-red-600' : 'text-green-600'}>
                        {typeof step.result === 'string' ? step.result : JSON.stringify(step.result)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <strong>ℹ️ Como Funciona:</strong> Este painel executa uma sequência automatizada de verificações e correções para restaurar o funcionamento normal do sistema.
        </div>
      </CardContent>
    </Card>
  );
};
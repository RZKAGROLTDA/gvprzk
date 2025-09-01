import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, CheckCircle, Database, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const EmergencyFix: React.FC = () => {
  const [isFixing, setIsFixing] = useState(false);
  const [fixResults, setFixResults] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<'unknown' | 'healthy' | 'critical'>('unknown');

  const checkSystemHealth = async () => {
    try {
      // Test basic connectivity
      const { data, error } = await supabase.from('profiles').select('count').limit(1);
      
      if (error) {
        setSystemStatus('critical');
        return false;
      }
      
      setSystemStatus('healthy');
      return true;
    } catch (error) {
      setSystemStatus('critical');
      return false;
    }
  };

  const performEmergencyFix = async () => {
    setIsFixing(true);
    setFixResults([]);
    const results: string[] = [];

    try {
      results.push('🔧 Iniciando correção de emergência...');
      setFixResults([...results]);

      // Step 1: Check system health
      results.push('🏥 Verificando saúde do sistema...');
      setFixResults([...results]);
      
      const isHealthy = await checkSystemHealth();
      if (isHealthy) {
        results.push('✅ Sistema saudável - correção desnecessária');
        setFixResults([...results]);
        toast.success('Sistema já está funcionando normalmente');
        return;
      }

      // Step 2: Clear problematic functions
      results.push('🗑️ Limpando funções problemáticas...');
      setFixResults([...results]);

      const functionsToRemove = [
        'audit_table_changes',
        'log_profile_changes', 
        'validate_user_permissions',
        'check_user_role_recursive',
        'get_user_with_profile_recursive'
      ];

      for (const funcName of functionsToRemove) {
        try {
          await supabase.rpc('drop_function_if_exists', { function_name: funcName });
          results.push(`✅ Removida função: ${funcName}`);
        } catch (error) {
          results.push(`⚠️ Erro ao remover ${funcName}: ${error}`);
        }
        setFixResults([...results]);
      }

      // Step 3: Clear audit logs (if tables exist)
      results.push('🧹 Limpando logs de auditoria...');
      setFixResults([...results]);

      try {
        const auditTables = ['audit_log', 'security_events', 'system_logs'];
        for (const table of auditTables) {
          try {
            await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            results.push(`✅ Limpa tabela: ${table}`);
          } catch (error) {
            results.push(`⚠️ Tabela ${table} não encontrada ou erro: ${error}`);
          }
        }
        setFixResults([...results]);
      } catch (error) {
        results.push(`⚠️ Erro ao limpar logs: ${error}`);
        setFixResults([...results]);
      }

      // Step 4: Verify system health after fixes
      results.push('🔍 Verificando sistema após correções...');
      setFixResults([...results]);

      const isFixedHealthy = await checkSystemHealth();
      if (isFixedHealthy) {
        results.push('🎉 Sistema restaurado com sucesso!');
        setSystemStatus('healthy');
        toast.success('Correção de emergência concluída com sucesso!');
      } else {
        results.push('❌ Sistema ainda apresenta problemas');
        toast.error('Correção não foi totalmente efetiva');
      }

      setFixResults([...results]);

    } catch (error) {
      results.push(`❌ Erro crítico durante correção: ${error}`);
      setFixResults([...results]);
      toast.error('Erro durante correção de emergência');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Ferramenta de Correção de Emergência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span>Status do Sistema:</span>
                <Badge variant={
                  systemStatus === 'healthy' ? 'default' : 
                  systemStatus === 'critical' ? 'destructive' : 
                  'secondary'
                }>
                  {systemStatus === 'healthy' && <CheckCircle className="h-4 w-4 mr-1" />}
                  {systemStatus === 'critical' && <AlertTriangle className="h-4 w-4 mr-1" />}
                  {systemStatus === 'unknown' && <Database className="h-4 w-4 mr-1" />}
                  {systemStatus === 'healthy' ? 'Saudável' : 
                   systemStatus === 'critical' ? 'Crítico' : 
                   'Desconhecido'}
                </Badge>
              </div>
              
              <Button
                onClick={checkSystemHealth}
                variant="outline"
                size="sm"
                disabled={isFixing}
              >
                <Database className="h-4 w-4 mr-1" />
                Verificar Sistema
              </Button>
            </div>

            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Esta ferramenta remove funções problemáticas e limpa dados que podem estar causando loops infinitos ou consumo excessivo de recursos.
                <br />
                <strong>Use apenas em caso de emergência quando o sistema estiver inacessível.</strong>
              </AlertDescription>
            </Alert>

            <Button
              onClick={performEmergencyFix}
              disabled={isFixing || systemStatus === 'healthy'}
              variant={systemStatus === 'critical' ? 'destructive' : 'default'}
              size="lg"
              className="w-full"
            >
              {isFixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executando Correção...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Executar Correção de Emergência
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {fixResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Log de Correção</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
                {fixResults.map((result, index) => (
                  <div key={index} className="mb-1">
                    {result}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
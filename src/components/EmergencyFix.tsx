import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Database, AlertTriangle, RefreshCw, Trash2, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const EmergencyFix: React.FC = () => {
  const [isFixing, setIsFixing] = useState(false);
  const [isCleaningFunctions, setIsCleaningFunctions] = useState(false);
  const [fixResults, setFixResults] = useState<string[]>([]);

  const executeEmergencyCleanup = async () => {
    setIsFixing(true);
    const results: string[] = [];
    
    try {
      // 1. Remove funções SECURITY DEFINER problemáticas
      const problemFunctions = [
        'get_current_user_role',
        'check_user_permission',
        'get_user_data',
        'validate_user_access'
      ];

      for (const funcName of problemFunctions) {
        try {
          const { error } = await supabase.rpc('execute_sql', {
            query: `DROP FUNCTION IF EXISTS public.${funcName}() CASCADE;`
          });
          if (!error) {
            results.push(`✅ Removida função problemática: ${funcName}`);
          }
        } catch (err) {
          results.push(`⚠️ Erro ao remover ${funcName}: ${err}`);
        }
      }

      // 2. Limpar triggers problemáticos
      const { error: triggerError } = await supabase.rpc('execute_sql', {
        query: `
          DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles CASCADE;
          DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks CASCADE;
          DROP TRIGGER IF EXISTS audit_log_trigger ON public.profiles CASCADE;
        `
      });
      
      if (!triggerError) {
        results.push('✅ Triggers problemáticos removidos');
      }

      // 3. Recriar policies simples
      const { error: policyError } = await supabase.rpc('execute_sql', {
        query: `
          -- Remove todas as policies existentes
          DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
          DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
          DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
          
          -- Recria policies simples
          CREATE POLICY "Enable read access for users based on user_id" 
          ON public.profiles FOR SELECT 
          USING (auth.uid() = user_id);
          
          CREATE POLICY "Enable update for users based on user_id" 
          ON public.profiles FOR UPDATE 
          USING (auth.uid() = user_id);
        `
      });
      
      if (!policyError) {
        results.push('✅ Policies recriadas com segurança');
      }

      // 4. Limpar audit logs antigos
      const { error: auditError } = await supabase
        .from('audit_logs')
        .delete()
        .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      
      if (!auditError) {
        results.push('✅ Logs de auditoria antigos limpos');
      }

      setFixResults(results);
      toast.success('Limpeza de emergência concluída!');
      
    } catch (error) {
      console.error('Erro na limpeza de emergência:', error);
      results.push(`❌ Erro geral: ${error}`);
      setFixResults(results);
      toast.error('Erro durante a limpeza de emergência');
    } finally {
      setIsFixing(false);
    }
  };

  const callEmergencyCleanupFunction = async () => {
    setIsCleaningFunctions(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('emergency-cleanup', {
        body: { action: 'cleanup' }
      });

      if (error) {
        throw error;
      }

      toast.success('Função de limpeza executada com sucesso!');
      setFixResults(prev => [...prev, '✅ Função edge de limpeza executada']);
      
    } catch (error) {
      console.error('Erro ao chamar função de limpeza:', error);
      toast.error('Erro ao executar função de limpeza');
      setFixResults(prev => [...prev, `❌ Erro na função edge: ${error}`]);
    } finally {
      setIsCleaningFunctions(false);
    }
  };

  const resetApplication = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
    toast.success('Aplicação reiniciada!');
  };

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-destructive">
          <CardHeader className="bg-destructive/10">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              Ferramenta de Emergência - Sistema de Recuperação
            </CardTitle>
            <CardDescription>
              Ferramenta para resolver problemas críticos do sistema: timeouts, loops infinitos e funções problemáticas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <Alert className="border-warning bg-warning/10">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>ATENÇÃO:</strong> Esta ferramenta executa operações críticas no banco de dados. 
                Use apenas em caso de problemas graves do sistema.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Database className="h-5 w-5" />
                    Limpeza Direta do DB
                  </CardTitle>
                  <CardDescription>
                    Remove funções SECURITY DEFINER problemáticas e triggers que causam loops infinitos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={executeEmergencyCleanup}
                    disabled={isFixing}
                    variant="destructive"
                    className="w-full"
                  >
                    {isFixing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Executando Limpeza...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Executar Limpeza de Emergência
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="h-5 w-5" />
                    Função Edge de Limpeza
                  </CardTitle>
                  <CardDescription>
                    Chama a função edge para limpeza avançada do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={callEmergencyCleanupFunction}
                    disabled={isCleaningFunctions}
                    variant="outline"
                    className="w-full"
                  >
                    {isCleaningFunctions ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Chamando Função...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Chamar Função de Limpeza
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <RefreshCw className="h-5 w-5" />
                  Reiniciar Aplicação
                </CardTitle>
                <CardDescription>
                  Limpa cache local e reinicia a aplicação
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={resetApplication}
                  variant="secondary"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reiniciar Aplicação
                </Button>
              </CardContent>
            </Card>

            {fixResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Resultados da Limpeza</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {fixResults.map((result, index) => (
                      <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                        {result}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
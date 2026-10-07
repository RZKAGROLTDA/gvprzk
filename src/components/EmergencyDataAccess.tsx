import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Database, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const EmergencyDataAccess: React.FC = () => {
  const { user } = useAuth();
  const [isTestingAccess, setIsTestingAccess] = useState(false);
  const [accessResults, setAccessResults] = useState<any>(null);

  const testDataAccess = async () => {
    if (!user) return;

    setIsTestingAccess(true);
    try {
      console.log('🔧 Testando acesso de emergência aos dados...');

      // Teste 1: Query direta na tabela tasks
      const directQuery = await supabase
        .from('tasks')
        .select('id, name, client, created_at')
        .limit(5);

      // Teste 2: Função RPC básica
      // Escopo aplicado no servidor: Supervisor só pela Filial Ativa validada;
      // Admin/Gerente e demais cargos com o comportamento atual.
      const firstTaskId = directQuery.data?.[0]?.id;
      const rpcQuery = firstTaskId
        ? await supabase.rpc('get_secure_task_data', { task_id_param: firstTaskId })
        : { data: [] as unknown[], error: null as { message: string } | null };

      // Teste 3: Verificar perfil do usuário
      const profileQuery = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const results = {
        directQuery: {
          success: !directQuery.error,
          error: directQuery.error?.message,
          count: directQuery.data?.length || 0
        },
        rpcQuery: {
          success: !rpcQuery.error,
          error: rpcQuery.error?.message,
          count: rpcQuery.data?.length || 0
        },
        profile: {
          exists: !!profileQuery.data,
          error: profileQuery.error?.message,
          data: profileQuery.data
        }
      };

      setAccessResults(results);
      
      if (results.directQuery.success || results.rpcQuery.success) {
        toast.success('✅ Acesso aos dados funcionando!');
      } else {
        toast.error('❌ Problemas de acesso detectados');
      }

    } catch (error: any) {
      console.error('❌ Erro no teste de emergência:', error);
      toast.error('❌ Erro no teste de acesso');
    } finally {
      setIsTestingAccess(false);
    }
  };

  const fixProfileAccess = async () => {
    if (!user) return;

    try {
      console.log('🔧 Corrigindo acesso do perfil...');

      // Buscar filial padrão
      const { data: defaultFilial } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome')
        .limit(1)
        .single();

      // Criar ou atualizar perfil
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
          email: user.email || '',
          role: 'consultant',
          filial_id: defaultFilial?.id || null,
          approval_status: 'approved'
        }, {
          onConflict: 'user_id'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast.success('✅ Perfil corrigido! Recarregando dados...');
      
      // Recarregar página para aplicar mudanças
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error: any) {
      console.error('❌ Erro ao corrigir perfil:', error);
      toast.error('❌ Erro ao corrigir perfil');
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Acesso de Emergência aos Dados
        </CardTitle>
        <CardDescription>
          Diagnóstico e correção de problemas de acesso aos dados
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Esta ferramenta diagnostica e corrige problemas de acesso aos dados.
            Use apenas se estiver enfrentando lentidão ou erros de carregamento.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button 
            onClick={testDataAccess}
            disabled={isTestingAccess}
            variant="outline"
            className="flex-1"
          >
            {isTestingAccess ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Testar Acesso
              </>
            )}
          </Button>

          <Button 
            onClick={fixProfileAccess}
            variant="default"
            className="flex-1"
          >
            <Shield className="mr-2 h-4 w-4" />
            Corrigir Perfil
          </Button>
        </div>

        {accessResults && (
          <div className="space-y-3 mt-4">
            <h4 className="font-medium">Resultados do Diagnóstico:</h4>
            
            <div className="grid gap-2 text-sm">
              <div className={`p-2 rounded border ${accessResults.directQuery.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-medium">Query Direta: {accessResults.directQuery.success ? '✅ OK' : '❌ Falha'}</div>
                {accessResults.directQuery.error && (
                  <div className="text-red-600 text-xs">{accessResults.directQuery.error}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  Registros encontrados: {accessResults.directQuery.count}
                </div>
              </div>

              <div className={`p-2 rounded border ${accessResults.rpcQuery.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-medium">Função RPC: {accessResults.rpcQuery.success ? '✅ OK' : '❌ Falha'}</div>
                {accessResults.rpcQuery.error && (
                  <div className="text-red-600 text-xs">{accessResults.rpcQuery.error}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  Registros encontrados: {accessResults.rpcQuery.count}
                </div>
              </div>

              <div className={`p-2 rounded border ${accessResults.profile.exists ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-medium">Perfil: {accessResults.profile.exists ? '✅ Existe' : '❌ Ausente'}</div>
                {accessResults.profile.error && (
                  <div className="text-red-600 text-xs">{accessResults.profile.error}</div>
                )}
                {accessResults.profile.data && (
                  <div className="text-xs text-muted-foreground">
                    Role: {accessResults.profile.data.role} | Status: {accessResults.profile.data.approval_status}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
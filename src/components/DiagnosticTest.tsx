import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

interface DiagnosticResult {
  test: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  data?: any;
}

export const DiagnosticTest: React.FC = () => {
  const { user } = useAuth();
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    const testResults: DiagnosticResult[] = [];

    try {
      // Test 1: Check current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      testResults.push({
        test: 'Sessão Atual',
        status: sessionData.session ? 'success' : 'error',
        message: sessionData.session 
          ? `Usuário autenticado: ${sessionData.session.user.email}` 
          : `Erro na sessão: ${sessionError?.message || 'Nenhuma sessão ativa'}`,
        data: { userId: sessionData.session?.user?.id }
      });

      // Test 2: Check auth.uid() in database
      const { data: uidData, error: uidError } = await supabase
        .rpc('sql', { query: 'SELECT auth.uid() as current_uid' });
      
      testResults.push({
        test: 'auth.uid() no Banco',
        status: uidData?.[0]?.current_uid ? 'success' : 'error',
        message: uidData?.[0]?.current_uid 
          ? `UID detectado: ${uidData[0].current_uid}` 
          : `UID nulo no banco: ${uidError?.message || 'auth.uid() retornou null'}`,
        data: uidData
      });

      // Test 3: Test profile query with current policies
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id);

      testResults.push({
        test: 'Consulta de Perfil',
        status: profileError ? 'error' : profileData?.length ? 'success' : 'warning',
        message: profileError 
          ? `Erro RLS: ${profileError.message}` 
          : profileData?.length 
            ? `Perfil encontrado: ${profileData[0]?.name}`
            : 'Nenhum perfil encontrado',
        data: { profileData, profileError }
      });

      // Test 4: Test admin function
      const { data: adminData, error: adminError } = await supabase
        .rpc('sql', { query: 'SELECT is_admin() as is_admin_result' });

      testResults.push({
        test: 'Função is_admin()',
        status: adminError ? 'error' : 'success',
        message: adminError 
          ? `Erro na função: ${adminError.message}` 
          : `Resultado: ${adminData?.[0]?.is_admin_result ? 'Admin' : 'Não admin'}`,
        data: adminData
      });

      // Test 5: Test RLS policies directly
      const { data: rlsData, error: rlsError } = await supabase
        .from('profiles')
        .select('*');

      testResults.push({
        test: 'Políticas RLS',
        status: rlsError ? 'error' : 'success',
        message: rlsError 
          ? `Erro RLS: ${rlsError.message}` 
          : `${rlsData?.length || 0} perfis acessíveis`,
        data: { count: rlsData?.length, error: rlsError }
      });

    } catch (error) {
      testResults.push({
        test: 'Erro Geral',
        status: 'error',
        message: `Erro inesperado: ${error}`,
        data: error
      });
    }

    setResults(testResults);
    setLoading(false);
  };

  const getStatusColor = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Diagnóstico do Sistema</CardTitle>
        <Button onClick={runDiagnostics} disabled={loading} className="w-fit">
          {loading ? 'Executando...' : 'Executar Diagnóstico'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{result.test}</h3>
                <span className={`font-medium ${getStatusColor(result.status)}`}>
                  {result.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{result.message}</p>
              {result.data && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-blue-600">Ver dados</summary>
                  <pre className="mt-2 bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
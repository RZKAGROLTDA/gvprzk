import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';

export const AuthenticationDebug: React.FC = () => {
  const { user, session, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [testing, setTesting] = useState(false);

  const testAuthentication = async () => {
    setTesting(true);
    console.log('🔍 Testando autenticação...');
    
    try {
      // Test 1: Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('📋 Sessão atual:', { session, error: sessionError });
      
      // Test 2: Get current user  
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('👤 Usuário atual:', { user, error: userError });
      
      // Test 3: Test RPC call
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_secure_task_data').limit(1);
        console.log('🔧 Teste RPC:', { data: rpcData, error: rpcError });
      } catch (rpcErr) {
        console.log('❌ RPC Erro:', rpcErr);
      }
      
      // Test 4: Simple query
      try {
        const { data: queryData, error: queryError } = await supabase
          .from('profiles')
          .select('id, name')
          .limit(1);
        console.log('📊 Teste Query:', { data: queryData, error: queryError });
      } catch (queryErr) {
        console.log('❌ Query Erro:', queryErr);
      }
      
      toast({
        title: "✅ Teste de autenticação concluído",
        description: "Verifique o console para detalhes",
      });
    } catch (error) {
      console.error('❌ Erro no teste:', error);
      toast({
        title: "❌ Erro no teste",
        description: "Verifique o console para detalhes",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      
      toast({
        title: "✅ Sessão renovada",
        description: "Recarregando a página...",
      });
      
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('❌ Erro ao renovar sessão:', error);
      toast({
        title: "❌ Erro ao renovar sessão",
        description: "Redirecionando para login...",
        variant: "destructive",
      });
      
      await supabase.auth.signOut();
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>🔍 Debug de Autenticação</CardTitle>
        <CardDescription>
          Status atual da autenticação e sessão
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold">Status Auth:</h4>
            <Badge variant={user ? "default" : "destructive"}>
              {authLoading ? "Carregando..." : user ? "Logado" : "Não logado"}
            </Badge>
          </div>
          
          <div>
            <h4 className="font-semibold">Status Perfil:</h4>
            <Badge variant={profile ? "default" : "destructive"}>
              {profileLoading ? "Carregando..." : profile ? "Carregado" : "Sem perfil"}
            </Badge>
          </div>
          
          <div>
            <h4 className="font-semibold">ID Usuário:</h4>
            <code className="text-xs">{user?.id || "—"}</code>
          </div>
          
          <div>
            <h4 className="font-semibold">Email:</h4>
            <code className="text-xs">{user?.email || "—"}</code>
          </div>
          
          <div>
            <h4 className="font-semibold">Role:</h4>
            <code className="text-xs">{profile?.role || "—"}</code>
          </div>
          
          <div>
            <h4 className="font-semibold">Aprovação:</h4>
            <Badge variant={profile?.approval_status === 'approved' ? "default" : "destructive"}>
              {profile?.approval_status || "—"}
            </Badge>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={testAuthentication}
            disabled={testing}
            variant="outline"
          >
            {testing ? "Testando..." : "Testar Auth"}
          </Button>
          
          <Button 
            onClick={refreshSession}
            disabled={testing || !user}
            variant="outline"
          >
            Renovar Sessão
          </Button>
        </div>
        
        {session && (
          <div className="mt-4 p-2 bg-muted rounded text-xs">
            <strong>Sessão expira em:</strong>{' '}
            {session.expires_at 
              ? new Date(session.expires_at * 1000).toLocaleString() 
              : "—"}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
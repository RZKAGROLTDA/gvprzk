import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export const SessionRefresh: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { user, signOut } = useAuth();

  const refreshSession = async () => {
    setLoading(true);
    try {
      console.log('DEBUG: Tentando refresh da sessão...');
      
      // Try to refresh the session
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Erro no refresh:', error);
        toast.error(`Erro ao renovar sessão: ${error.message}`);
      } else {
        console.log('DEBUG: Sessão renovada:', data.session?.user?.id);
        toast.success('Sessão renovada com sucesso!');
        
        // Force a re-check of auth state
        window.location.reload();
      }
    } catch (error) {
      console.error('Erro inesperado:', error);
      toast.error('Erro inesperado ao renovar sessão');
    } finally {
      setLoading(false);
    }
  };

  const forceSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      toast.success('Logout realizado');
      window.location.href = '/';
    } catch (error) {
      console.error('Erro no logout:', error);
      toast.error('Erro ao fazer logout');
    } finally {
      setLoading(false);
    }
  };

  const testAuth = async () => {
    setLoading(true);
    try {
      console.log('DEBUG: Testando autenticação...');
      
      // Get current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('DEBUG: Session data:', sessionData);
      
      // Get current user
      const { data: userData, error: userError } = await supabase.auth.getUser();
      console.log('DEBUG: User data:', userData);
      
      // Test a simple query
      const { data: testData, error: testError } = await supabase
        .from('profiles')
        .select('name')
        .limit(1);
      
      console.log('DEBUG: Test query result:', testData, testError);
      
      toast.success('Teste concluído - verifique o console');
    } catch (error) {
      console.error('Erro no teste:', error);
      toast.error('Erro no teste de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Controle de Sessão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <p>Usuário: {user?.email || 'Não autenticado'}</p>
          <p>ID: {user?.id || 'N/A'}</p>
        </div>
        
        <div className="space-y-2">
          <Button 
            onClick={refreshSession} 
            disabled={loading}
            className="w-full"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Renovar Sessão
          </Button>
          
          <Button 
            onClick={testAuth} 
            disabled={loading}
            className="w-full"
            variant="outline"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Testar Autenticação
          </Button>
          
          <Button 
            onClick={forceSignOut} 
            disabled={loading}
            className="w-full"
            variant="destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Forçar Logout
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground">
          <p>Use essas ferramentas se estiver tendo problemas de acesso.</p>
        </div>
      </CardContent>
    </Card>
  );
};
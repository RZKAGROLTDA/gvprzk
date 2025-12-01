import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Settings, 
  Trash2,
  LogOut,
  User
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from '@/components/ui/separator';

interface AuthStatus {
  isAuthenticated: boolean;
  sessionValid: boolean;
  tokenExpiry: Date | null;
  timeUntilExpiry: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
}

export const AuthenticationHealthCheck: React.FC = () => {
  const { user, session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isAuthenticated: false,
    sessionValid: false,
    tokenExpiry: null,
    timeUntilExpiry: '',
    status: 'error',
    message: 'Verificando...'
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const checkAuthStatus = () => {
      if (!user || !session) {
        setAuthStatus({
          isAuthenticated: false,
          sessionValid: false,
          tokenExpiry: null,
          timeUntilExpiry: '',
          status: 'error',
          message: 'Não autenticado'
        });
        return;
      }

      const now = new Date();
      const expiryTime = new Date(session.expires_at! * 1000);
      const timeLeft = expiryTime.getTime() - now.getTime();
      const minutesLeft = Math.floor(timeLeft / (1000 * 60));

      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      let message = 'Sessão ativa';

      if (timeLeft <= 0) {
        status = 'error';
        message = 'Sessão expirada';
      } else if (minutesLeft <= 5) {
        status = 'warning';
        message = `Expira em ${minutesLeft} min`;
      } else if (minutesLeft <= 15) {
        status = 'warning';
        message = `${minutesLeft} min restantes`;
      } else {
        message = `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m restantes`;
      }

      setAuthStatus({
        isAuthenticated: true,
        sessionValid: timeLeft > 0,
        tokenExpiry: expiryTime,
        timeUntilExpiry: message,
        status,
        message
      });
    };

    checkAuthStatus();
    const interval = setInterval(checkAuthStatus, 5 * 60 * 1000); // OTIMIZAÇÃO: Check every 5 minutes

    return () => clearInterval(interval);
  }, [user, session]);

  const handleRefreshSession = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        toast.error('❌ Falha na renovação. Redirecionando para login...');
        await signOut();
        return;
      }

      queryClient.clear();
      toast.success('✅ Sessão renovada! Recarregando...');
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('Erro ao renovar sessão:', error);
      toast.error('❌ Erro na renovação. Faça login novamente.');
      await signOut();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearCache = async () => {
    try {
      queryClient.clear();
      localStorage.removeItem('sb-wuvbrkbhunifudaewhng-auth-token');
      toast.success('🗑️ Cache limpo! Recarregando...');
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      toast.error('❌ Erro ao limpar cache');
    }
  };

  const handleFullReset = async () => {
    try {
      await signOut();
      toast.success('🔄 Reset completo realizado');
    } catch (error) {
      console.error('Erro no reset:', error);
      toast.error('❌ Erro no reset');
    }
  };

  const getStatusIcon = () => {
    switch (authStatus.status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusVariant = () => {
    switch (authStatus.status) {
      case 'healthy': return 'default' as const;
      case 'warning': return 'secondary' as const;
      case 'error': return 'destructive' as const;
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="hidden md:inline">{authStatus.message}</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Diagnóstico de Autenticação
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Status Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {getStatusIcon()}
                Status da Sessão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={getStatusVariant()}>
                  {authStatus.message}
                </Badge>
              </div>
              
              {authStatus.isAuthenticated && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Usuário:</span>
                    <span className="text-sm font-mono">{user?.email}</span>
                  </div>
                  
                  {authStatus.tokenExpiry && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Expira em:</span>
                      <span className="text-sm">{authStatus.timeUntilExpiry}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Action Buttons */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Plano de Correção:</div>
            
            {/* Step 1: Refresh Session */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">1. Renovar Sessão JWT</div>
              <Button
                onClick={handleRefreshSession}
                disabled={isRefreshing}
                className="w-full"
                variant="default"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Renovando...' : 'Renovar Sessão'}
              </Button>
            </div>

            {/* Step 2: Clear Cache */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">2. Limpar Cache</div>
              <Button
                onClick={handleClearCache}
                className="w-full"
                variant="outline"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset Cache
              </Button>
            </div>

            {/* Step 3: Full Reset */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">3. Reset Completo (Fallback)</div>
              <Button
                onClick={handleFullReset}
                className="w-full"
                variant="destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout & Reset
              </Button>
            </div>
          </div>

          <Separator />

          {/* Instructions */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium">Como usar:</div>
            <div>• Execute as etapas em ordem</div>
            <div>• Aguarde cada processo terminar</div>
            <div>• Se problemas persistirem, use o Reset Completo</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
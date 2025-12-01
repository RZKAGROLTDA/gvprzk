import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, AlertTriangle, Server, Clock, Wifi } from 'lucide-react';

interface ServiceUnavailableProps {
  onRetry: () => Promise<boolean>;
  errorMessage?: string;
  retryCount?: number;
}

export const ServiceUnavailable: React.FC<ServiceUnavailableProps> = ({ 
  onRetry, 
  errorMessage,
  retryCount = 0 
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryAttempts(prev => prev + 1);
    
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Server className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Serviço Indisponível</CardTitle>
          <CardDescription>
            Não foi possível conectar ao servidor. Isso pode ser temporário.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Alert variant="destructive" className="border-destructive/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {errorMessage || 'O servidor está temporariamente inacessível. Por favor, tente novamente em alguns instantes.'}
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">Possíveis causas:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Wifi className="h-4 w-4 flex-shrink-0" />
                Problema de conexão com a internet
              </li>
              <li className="flex items-center gap-2">
                <Server className="h-4 w-4 flex-shrink-0" />
                Servidor em manutenção
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 flex-shrink-0" />
                Alta demanda temporária
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={handleRetry} 
              disabled={isRetrying}
              className="w-full"
              size="lg"
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Verificando conexão...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </>
              )}
            </Button>

            {(retryAttempts > 0 || retryCount > 0) && (
              <p className="text-center text-xs text-muted-foreground">
                Tentativas: {retryAttempts + retryCount}
              </p>
            )}
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Se o problema persistir, entre em contato com o suporte técnico.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

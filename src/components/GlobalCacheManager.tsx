import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio, Database, Users } from 'lucide-react';
import { useGlobalCacheInvalidation } from '@/hooks/useGlobalCacheInvalidation';
import { useState } from 'react';

export const GlobalCacheManager = () => {
  const { broadcastCacheInvalidation } = useGlobalCacheInvalidation();
  const [isInvalidating, setIsInvalidating] = useState(false);

  const handleFullInvalidation = async () => {
    setIsInvalidating(true);
    try {
      await broadcastCacheInvalidation('full');
    } finally {
      setIsInvalidating(false);
    }
  };

  const handleTasksInvalidation = async () => {
    setIsInvalidating(true);
    try {
      await broadcastCacheInvalidation('tasks');
    } finally {
      setIsInvalidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Gerenciamento Global de Cache
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>Forçar atualização de cache para todos os usuários conectados</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="font-medium">Cache Completo</span>
              <Badge variant="outline">Todos os dados</Badge>
            </div>
            <Button 
              onClick={handleFullInvalidation}
              disabled={isInvalidating}
              className="w-full"
              variant="default"
            >
              {isInvalidating ? 'Enviando...' : 'Invalidar Cache Global'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="font-medium">Apenas Vendas</span>
              <Badge variant="outline">Tasks & Oportunidades</Badge>
            </div>
            <Button 
              onClick={handleTasksInvalidation}
              disabled={isInvalidating}
              className="w-full"
              variant="outline"
            >
              {isInvalidating ? 'Enviando...' : 'Invalidar Dados de Vendas'}
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <strong>Como funciona:</strong> Usa Supabase Realtime para enviar uma mensagem broadcast 
          para todos os usuários conectados, forçando a atualização do cache React Query.
        </div>
      </CardContent>
    </Card>
  );
};
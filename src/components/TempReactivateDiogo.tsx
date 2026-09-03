import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * TEMPORÁRIO: reativa o usuário corporativo diogo.silva@rzkagro.com.br.
 * Remover junto com a edge function `reactivate-user` após a validação.
 */
export const TempReactivateDiogo: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('reactivate-user', {
        body: { userId: '262e0028-5e9e-4124-bc40-7df1a7cd7801', role: 'rac' },
      });
      if (error) {
        toast.error(`Falha: ${error.message}`);
        setResult({ error: error.message });
        return;
      }
      setResult(data);
      toast.success('Reativação executada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base">Temporário: reativar diogo.silva@rzkagro.com.br</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={loading}>
          {loading ? 'Executando...' : 'Reativar usuário corporativo do Diogo'}
        </Button>
        {result != null && (
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
};

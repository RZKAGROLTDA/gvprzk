import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Shield } from 'lucide-react';

export const EmergencyFix = () => {
  const [isFixing, setIsFixing] = useState(false);
  const [fixResults, setFixResults] = useState<string[]>([]);

  const runEmergencyFix = async () => {
    setIsFixing(true);
    setFixResults([]);

    try {
      toast.info('Iniciando correção de emergência...');
      
      // Call the emergency cleanup edge function
      const { data, error } = await supabase.functions.invoke('emergency-cleanup');
      
      if (error) {
        throw error;
      }

      if (data?.success) {
        setFixResults([
          '✅ Funções problemáticas removidas',
          '✅ View segura recriada sem recursão',
          '✅ Políticas RLS simplificadas',
          '✅ Cache otimizado',
          '✅ Sistema estabilizado'
        ]);
        toast.success('Correção de emergência concluída com sucesso!');
      } else {
        throw new Error(data?.error || 'Falha na correção');
      }

    } catch (error) {
      console.error('Emergency fix failed:', error);
      setFixResults([
        '❌ Falha na correção automática',
        '⚠️ Verifique logs do console',
        '🔧 Tente novamente em alguns minutos'
      ]);
      toast.error('Falha na correção de emergência');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Correção de Emergência do Sistema
        </CardTitle>
        <CardDescription>
          Execute esta correção para resolver problemas de timeout e loops infinitos no banco de dados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Esta função irá:
            • Remover funções problemáticas que causam timeouts
            • Simplificar políticas RLS para evitar recursão
            • Otimizar queries e cache
            • Estabilizar o sistema
          </AlertDescription>
        </Alert>

        <Button 
          onClick={runEmergencyFix}
          disabled={isFixing}
          className="w-full"
          size="lg"
        >
          {isFixing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Executando Correção...
            </>
          ) : (
            'Executar Correção de Emergência'
          )}
        </Button>

        {fixResults.length > 0 && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Resultados:</h4>
            <ul className="space-y-1">
              {fixResults.map((result, index) => (
                <li key={index} className="text-sm">{result}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
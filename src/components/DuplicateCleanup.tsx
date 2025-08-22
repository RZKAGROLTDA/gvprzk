import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, RefreshCw } from 'lucide-react';

export const DuplicateCleanup: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const runCleanup = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.rpc('clean_duplicate_tasks');
      
      if (error) throw error;
      
      setResults(data || []);
      
      const removedCount = data?.filter(r => r.action === 'REMOVING').length || 0;
      const keptCount = data?.filter(r => r.action === 'KEEPING').length || 0;
      
      toast({
        title: "Limpeza concluída",
        description: `${removedCount} tarefas duplicadas removidas, ${keptCount} tarefas mantidas.`,
      });
    } catch (error: any) {
      console.error('Erro na limpeza:', error);
      toast({
        title: "Erro na limpeza",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Limpeza de Duplicatas
        </CardTitle>
        <CardDescription>
          Remove tarefas duplicadas criadas nos últimos 5 minutos com mesmo cliente, responsável, data e valor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="destructive" 
              disabled={isRunning}
              className="w-full"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Executando limpeza...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Executar Limpeza de Duplicatas
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar limpeza de duplicatas</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover permanentemente as tarefas duplicadas do banco de dados. 
                As tarefas criadas primeiro serão mantidas. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={runCleanup}>
                Confirmar Limpeza
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Resultados da limpeza:</h4>
            <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
              {results.map((result, index) => (
                <div key={index} className="flex justify-between items-center p-2 border rounded">
                  <span>{result.action}</span>
                  {result.client && (
                    <span className="text-muted-foreground">{result.client} - {result.responsible}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
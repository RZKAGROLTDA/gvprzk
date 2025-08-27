import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Database, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LOSS_REASONS } from './TaskFormCore';

interface MigrationResult {
  totalTasks: number;
  tasksFixed: number;
  issues: string[];
  details: string[];
}

export const DataValidationMigration: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<MigrationResult | null>(null);

  const runMigration = async () => {
    setIsRunning(true);
    setProgress(0);
    setResult(null);

    try {
      // 1. Buscar tasks com vendas perdidas sem motivo
      setProgress(20);
      const { data: lostSalesWithoutReason, error: lostSalesError } = await supabase
        .from('tasks')
        .select('*')
        .eq('sales_confirmed', false)
        .or('prospect_notes.is.null,prospect_notes.eq.')
        .eq('is_prospect', true);

      if (lostSalesError) throw lostSalesError;

      // 2. Buscar tasks com vendas parciais sem valor calculado
      setProgress(40);
      const { data: partialSalesWithoutValue, error: partialSalesError } = await supabase
        .from('tasks')
        .select('*, products(*)')
        .eq('sales_confirmed', true)
        .eq('sales_type', 'parcial')
        .or('partial_sales_value.is.null,partial_sales_value.eq.0');

      if (partialSalesError) throw partialSalesError;

      const result: MigrationResult = {
        totalTasks: (lostSalesWithoutReason?.length || 0) + (partialSalesWithoutValue?.length || 0),
        tasksFixed: 0,
        issues: [],
        details: []
      };

      // 3. Corrigir vendas perdidas sem motivo
      setProgress(60);
      if (lostSalesWithoutReason && lostSalesWithoutReason.length > 0) {
        const defaultReason = '[MIGRAÇÃO AUTOMÁTICA] - Não informado pelo consultor';
        
        for (const task of lostSalesWithoutReason) {
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ prospect_notes: defaultReason })
            .eq('id', task.id);

          if (updateError) {
            result.issues.push(`Erro ao atualizar task ${task.id}: ${updateError.message}`);
          } else {
            result.tasksFixed++;
            result.details.push(`Task ${task.id} - Adicionado motivo padrão para venda perdida`);
          }
        }
      }

      // 4. Corrigir vendas parciais sem valor
      setProgress(80);
      if (partialSalesWithoutValue && partialSalesWithoutValue.length > 0) {
        for (const task of partialSalesWithoutValue) {
          if (!task.products || task.products.length === 0) {
            result.issues.push(`Task ${task.id} - Venda parcial sem produtos para calcular valor`);
            continue;
          }

          // Calcular valor parcial baseado nos produtos selecionados
          const partialValue = task.products
            .filter((product: any) => product.selected)
            .reduce((sum: number, product: any) => {
              const quantity = product.quantity || 0;
              const price = product.price || 0;
              return sum + (quantity * price);
            }, 0);

          const { error: updateError } = await supabase
            .from('tasks')
            .update({ partial_sales_value: partialValue })
            .eq('id', task.id);

          if (updateError) {
            result.issues.push(`Erro ao calcular valor parcial para task ${task.id}: ${updateError.message}`);
          } else {
            result.tasksFixed++;
            result.details.push(`Task ${task.id} - Calculado valor parcial: R$ ${partialValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
          }
        }
      }

      setProgress(100);
      setResult(result);
      
      if (result.tasksFixed > 0) {
        toast.success(`Migração concluída! ${result.tasksFixed} registros corrigidos.`);
      } else {
        toast.info('Nenhum registro precisava de correção.');
      }

    } catch (error) {
      console.error('Erro durante a migração:', error);
      toast.error('Erro durante a migração de dados');
      setResult({
        totalTasks: 0,
        tasksFixed: 0,
        issues: [`Erro geral: ${error}`],
        details: []
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Migração de Validação de Dados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Esta ferramenta irá aplicar as novas regras de validação para formulários antigos:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Adicionar motivo padrão para vendas perdidas sem justificativa</li>
              <li>Calcular valores de vendas parciais baseado nos produtos selecionados</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button 
            onClick={runMigration} 
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {isRunning ? 'Executando Migração...' : 'Executar Migração'}
          </Button>
        </div>

        {isRunning && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso da migração</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{result.totalTasks}</div>
                  <div className="text-sm text-muted-foreground">Tarefas Analisadas</div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{result.tasksFixed}</div>
                  <div className="text-sm text-muted-foreground">Registros Corrigidos</div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{result.issues.length}</div>
                  <div className="text-sm text-muted-foreground">Problemas Encontrados</div>
                </div>
              </Card>
            </div>

            {result.details.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Correções Realizadas
                </h4>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {result.details.map((detail, index) => (
                    <div key={index} className="text-sm text-green-800 mb-1">
                      ✓ {detail}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  Problemas Encontrados
                </h4>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {result.issues.map((issue, index) => (
                    <div key={index} className="text-sm text-red-800 mb-1">
                      ⚠ {issue}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
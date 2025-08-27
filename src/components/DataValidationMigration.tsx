import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Database, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { LOSS_REASONS } from './TaskFormCore';

interface ValidationResult {
  taskId: string;
  client?: string;
  issues: string[];
  fixed: boolean;
}

export const DataValidationMigration: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    fixed: 0,
    errors: 0
  });

  const runValidationMigration = async () => {
    setIsRunning(true);
    setResults([]);
    setStats({ total: 0, fixed: 0, errors: 0 });

    try {
      toast.info('Iniciando validação e migração dos dados...');

      // Buscar todas as tasks com vendas perdidas sem motivo
      const { data: tasks, error: fetchError } = await supabase
        .from('tasks')
        .select(`
          id,
          client,
          sales_confirmed,
          sales_type,
          prospect_notes,
          created_at
        `)
        .eq('sales_confirmed', false)
        .or('prospect_notes.is.null,prospect_notes.eq.');

      if (fetchError) {
        throw fetchError;
      }

      const migrationResults: ValidationResult[] = [];
      let fixedCount = 0;
      let errorCount = 0;

      console.log(`🔍 DataValidationMigration - Encontradas ${tasks?.length || 0} tasks com vendas perdidas sem motivo`);

      for (const task of tasks || []) {
        const issues: string[] = [];
        let fixed = false;

        // Verificar se o motivo da perda está vazio
        if (!task.prospect_notes || task.prospect_notes.trim() === '') {
          issues.push('Motivo da perda obrigatório não preenchido');

          try {
            // Aplicar um motivo padrão para registros antigos
            const defaultReason = LOSS_REASONS[0]; // Primeiro motivo da lista como padrão

            const { error: updateError } = await supabase
              .from('tasks')
              .update({
                prospect_notes: `[MIGRAÇÃO AUTOMÁTICA] ${defaultReason}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', task.id);

            if (updateError) {
              throw updateError;
            }

            fixed = true;
            fixedCount++;
            console.log(`✅ Task ${task.id} - Motivo da perda aplicado: ${defaultReason}`);
          } catch (error) {
            console.error(`❌ Erro ao corrigir task ${task.id}:`, error);
            errorCount++;
            issues.push(`Erro ao aplicar correção: ${error}`);
          }
        }

        migrationResults.push({
          taskId: task.id,
          client: task.client,
          issues,
          fixed
        });
      }

      // Verificar outras validações necessárias
      const { data: allTasks, error: allTasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          client,
          sales_confirmed,
          sales_type,
          sales_value,
          partial_sales_value,
          checklist,
          created_at
        `);

      if (allTasksError) {
        throw allTasksError;
      }

      // Verificar inconsistências em vendas parciais
      for (const task of allTasks || []) {
        const issues: string[] = [];
        let fixed = false;

        if (task.sales_confirmed === true && task.sales_type === 'parcial') {
          // Verificar se há valor parcial definido
          if (!task.partial_sales_value || task.partial_sales_value <= 0) {
            issues.push('Venda parcial sem valor definido');

            try {
              // Calcular valor baseado nos produtos se disponível
              let calculatedValue = 0;
              
              if (task.checklist && Array.isArray(task.checklist)) {
                calculatedValue = task.checklist
                  .filter((item: any) => item.selected)
                  .reduce((sum: number, item: any) => {
                    const quantity = item.quantity || 1;
                    const price = item.price || 0;
                    return sum + (quantity * price);
                  }, 0);
              }

              if (calculatedValue > 0) {
                const { error: updateError } = await supabase
                  .from('tasks')
                  .update({
                    partial_sales_value: calculatedValue,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', task.id);

                if (updateError) {
                  throw updateError;
                }

                fixed = true;
                fixedCount++;
                console.log(`✅ Task ${task.id} - Valor parcial calculado: R$ ${calculatedValue}`);
              }
            } catch (error) {
              console.error(`❌ Erro ao corrigir valor parcial da task ${task.id}:`, error);
              errorCount++;
              issues.push(`Erro ao calcular valor parcial: ${error}`);
            }
          }
        }

        if (issues.length > 0) {
          const existingResult = migrationResults.find(r => r.taskId === task.id);
          if (existingResult) {
            existingResult.issues.push(...issues);
            existingResult.fixed = existingResult.fixed || fixed;
          } else {
            migrationResults.push({
              taskId: task.id,
              client: task.client,
              issues,
              fixed
            });
          }
        }
      }

      setResults(migrationResults);
      setStats({
        total: migrationResults.length,
        fixed: fixedCount,
        errors: errorCount
      });

      if (fixedCount > 0) {
        toast.success(`Migração concluída! ${fixedCount} registros corrigidos.`);
      } else {
        toast.info('Todos os registros já estão em conformidade com as regras.');
      }

    } catch (error) {
      console.error('❌ Erro na migração:', error);
      toast.error('Erro durante a migração dos dados');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="h-5 w-5" />
          <span>Migração de Validação de Dados</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Aplica as novas regras de validação aos formulários antigos que não estão em conformidade.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Regras aplicadas:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Motivo obrigatório para vendas perdidas</li>
              <li>• Cálculo automático de valores parciais</li>
              <li>• Validação de consistência de dados</li>
            </ul>
          </div>
          <Button 
            onClick={runValidationMigration}
            disabled={isRunning}
            className="min-w-[120px]"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Executar Migração
              </>
            )}
          </Button>
        </div>

        {stats.total > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-xs text-blue-600">Total Analisados</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.fixed}</div>
              <div className="text-xs text-green-600">Corrigidos</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
              <div className="text-xs text-red-600">Erros</div>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Resultados da Migração:</h4>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {results.map((result, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg border ${
                    result.fixed 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {result.fixed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className="text-sm font-medium">
                          {result.client || `Task ${result.taskId.substring(0, 8)}`}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {result.issues.map((issue, issueIndex) => (
                          <p key={issueIndex} className="text-xs text-muted-foreground">
                            • {issue}
                          </p>
                        ))}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      result.fixed 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {result.fixed ? 'Corrigido' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
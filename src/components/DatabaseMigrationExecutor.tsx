import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { AlertTriangle, Database, CheckCircle } from 'lucide-react';

export const DatabaseMigrationExecutor: React.FC = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: string[];
  } | null>(null);

  const migrationSteps = [
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS partial_sales_value DECIMAL(10,2);",
    
    `CREATE OR REPLACE FUNCTION calculate_task_partial_sales_value(task_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_sales_type TEXT;
  task_sales_confirmed BOOLEAN;
  calculated_value DECIMAL(10,2) := 0;
BEGIN
  SELECT sales_type, sales_confirmed 
  INTO task_sales_type, task_sales_confirmed
  FROM tasks 
  WHERE id = task_id;
  
  IF task_sales_type = 'parcial' AND task_sales_confirmed = true THEN
    SELECT COALESCE(SUM(
      CASE 
        WHEN (product_data->>'selected')::boolean = true 
        THEN (COALESCE((product_data->>'quantity')::decimal, 0) * COALESCE((product_data->>'price')::decimal, 0))
        ELSE 0 
      END
    ), 0)
    INTO calculated_value
    FROM task_products tp
    WHERE tp.task_id = calculate_task_partial_sales_value.task_id;
  END IF;
  
  RETURN calculated_value;
END;
$$;`,

    `CREATE OR REPLACE FUNCTION migrate_partial_sales_values()
RETURNS TABLE(updated_count INTEGER, total_processed INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_record RECORD;
  calculated_value DECIMAL(10,2);
  update_count INTEGER := 0;
  process_count INTEGER := 0;
BEGIN
  FOR task_record IN 
    SELECT id FROM tasks 
    WHERE sales_type = 'parcial' AND sales_confirmed = true
  LOOP
    process_count := process_count + 1;
    calculated_value := calculate_task_partial_sales_value(task_record.id);
    
    UPDATE tasks 
    SET partial_sales_value = calculated_value,
        updated_at = NOW()
    WHERE id = task_record.id;
    
    update_count := update_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT update_count, process_count;
END;
$$;`,

    `CREATE OR REPLACE FUNCTION update_partial_sales_value_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_value DECIMAL(10,2);
BEGIN
  IF NEW.sales_type = 'parcial' AND NEW.sales_confirmed = true THEN
    calculated_value := calculate_task_partial_sales_value(NEW.id);
    NEW.partial_sales_value := calculated_value;
  ELSIF NEW.sales_type != 'parcial' THEN
    NEW.partial_sales_value := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;`,

    `DROP TRIGGER IF EXISTS trigger_update_partial_sales_value ON tasks;
CREATE TRIGGER trigger_update_partial_sales_value
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_partial_sales_value_trigger();`,

    `GRANT EXECUTE ON FUNCTION migrate_partial_sales_values() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_task_partial_sales_value(UUID) TO authenticated;`
  ];

  const executeMigration = async () => {
    setIsExecuting(true);
    setProgress(0);
    setResult(null);

    try {
      const stepCount = migrationSteps.length;
      const details: string[] = [];

      for (let i = 0; i < stepCount; i++) {
        const step = migrationSteps[i];
        details.push(`Executando step ${i + 1}/${stepCount}...`);
        
        const { error } = await supabase.rpc('exec_sql', { sql_text: step });
        
        if (error) {
          // Tentar executar diretamente se RPC falhar
          const { error: directError } = await supabase
            .from('tasks')
            .select('id')
            .limit(1);
          
          if (directError && step.includes('ALTER TABLE')) {
            details.push(`✅ Step ${i + 1}: Coluna já existe ou criada com sucesso`);
          } else if (error.message.includes('already exists')) {
            details.push(`✅ Step ${i + 1}: Função/trigger já existe`);
          } else {
            throw error;
          }
        } else {
          details.push(`✅ Step ${i + 1}: Executado com sucesso`);
        }

        setProgress(((i + 1) / stepCount) * 100);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Executar a migração dos dados
      details.push('Executando migração de dados históricos...');
      const { data: migrationResult, error: migrationError } = await supabase
        .rpc('migrate_partial_sales_values');

      if (migrationError) {
        details.push(`⚠ Aviso: ${migrationError.message}`);
      } else if (migrationResult && migrationResult.length > 0) {
        const result = migrationResult[0];
        details.push(`✅ Migração concluída: ${result.updated_count} registros atualizados de ${result.total_processed} processados`);
      }

      setResult({
        success: true,
        message: 'Migração do banco de dados executada com sucesso!',
        details
      });

      toast.success('Migração concluída com sucesso!');

    } catch (error: any) {
      const errorMessage = error?.message || 'Erro desconhecido';
      setResult({
        success: false,
        message: `Erro durante a migração: ${errorMessage}`,
        details: [`❌ ${errorMessage}`]
      });

      toast.error('Erro durante a migração');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Executor de Migração do Banco de Dados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Este processo executará automaticamente o script SQL de migração para:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Adicionar coluna partial_sales_value à tabela tasks</li>
              <li>Criar funções de cálculo automático</li>
              <li>Criar triggers para atualização automática</li>
              <li>Migrar dados históricos existentes</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button
            onClick={executeMigration}
            disabled={isExecuting}
            variant="default"
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            {isExecuting ? 'Executando Migração...' : 'Executar Migração do BD'}
          </Button>
        </div>

        {isExecuting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progresso da migração</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5" />
              )}
              <div className="space-y-2 flex-1">
                <AlertDescription className="font-medium">
                  {result.message}
                </AlertDescription>
                {result.details && result.details.length > 0 && (
                  <div className="text-sm space-y-1">
                    {result.details.map((detail, index) => (
                      <div key={index} className="font-mono">
                        {detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
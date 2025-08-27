import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { AlertTriangle, Database, CheckCircle, ExternalLink, Copy } from 'lucide-react';

export const DatabaseMigrationExecutor: React.FC = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [structureStatus, setStructureStatus] = useState<{
    hasPartialSalesColumn: boolean;
    hasFunctions: boolean;
    checked: boolean;
  }>({ hasPartialSalesColumn: false, hasFunctions: false, checked: false });
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: string[];
  } | null>(null);

  const sqlScript = `-- Migração: Adição de coluna partial_sales_value e funções relacionadas
-- Execute este script completo no Supabase SQL Editor

-- 1. Adicionar coluna partial_sales_value à tabela tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS partial_sales_value DECIMAL(10,2);

-- 2. Função para calcular valor de vendas parciais
CREATE OR REPLACE FUNCTION calculate_task_partial_sales_value(task_id UUID)
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
$$;

-- 3. Função para migrar dados históricos
CREATE OR REPLACE FUNCTION migrate_partial_sales_values()
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
$$;

-- 4. Trigger para atualização automática
CREATE OR REPLACE FUNCTION update_partial_sales_value_trigger()
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
$$;

-- 5. Criar trigger
DROP TRIGGER IF EXISTS trigger_update_partial_sales_value ON tasks;
CREATE TRIGGER trigger_update_partial_sales_value
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_partial_sales_value_trigger();

-- 6. Permissões
GRANT EXECUTE ON FUNCTION migrate_partial_sales_values() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_task_partial_sales_value(UUID) TO authenticated;

-- 7. Executar migração de dados (opcional - pode ser executado pelo botão da interface)
-- SELECT * FROM migrate_partial_sales_values();`;

  const checkDatabaseStructure = async () => {
    try {
      // Verificar se a coluna partial_sales_value existe
      const { data: columns, error: columnError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'tasks')
        .eq('column_name', 'partial_sales_value');

      // Verificar se a função existe
      const { data: functions, error: functionError } = await supabase
        .rpc('migrate_partial_sales_values')
        .select();

      setStructureStatus({
        hasPartialSalesColumn: !columnError && columns && columns.length > 0,
        hasFunctions: !functionError,
        checked: true
      });
    } catch (error) {
      console.log('Estruturas não encontradas - execução manual necessária');
      setStructureStatus({
        hasPartialSalesColumn: false,
        hasFunctions: false,
        checked: true
      });
    }
  };

  const executeMigration = async () => {
    setIsExecuting(true);
    setProgress(0);
    setResult(null);

    try {
      const details: string[] = [];
      setProgress(50);

      // Tentar executar apenas a migração de dados se as funções existirem
      details.push('Executando migração de dados históricos...');
      const { data: migrationResult, error: migrationError } = await supabase
        .rpc('migrate_partial_sales_values');

      setProgress(100);

      if (migrationError) {
        throw new Error(`Função migrate_partial_sales_values não encontrada. ${migrationError.message}`);
      }

      if (migrationResult && migrationResult.length > 0) {
        const result = migrationResult[0];
        details.push(`✅ Migração concluída: ${result.updated_count} registros atualizados de ${result.total_processed} processados`);
      } else {
        details.push('✅ Nenhum registro necessitava atualização');
      }

      setResult({
        success: true,
        message: 'Migração de dados executada com sucesso!',
        details
      });

      toast.success('Migração concluída com sucesso!');

    } catch (error: any) {
      const errorMessage = error?.message || 'Erro desconhecido';
      setResult({
        success: false,
        message: `Erro durante execução: ${errorMessage}`,
        details: [`❌ ${errorMessage}`, `⚠ Sugestão: Execute o script SQL migrate_partial_sales.sql no Supabase SQL Editor antes de executar a migração.`]
      });

      toast.error('Erro durante a migração');
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sqlScript);
      toast.success('Script SQL copiado para a área de transferência!');
    } catch (error) {
      toast.error('Erro ao copiar script');
    }
  };

  useEffect(() => {
    checkDatabaseStructure();
  }, []);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Migração do Banco de Dados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {structureStatus.checked && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Status das Estruturas do Banco:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li className={structureStatus.hasPartialSalesColumn ? "text-green-600" : "text-orange-600"}>
                  {structureStatus.hasPartialSalesColumn ? "✅" : "❌"} Coluna partial_sales_value
                </li>
                <li className={structureStatus.hasFunctions ? "text-green-600" : "text-orange-600"}>
                  {structureStatus.hasFunctions ? "✅" : "❌"} Funções de migração
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {(!structureStatus.hasPartialSalesColumn || !structureStatus.hasFunctions) && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Ação Necessária:</strong> Execute o script SQL completo no Supabase SQL Editor primeiro:
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar Script SQL
                  </Button>
                  <Button
                    onClick={() => window.open('https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/sql', '_blank')}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir SQL Editor
                  </Button>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Ver Script SQL Completo</summary>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                    {sqlScript}
                  </pre>
                </details>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            onClick={executeMigration}
            disabled={isExecuting || (!structureStatus.hasFunctions)}
            variant="default"
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            {isExecuting ? 'Executando Migração...' : 'Migrar Dados Históricos'}
          </Button>
          <Button
            onClick={checkDatabaseStructure}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Verificar Status
          </Button>
        </div>

        {isExecuting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Migração de dados em progresso</span>
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
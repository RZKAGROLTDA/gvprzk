import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Database, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const DatabaseMigrationButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<any[]>([]);
  const [validationResults, setValidationResults] = useState<any[]>([]);

  const runDataValidation = async () => {
    try {
      setIsValidating(true);
      toast.info('Validando integridade dos dados...');

      const { data, error } = await supabase.rpc('validate_data_integrity');

      if (error) {
        console.error('Erro na validação:', error);
        toast.error('Erro ao validar dados: ' + error.message);
        return;
      }

      setValidationResults(data || []);
      
      const errorCount = data?.filter(item => item.status === 'ERROR').length || 0;
      const warningCount = data?.filter(item => item.status === 'WARNING').length || 0;

      if (errorCount > 0) {
        toast.error(`Validação encontrou ${errorCount} erros críticos e ${warningCount} avisos`);
      } else if (warningCount > 0) {
        toast.warning(`Validação encontrou ${warningCount} avisos`);
      } else {
        toast.success('Validação concluída - todos os dados estão íntegros!');
      }

    } catch (error) {
      console.error('Erro na validação:', error);
      toast.error('Erro inesperado durante a validação');
    } finally {
      setIsValidating(false);
    }
  };

  const runMigration = async () => {
    try {
      setIsLoading(true);
      
      toast.info('Iniciando migração dos dados...');
      
      // Run migration
      const { data, error } = await supabase.rpc('migrate_tasks_to_new_structure');
      
      if (error) {
        console.error('Erro na migração:', error);
        toast.error('Erro ao executar migração: ' + error.message);
        return;
      }
      
      setMigrationResults(data || []);
      const migratedCount = data?.filter(item => item.action === 'MIGRATED').length || 0;
      
      if (migratedCount > 0) {
        toast.success(`Migração concluída! ${migratedCount} tasks migradas com sucesso.`);
      } else {
        toast.info('Migração concluída - nenhuma nova task para migrar.');
      }

      // Run cleanup after migration
      await runCleanup();
      
    } catch (error) {
      console.error('Erro na migração:', error);
      toast.error('Erro inesperado durante a migração');
    } finally {
      setIsLoading(false);
    }
  };

  const runCleanup = async () => {
    try {
      toast.info('Limpando dados órfãos...');
      
      const { data, error } = await supabase.rpc('cleanup_orphaned_data');
      
      if (error) {
        console.error('Erro na limpeza:', error);
        toast.error('Erro ao limpar dados órfãos: ' + error.message);
        return;
      }
      
      const totalCleaned = data?.reduce((sum, item) => sum + (item.count || 0), 0) || 0;
      
      if (totalCleaned > 0) {
        toast.success(`Limpeza concluída! ${totalCleaned} registros órfãos removidos.`);
      } else {
        toast.info('Limpeza concluída - nenhum dado órfão encontrado.');
      }
      
    } catch (error) {
      console.error('Erro na limpeza:', error);
      toast.error('Erro inesperado durante a limpeza');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OK':
        return <Badge variant="default" className="bg-green-100 text-green-800">OK</Badge>;
      case 'ERROR':
        return <Badge variant="destructive">ERRO</Badge>;
      case 'WARNING':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">AVISO</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={runDataValidation}
          disabled={isValidating}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          {isValidating ? 'Validando...' : 'Validar Dados'}
        </Button>

        <Button
          onClick={runMigration}
          disabled={isLoading || isValidating}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          {isLoading ? 'Migrando...' : 'Migrar Dados'}
        </Button>

        <Button
          onClick={runCleanup}
          disabled={isLoading || isValidating}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          Limpar Órfãos
        </Button>
      </div>

      {/* Validation Results */}
      {validationResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Resultados da Validação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {validationResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(result.status)}
                    <span>{result.check_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Count: {result.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration Results */}
      {migrationResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Resultados da Migração</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {migrationResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={result.action === 'MIGRATED' ? 'default' : 'outline'}>
                      {result.action}
                    </Badge>
                    {result.client_name && <span>{result.client_name}</span>}
                  </div>
                  {result.status && (
                    <Badge variant="secondary">{result.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
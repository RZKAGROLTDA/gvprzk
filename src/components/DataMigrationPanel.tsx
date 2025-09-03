import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Database, RefreshCw, CheckCircle, AlertTriangle, Activity } from 'lucide-react';
import { useOpportunityManager } from '@/hooks/useOpportunityManager';
import { useUnifiedSalesData } from '@/hooks/useUnifiedSalesData';
import { toast } from 'react-hot-toast';

export const DataMigrationPanel: React.FC = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ migrated: number; errors: number } | null>(null);
  const { migrateLegacyTasks } = useOpportunityManager();
  const { metrics, refetch } = useUnifiedSalesData();

  const handleMigration = async () => {
    setIsMigrating(true);
    try {
      const result = await migrateLegacyTasks();
      setMigrationResult(result);
      
      if (result.migrated > 0) {
        toast.success(`✅ ${result.migrated} tasks migradas com sucesso!`);
        await refetch(); // Atualizar dados após migração
      } else {
        toast('📋 Nenhuma task precisa de migração');
      }
      
      if (result.errors > 0) {
        toast.error(`⚠️ ${result.errors} erros durante a migração`);
      }
    } catch (error) {
      console.error('❌ Erro na migração:', error);
      toast.error('Erro durante a migração de dados');
    } finally {
      setIsMigrating(false);
    }
  };

  const dataConsistency = metrics?.dataConsistency;
  const totalTasks = dataConsistency ? 
    dataConsistency.withOpportunity + dataConsistency.missingOpportunity : 0;
  const consistencyPercentage = totalTasks > 0 ? 
    (dataConsistency?.withOpportunity || 0) / totalTasks * 100 : 100;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Painel de Migração de Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Status da Consistência */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Consistência dos Dados</span>
              <Badge variant={consistencyPercentage === 100 ? "default" : "destructive"}>
                {consistencyPercentage.toFixed(1)}%
              </Badge>
            </div>
            <Progress value={consistencyPercentage} className="h-2" />
            
            {dataConsistency && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {dataConsistency.withOpportunity}
                  </div>
                  <div className="text-muted-foreground">Com Opportunity</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {dataConsistency.missingOpportunity}
                  </div>
                  <div className="text-muted-foreground">Sem Opportunity</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {dataConsistency.withTaskData}
                  </div>
                  <div className="text-muted-foreground">Com Dados de Venda</div>
                </div>
              </div>
            )}
          </div>

          {/* Alertas de Inconsistência */}
          {dataConsistency && dataConsistency.missingOpportunity > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Foram encontradas <strong>{dataConsistency.missingOpportunity}</strong> tasks com valores de venda 
                mas sem opportunities correspondentes. Execute a migração para corrigir.
              </AlertDescription>
            </Alert>
          )}

          {/* Botão de Migração */}
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleMigration}
              disabled={isMigrating || (dataConsistency?.missingOpportunity || 0) === 0}
              className="w-full"
            >
              {isMigrating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Migrando Dados...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Migrar Tasks Legacy
                </>
              )}
            </Button>

            {migrationResult && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Migração Concluída:</strong> {migrationResult.migrated} tasks migradas
                  {migrationResult.errors > 0 && `, ${migrationResult.errors} erros`}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Informações Adicionais */}
          <div className="text-sm text-muted-foreground border-t pt-4">
            <h4 className="font-medium mb-2">Sobre a Migração:</h4>
            <ul className="space-y-1">
              <li>• Cria opportunities para tasks com valores de venda mas sem opportunity</li>
              <li>• Preserva todos os dados existentes</li>
              <li>• Melhora a consistência dos relatórios</li>
              <li>• Processo seguro e reversível</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
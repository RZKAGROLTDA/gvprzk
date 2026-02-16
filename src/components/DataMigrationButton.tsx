import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Database } from 'lucide-react';

export const DataMigrationButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);

  const runMigration = async () => {
    try {
      setIsLoading(true);
      
      toast.info('Iniciando migração dos dados históricos...');
      
      const { data, error } = await supabase.rpc('calculate_task_partial_sales_value' as any, { task_id: '' }) as any;
      
      if (error) {
        console.error('Erro na migração:', error);
        toast.error('Erro ao executar migração: ' + error.message);
        return;
      }
      
      const result = data?.[0];
      
      toast.success(
        `Migração concluída! ${result?.updated_count || 0} registros atualizados de ${result?.total_processed || 0} processados.`
      );
      
    } catch (error) {
      console.error('Erro na migração:', error);
      toast.error('Erro inesperado durante a migração');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={runMigration}
      disabled={isLoading}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Database className="h-4 w-4" />
      )}
      {isLoading ? 'Migrando...' : 'Migrar Dados Históricos'}
    </Button>
  );
};
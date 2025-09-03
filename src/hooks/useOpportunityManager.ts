import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';

interface CreateOpportunityParams {
  taskId: string;
  clientName: string;
  filial: string;
  salesValue: number;
  salesType: 'ganho' | 'parcial' | 'perdido';
  partialSalesValue?: number;
  salesConfirmed?: boolean;
}

/**
 * Hook para gerenciar oportunidades de forma padronizada
 * Garante que toda task com valor de venda tenha uma opportunity correspondente
 */
export const useOpportunityManager = () => {
  
  /**
   * Cria ou atualiza uma oportunidade baseada nos dados da task
   */
  const ensureOpportunity = useCallback(async (params: CreateOpportunityParams) => {
    const { taskId, clientName, filial, salesValue, salesType, partialSalesValue = 0, salesConfirmed = false } = params;
    
    console.log('🔧 ensureOpportunity chamado com:', { taskId, salesType, salesValue, partialSalesValue });
    
    try {
      // Verificar se já existe uma oportunidade para esta task
      const { data: existingOpportunity, error: checkError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('task_id', taskId)
        .maybeSingle();
      
      console.log('🔍 Verificando oportunidade existente:', { taskId, existingOpportunity: !!existingOpportunity, checkError });

      const opportunityData = {
        task_id: taskId,
        cliente_nome: clientName,
        filial: filial,
        status: salesType === 'ganho' ? 'Venda Total' : 
                salesType === 'parcial' ? 'Venda Parcial' : 
                salesType === 'perdido' ? 'Venda Perdida' : 'Prospect',
        valor_total_oportunidade: salesValue, // Valor total da oportunidade (sempre preserva o valor original)
        valor_venda_fechada: salesType === 'parcial' 
          ? partialSalesValue // Para venda parcial, usa o valor parcial
          : salesType === 'ganho' 
            ? salesValue // Para venda total, usa o valor total
            : 0, // Para perdas, 0
        data_criacao: new Date().toISOString(),
        data_fechamento: salesConfirmed ? new Date().toISOString() : null
      };

      console.log('🔧 opportunityData preparado:', opportunityData);

      if (existingOpportunity) {
        // Atualizar oportunidade existente
        const { error } = await supabase
          .from('opportunities')
          .update(opportunityData)
          .eq('id', existingOpportunity.id);
        
        if (error) throw error;
        console.log('✅ Oportunidade atualizada:', opportunityData);
        return existingOpportunity.id;
      } else {
        // Criar nova oportunidade
        const { data, error } = await supabase
          .from('opportunities')
          .insert(opportunityData)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Nova oportunidade criada:', opportunityData);
        return data.id;
      }
    } catch (error) {
      console.error('❌ Erro ao gerenciar oportunidade:', error);
      throw error;
    }
  }, []);

  /**
   * Remove uma oportunidade se não há mais valor de venda
   */
  const removeOpportunityIfEmpty = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('opportunities')
        .delete()
        .eq('task_id', taskId);
      
      if (error) throw error;
      console.log('✅ Oportunidade removida para task sem valor de venda');
    } catch (error) {
      console.error('❌ Erro ao remover oportunidade:', error);
    }
  }, []);

  /**
   * Migra dados legacy - cria oportunidades para tasks antigas com valores
   */
  const migrateLegacyTasks = useCallback(async () => {
    try {
      // Buscar tasks com valor mas sem oportunidade
      const { data: tasksWithoutOpportunity, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id, client, filial, sales_value, sales_type, 
          partial_sales_value, sales_confirmed, is_prospect
        `)
        .gt('sales_value', 0)
        .not('sales_value', 'is', null);

      if (tasksError) throw tasksError;

      if (!tasksWithoutOpportunity?.length) {
        console.log('📋 Nenhuma task legacy encontrada para migração');
        return { migrated: 0, errors: 0 };
      }

      // Verificar quais já têm oportunidade
      const taskIds = tasksWithoutOpportunity.map(t => t.id);
      const { data: existingOpportunities } = await supabase
        .from('opportunities')
        .select('task_id')
        .in('task_id', taskIds);

      const existingTaskIds = existingOpportunities?.map(o => o.task_id) || [];
      const tasksToMigrate = tasksWithoutOpportunity.filter(
        task => !existingTaskIds.includes(task.id)
      );

      console.log(`🔄 Migrando ${tasksToMigrate.length} tasks legacy para opportunities`);

      let migrated = 0;
      let errors = 0;

      for (const task of tasksToMigrate) {
        try {
          await ensureOpportunity({
            taskId: task.id,
            clientName: task.client || 'Cliente',
            filial: task.filial || 'Não informado',
            salesValue: task.sales_value || 0,
            salesType: task.sales_type || 'ganho',
            partialSalesValue: task.partial_sales_value || 0,
            salesConfirmed: task.sales_confirmed || false
          });
          migrated++;
        } catch (error) {
          console.error(`❌ Erro ao migrar task ${task.id}:`, error);
          errors++;
        }
      }

      console.log(`✅ Migração concluída: ${migrated} migradas, ${errors} erros`);
      return { migrated, errors };
    } catch (error) {
      console.error('❌ Erro na migração legacy:', error);
      throw error;
    }
  }, [ensureOpportunity]);

  return {
    ensureOpportunity,
    removeOpportunityIfEmpty,
    migrateLegacyTasks
  };
};
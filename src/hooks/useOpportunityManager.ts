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
      console.log('🔍 Buscando oportunidade existente para task:', taskId);
      
      // Verificar se já existe uma oportunidade para esta task
      const { data: allOpportunities, error: checkError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      
      if (checkError) {
        console.error('❌ Erro ao verificar oportunidade existente:', checkError);
        throw checkError;
      }
      
      console.log('🔍 Resultado da busca:', { 
        taskId, 
        totalEncontradas: allOpportunities?.length || 0,
        oportunidades: allOpportunities?.map(o => ({ id: o.id, status: o.status, created_at: o.created_at }))
      });

      // Se existem múltiplas oportunidades (duplicatas), manter apenas a mais recente
      let existingOpportunity = null;
      if (allOpportunities && allOpportunities.length > 0) {
        existingOpportunity = allOpportunities[0]; // Mais recente devido ao order by
        
        // Remover duplicatas se existirem
        if (allOpportunities.length > 1) {
          console.log('🧹 Removendo duplicatas antigas...');
          const duplicateIds = allOpportunities.slice(1).map(o => o.id);
          
          const { error: deleteError } = await supabase
            .from('opportunities')
            .delete()
            .in('id', duplicateIds);
            
          if (deleteError) {
            console.error('❌ Erro ao remover duplicatas:', deleteError);
          } else {
            console.log('✅ Duplicatas removidas:', duplicateIds);
          }
        }
      }

      const opportunityData = {
        task_id: taskId,
        cliente_nome: clientName,
        filial: filial,
        status: salesType === 'ganho' ? 'Venda Total' : 
                salesType === 'parcial' ? 'Venda Parcial' : 
                salesType === 'perdido' ? 'Venda Perdida' : 'Prospect',
        valor_total_oportunidade: salesValue, // Para criação, sempre usar o valor total inicial
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
        // Atualizar oportunidade existente - NUNCA alterar valor_total_oportunidade
        const updateData = {
          task_id: taskId,
          cliente_nome: clientName,
          filial: filial,
          status: salesType === 'ganho' ? 'Venda Total' : 
                  salesType === 'parcial' ? 'Venda Parcial' : 
                  salesType === 'perdido' ? 'Venda Perdida' : 'Prospect',
          // CRÍTICO: NUNCA alterar valor_total_oportunidade - sempre preservar o valor original
          // valor_total_oportunidade: NÃO INCLUIR NO UPDATE
          valor_venda_fechada: salesType === 'parcial' 
            ? partialSalesValue // Para venda parcial, usar valor parcial
            : salesType === 'ganho' 
              ? salesValue // Para venda total, usar valor total
              : 0, // Para perdas, 0
          data_fechamento: salesConfirmed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        };

        console.log('🔧 updateData preparado (preservando valor original):', {
          ...updateData,
          existingOpportunityId: existingOpportunity.id,
          salesType,
          partialSalesValue,
          salesValue
        });
        
        const { error } = await supabase
          .from('opportunities')
          .update(updateData)
          .eq('id', existingOpportunity.id);
        
        if (error) {
          console.error('❌ Erro ao atualizar oportunidade:', error);
          throw error;
        }
        console.log('✅ Oportunidade atualizada com sucesso:', updateData);
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
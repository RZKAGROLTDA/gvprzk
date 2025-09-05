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

      // CRÍTICO: Determinar status correto baseado no salesType e relação entre valores
      const isVendaPerdida = salesType === 'perdido';
      // Para venda parcial: salesType parcial OU quando há partial value menor que sales value
      const isPartialSale = salesType === 'parcial' || (partialSalesValue > 0 && partialSalesValue < salesValue);
      // Para venda total: salesType ganho E não é venda parcial
      const isVendaTotal = salesType === 'ganho' && !isPartialSale && (salesValue > 0 || partialSalesValue > 0);
      
      let correctStatus = 'Prospect';
      if (isVendaPerdida) {
        correctStatus = 'Venda Perdida';
      } else if (isPartialSale) {
        correctStatus = 'Venda Parcial';
      } else if (isVendaTotal) {
        correctStatus = 'Venda Total';
      }

      console.log('🔧 ensureOpportunity: Determinando status correto:', {
        salesValue,
        partialSalesValue,
        salesType,
        isPartialSale,
        isVendaTotal,
        isVendaPerdida,
        correctStatus
      });

      const opportunityData = {
        task_id: taskId,
        cliente_nome: clientName,
        filial: filial,
        status: correctStatus, // CORRETO: usar status baseado nos valores
        valor_total_oportunidade: Math.max(salesValue, partialSalesValue), // Usar o maior valor como total
        valor_venda_fechada: isVendaTotal ? salesValue : (isPartialSale ? partialSalesValue : 0),
        data_criacao: new Date().toISOString(),
        data_fechamento: (isVendaTotal || isPartialSale) ? new Date().toISOString() : null
      };

      console.log('🔧 opportunityData preparado:', opportunityData);

      if (existingOpportunity) {
        // Atualizar oportunidade existente - NUNCA alterar valor_total_oportunidade
        // CRÍTICO: Usar a mesma lógica de status correto para update
        const isVendaPerdidaUpdate = salesType === 'perdido';
        // Para venda parcial: salesType parcial OU quando há partial value menor que sales value
        const isPartialSaleUpdate = salesType === 'parcial' || (partialSalesValue > 0 && partialSalesValue < salesValue);
        // Para venda total: salesType ganho E não é venda parcial
        const isVendaTotalUpdate = salesType === 'ganho' && !isPartialSaleUpdate && (salesValue > 0 || partialSalesValue > 0);
        
        let correctStatusUpdate = 'Prospect';
        if (isVendaPerdidaUpdate) {
          correctStatusUpdate = 'Venda Perdida';
        } else if (isPartialSaleUpdate) {
          correctStatusUpdate = 'Venda Parcial';
        } else if (isVendaTotalUpdate) {
          correctStatusUpdate = 'Venda Total';
        }

        const updateData = {
          task_id: taskId,
          cliente_nome: clientName,
          filial: filial,
          status: correctStatusUpdate, // CORRETO: usar status baseado nos valores
          // CRÍTICO: NUNCA alterar valor_total_oportunidade - sempre preservar o valor original
          // valor_total_oportunidade: NÃO INCLUIR NO UPDATE
          valor_venda_fechada: isVendaTotalUpdate ? salesValue : (isPartialSaleUpdate ? partialSalesValue : 0),
          data_fechamento: (isVendaTotalUpdate || isPartialSaleUpdate) ? new Date().toISOString() : null,
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
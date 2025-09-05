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
      
      // CORREÇÃO: Também verificar se o status da opportunity existente já é "Venda Total"
      const isVendaTotalExistente = existingOpportunity?.status === 'Venda Total';
      const finalIsVendaTotal = isVendaTotal || isVendaTotalExistente;
      
      let correctStatus = 'Prospect';
      if (isVendaPerdida) {
        correctStatus = 'Venda Perdida';
      } else if (isPartialSale) {
        correctStatus = 'Venda Parcial';
      } else if (finalIsVendaTotal) {
        correctStatus = 'Venda Total';
      }

      console.log('🔧 ensureOpportunity: Determinando status correto:', {
        taskId,
        clientName,
        salesValue,
        partialSalesValue,
        salesType,
        isPartialSale,
        isVendaTotal,
        isVendaPerdida,
        correctStatus,
        valorVendaFechadaCalculado: isVendaTotal ? salesValue : (isPartialSale ? partialSalesValue : 0)
      });

      const opportunityData = {
        task_id: taskId,
        cliente_nome: clientName,
        filial: filial,
        status: correctStatus, // CORRETO: usar status baseado nos valores
        valor_total_oportunidade: Math.max(salesValue, partialSalesValue), // Usar o maior valor como total
        valor_venda_fechada: finalIsVendaTotal ? salesValue : (isPartialSale ? partialSalesValue : 0),
        data_criacao: new Date().toISOString(),
        data_fechamento: (finalIsVendaTotal || isPartialSale) ? new Date().toISOString() : null
      };

      console.log('🔧 opportunityData preparado:', {
        ...opportunityData,
        calculatedValues: {
          isVendaTotal,
          finalIsVendaTotal,
          isPartialSale,
          valorVendaFechada: opportunityData.valor_venda_fechada
        }
      });

      if (existingOpportunity) {
        // Atualizar oportunidade existente - NUNCA alterar valor_total_oportunidade
        // CRÍTICO: Usar a mesma lógica de status correto para update
        const isVendaPerdidaUpdate = salesType === 'perdido';
        // Para venda parcial: salesType parcial OU quando há partial value menor que sales value
        const isPartialSaleUpdate = salesType === 'parcial' || (partialSalesValue > 0 && partialSalesValue < salesValue);
        // Para venda total: salesType ganho E partialSalesValue >= salesValue (ou sem partial definido)
        const isVendaTotalUpdate = salesType === 'ganho' && (!partialSalesValue || partialSalesValue >= salesValue);
        
        let correctStatusUpdate = 'Prospect';
        if (isVendaPerdidaUpdate) {
          correctStatusUpdate = 'Venda Perdida';
        } else if (isPartialSaleUpdate) {
          correctStatusUpdate = 'Venda Parcial';
        } else if (isVendaTotalUpdate) {
          correctStatusUpdate = 'Venda Total';
        }

        const valorVendaFechada = correctStatusUpdate === 'Venda Total' ? salesValue : (isPartialSaleUpdate ? partialSalesValue : 0);
        
        console.log('🔥 ANTES DA ATUALIZAÇÃO - Dados que serão salvos:', {
          opportunityId: existingOpportunity.id,
          status: correctStatusUpdate,
          valor_venda_fechada: valorVendaFechada,
          salesValue,
          partialSalesValue,
          correctStatusUpdate,
          isVendaTotalUpdate,
          isPartialSaleUpdate
        });

        const updateData = {
          task_id: taskId,
          cliente_nome: clientName,
          filial: filial,
          status: correctStatusUpdate,
          valor_venda_fechada: valorVendaFechada,
          data_fechamento: (isVendaTotalUpdate || isPartialSaleUpdate) ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        };
        
        console.log('🔧 Atualizando oportunidade no banco:', updateData);
        const { data: updatedOpportunity, error } = await supabase
          .from('opportunities')
          .update(updateData)
          .eq('id', existingOpportunity.id)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Erro ao atualizar oportunidade:', error);
          throw error;
        }

        // CRÍTICO: Se é Venda Total, garantir que qtd_vendida = qtd_ofertada nos items
        // para que o trigger de recálculo funcione corretamente
        if (correctStatusUpdate === 'Venda Total') {
          console.log('🔧 Atualizando qtd_vendida para Venda Total');
          
          // Primeiro buscar os items atuais
          const { data: currentItems } = await supabase
            .from('opportunity_items')
            .select('id, qtd_ofertada, preco_unit')
            .eq('opportunity_id', existingOpportunity.id);
            
          if (currentItems && currentItems.length > 0) {
            // Atualizar cada item individualmente
            for (const item of currentItems) {
              const { error: itemError } = await supabase
                .from('opportunity_items')
                .update({ 
                  qtd_vendida: item.qtd_ofertada,
                  subtotal_vendido: item.qtd_ofertada * item.preco_unit,
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
                
              if (itemError) {
                console.error('❌ Erro ao atualizar item:', itemError);
              }
            }
            console.log('✅ Items atualizados para Venda Total');
          }
        }
        
        if (error) {
          console.error('❌ Erro ao atualizar oportunidade:', error);
          throw error;
        }

        console.log('🎯 APÓS A ATUALIZAÇÃO - Dados salvos no banco:', {
          id: updatedOpportunity.id,
          status: updatedOpportunity.status,
          valor_venda_fechada: updatedOpportunity.valor_venda_fechada,
          valor_total_oportunidade: updatedOpportunity.valor_total_oportunidade,
          data_fechamento: updatedOpportunity.data_fechamento,
          updated_at: updatedOpportunity.updated_at
        });

        // Verificação crítica para confirmar que o valor foi salvo corretamente
        if (correctStatusUpdate === 'Venda Total' && updatedOpportunity.valor_venda_fechada !== salesValue) {
          console.error('🚨 ERRO CRÍTICO: valor_venda_fechada não foi salvo corretamente!', {
            esperado: salesValue,
            salvo: updatedOpportunity.valor_venda_fechada,
            diferenca: salesValue - updatedOpportunity.valor_venda_fechada
          });
        }

        return existingOpportunity.id;
      } else {
        // Criar nova oportunidade
        console.log('🔧 Inserindo nova oportunidade no banco:', opportunityData);
        const { data, error } = await supabase
          .from('opportunities')
          .insert(opportunityData)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Nova oportunidade criada:', opportunityData);
        
        // CRÍTICO: Se é Venda Total, garantir que qtd_vendida = qtd_ofertada nos items
        if (correctStatus === 'Venda Total') {
          console.log('🔧 Atualizando qtd_vendida para nova Venda Total');
          
          // Buscar items existentes (se houver)
          const { data: existingItems } = await supabase
            .from('opportunity_items')
            .select('id, qtd_ofertada, preco_unit')
            .eq('opportunity_id', data.id);
            
          if (existingItems && existingItems.length > 0) {
            for (const item of existingItems) {
              const { error: itemError } = await supabase
                .from('opportunity_items')
                .update({ 
                  qtd_vendida: item.qtd_ofertada,
                  subtotal_vendido: item.qtd_ofertada * item.preco_unit,
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
                
              if (itemError) {
                console.error('❌ Erro ao atualizar item da nova oportunidade:', itemError);
              }
            }
            console.log('✅ Items da nova oportunidade atualizados para Venda Total');
          }
        }
        
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
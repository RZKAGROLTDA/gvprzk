import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';

interface CreateOpportunityParams {
  taskId: string;
  clientName: string;
  filial: string;
  salesValue: number;
  salesType: 'ganho' | 'parcial' | 'perdido' | 'prospect';
  partialSalesValue?: number;
  salesConfirmed?: boolean;
  items?: Array<{
    id: string;
    produto?: string;
    qtd_vendida: number;
    qtd_ofertada: number;
    preco_unit: number;
  }>;
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
    const { taskId, clientName, filial, salesValue, salesType, partialSalesValue = 0, salesConfirmed = false, items } = params;
    
    console.log('🔧 ensureOpportunity chamado com:', { 
      taskId, 
      salesType, 
      salesValue, 
      partialSalesValue,
      itemsCount: items?.length || 0,
      items: items?.map(i => ({ id: i.id, qtd_vendida: i.qtd_vendida, qtd_ofertada: i.qtd_ofertada }))
    });
    
    try {
      console.log('🔍 Buscando oportunidade existente para task:', taskId);
      
      // Verificar se já existe uma oportunidade para esta task
      const { data: allOpportunities, error: checkError } = await supabase
        .from('opportunities')
        .select('id, task_id, status, valor_total_oportunidade, valor_venda_fechada, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50);
      
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

      // CRÍTICO: Determinar status correto baseado no salesType
      const isVendaPerdida = salesType === 'perdido';
      const isPartialSale = salesType === 'parcial';
      const isVendaTotal = salesType === 'ganho';
      const isProspect = salesType === 'prospect';
      
      console.log('🔥 ENSURE OPPORTUNITY - Status Logic:', {
        salesType,
        isVendaPerdida,
        isPartialSale,
        isVendaTotal,
        isProspect
      });
      
      let correctStatus = 'Prospect';
      if (isVendaPerdida) {
        correctStatus = 'Venda Perdida';
      } else if (isPartialSale) {
        correctStatus = 'Venda Parcial';
      } else if (isVendaTotal) {
        correctStatus = 'Venda Total';
      } else if (isProspect) {
        correctStatus = 'Prospect';
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

      // Para CREATE: usar salesValue (total de todos os produtos ofertados).
      // salesValue vem de FormVisualization que usa qtd_ofertada × preco_unit,
      // garantindo que reflita o valor total da oportunidade, não apenas os selecionados.
      const opportunityData = {
        task_id: taskId,
        cliente_nome: clientName,
        filial: filial,
        status: correctStatus,
        valor_total_oportunidade: salesValue,
        valor_venda_fechada: isVendaTotal ? salesValue : (isPartialSale ? partialSalesValue : 0),
        data_criacao: new Date().toISOString(),
        data_fechamento: (isVendaTotal || isPartialSale) ? new Date().toISOString() : null
      };

      console.log('🔧 opportunityData preparado:', {
        ...opportunityData,
        calculatedValues: {
          isVendaTotal,
          isPartialSale,
          valorVendaFechada: opportunityData.valor_venda_fechada
        }
      });

      if (existingOpportunity) {
        // Atualizar oportunidade existente - NUNCA alterar valor_total_oportunidade
        // CRÍTICO: Usar a mesma lógica de status correto para update
        const isVendaPerdidaUpdate = salesType === 'perdido';
        const isPartialSaleUpdate = salesType === 'parcial';
        const isVendaTotalUpdate = salesType === 'ganho';
        const isProspectUpdate = salesType === 'prospect';
        
        console.log('🔥 UPDATE OPPORTUNITY - Status Logic:', {
          salesType,
          isVendaPerdidaUpdate,
          isPartialSaleUpdate,
          isVendaTotalUpdate,
          isProspectUpdate
        });
        
        let correctStatusUpdate = 'Prospect';
        if (isVendaPerdidaUpdate) {
          correctStatusUpdate = 'Venda Perdida';
        } else if (isPartialSaleUpdate) {
          correctStatusUpdate = 'Venda Parcial';
        } else if (isVendaTotalUpdate) {
          correctStatusUpdate = 'Venda Total';
        } else if (isProspectUpdate) {
          correctStatusUpdate = 'Prospect';
        }

        // CRÍTICO: Zerar valor para Prospect e Venda Perdida
        const valorVendaFechada = (correctStatusUpdate === 'Venda Total') ? salesValue : 
                                  (correctStatusUpdate === 'Venda Parcial') ? partialSalesValue : 0;
        
        console.log('🔥 CALCULANDO VALOR VENDA FECHADA:', {
          correctStatusUpdate,
          salesValue,
          partialSalesValue,
          isPartialSaleUpdate,
          isVendaTotalUpdate,
          valorVendaFechada
        });
        
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

        // Para UPDATE: NUNCA sobrescrever valor_total_oportunidade com o valor da venda parcial.
        // Preservar o valor registrado no banco (que reflete todos os produtos ofertados).
        // Só usa salesValue como fallback se o registro não tiver valor ainda.
        const valorTotalPreservado = (existingOpportunity.valor_total_oportunidade ?? 0) > 0
          ? existingOpportunity.valor_total_oportunidade
          : salesValue;

        const updateData = {
          task_id: taskId,
          cliente_nome: clientName,
          filial: filial,
          status: correctStatusUpdate,
          valor_total_oportunidade: valorTotalPreservado,
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

        // NOVO: Atualizar items se fornecidos
        if (items && items.length > 0) {
          console.log('🔧 PROCESSANDO ITEMS RECEBIDOS:', {
            itemsCount: items.length,
            salesType,
            correctStatusUpdate,
            items: items.map(i => ({
              id: i.id,
              qtd_vendida: i.qtd_vendida,
              qtd_ofertada: i.qtd_ofertada,
              preco_unit: i.preco_unit
            }))
          });

          for (const item of items) {
            console.log('🔧 ANTES DE ATUALIZAR ITEM:', {
              id: item.id,
              qtd_vendida_enviada: item.qtd_vendida,
              qtd_ofertada: item.qtd_ofertada
            });

            const { error: itemError } = await supabase
              .from('opportunity_items')
              .update({
                produto: item.produto, // Preservar o nome do produto
                qtd_vendida: item.qtd_vendida,
                qtd_ofertada: item.qtd_ofertada,
                preco_unit: item.preco_unit,
                updated_at: new Date().toISOString()
              })
              .eq('id', item.id);
              
            if (itemError) {
              console.error('❌ Erro ao atualizar item:', itemError);
            } else {
              console.log('✅ Item atualizado via items array:', {
                id: item.id,
                qtd_vendida: item.qtd_vendida,
                qtd_ofertada: item.qtd_ofertada
              });
            }
          }
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
            // Atualizar cada item individualmente - qtd_vendida = qtd_ofertada para venda total
            for (const item of currentItems) {
              const { error: itemError } = await supabase
                .from('opportunity_items')
                .update({ 
                  qtd_vendida: item.qtd_ofertada, // CRÍTICO: Para venda total, vendido = ofertado
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
                
              if (itemError) {
                console.error('❌ Erro ao atualizar item:', itemError);
              } else {
                console.log('✅ Item atualizado para Venda Total:', {
                  id: item.id,
                  qtd_vendida: item.qtd_ofertada,
                  qtd_ofertada: item.qtd_ofertada
                });
              }
            }
            console.log('✅ Items atualizados para Venda Total');
          }
        } else if (correctStatusUpdate === 'Venda Parcial') {
          // Para venda parcial, usar os valores de items fornecidos ou manter os existentes
          console.log('🔧 Atualizando para Venda Parcial');
          if (items && items.length > 0) {
            for (const item of items) {
              const { error: itemError } = await supabase
                .from('opportunity_items')
                .update({
                  qtd_vendida: item.qtd_vendida, // Usar o valor específico fornecido
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
                
              if (itemError) {
                console.error('❌ Erro ao atualizar item parcial:', itemError);
              }
            }
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

        // Verificar o valor final após todas as atualizações
        console.log('🔍 VERIFICANDO VALOR FINAL após atualizações...');
        const { data: finalOpportunity, error: finalError } = await supabase
          .from('opportunities')
          .select('*')
          .eq('id', existingOpportunity.id)
          .single();
          
        if (finalError) {
          console.error('❌ Erro ao buscar oportunidade final:', finalError);
        } else {
          console.log('🎯 ESTADO FINAL DA OPORTUNIDADE:', {
            id: finalOpportunity.id,
            status: finalOpportunity.status,
            valor_venda_fechada: finalOpportunity.valor_venda_fechada,
            valor_total_oportunidade: finalOpportunity.valor_total_oportunidade,
            updated_at: finalOpportunity.updated_at
          });
        }

        // Verificar também o estado final dos items
        const { data: finalItems } = await supabase
          .from('opportunity_items')
          .select('*')
          .eq('opportunity_id', existingOpportunity.id);
          
        console.log('🎯 ESTADO FINAL DOS ITEMS:', finalItems?.map(item => ({
          id: item.id,
          qtd_vendida: item.qtd_vendida,
          qtd_ofertada: item.qtd_ofertada,
          subtotal_vendido: item.subtotal_vendido,
          subtotal_ofertado: item.subtotal_ofertado
        })));

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
                  qtd_vendida: item.qtd_ofertada, // CRÍTICO: Para venda total, vendido = ofertado
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
            salesType: (task.sales_type as 'ganho' | 'parcial' | 'perdido' | 'prospect') || 'ganho',
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
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface TaskEditData {
  // Unified task data from tasks table
  id: string;
  cliente_nome: string;
  cliente_email: string;
  filial: string;
  filialAtendida?: string;
  notas: string;
  observations?: string;
  vendedor_id: string;
  data: Date;
  tipo: string;
  task_type?: string;

  // Additional task data
  name?: string;
  responsible?: string;
  property?: string;
  phone?: string;
  clientCode?: string;
  taskType?: string;
  priority?: string;
  startDate?: Date;
  endDate?: Date;
  startTime?: string;
  endTime?: string;
  familyProduct?: string;
  equipmentQuantity?: number;
  propertyHectares?: number;

  // Extra fields needed by "visualizar" modal (keeps same load source as editar)
  status?: string;
  is_prospect?: boolean | null;
  photos?: string[];
  documents?: string[];
  check_in_location?: any;
  initialKm?: number | null;
  finalKm?: number | null;
  equipment_list?: any;

  // Sales data
  sales_confirmed?: boolean;
  sales_type?: string;
  sales_value?: number;
  partial_sales_value?: number;

  // Opportunity data
  opportunity?: {
    id: string;
    status: string;
    valor_total_oportunidade: number;
    valor_venda_fechada: number;
  };

  // Opportunity items
  items: Array<{
    id: string;
    produto: string;
    sku: string;
    qtd_ofertada: number;
    qtd_vendida: number;
    preco_unit: number;
    subtotal_ofertado: number;
    subtotal_vendido: number;
  }>;

  // Original products for name mapping
  originalProducts?: Array<{
    id: string;
    name: string;
    category: string;
  }>;
}

export const useTaskEditData = (taskId: string | null) => {
  const [data, setData] = useState<TaskEditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Force clear data when taskId or user changes to avoid stale cache
  useEffect(() => {
    setData(null);
    setError(null);
  }, [taskId, user?.id]);

  const fetchTaskData = async () => {
    if (!taskId || !user?.id) {
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      // CRITICAL: Force complete session refresh to ensure auth.uid() is current
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Erro ao atualizar sessão:', refreshError);
      }
      
      // Wait a moment for session to be fully updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      
      console.log('🔍 Session verified for user:', session.user.id);
      
      // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários
      let { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('id, name, responsible, client, clientcode, property, email, phone, propertyhectares, filial, filial_atendida, task_type, start_date, end_date, start_time, end_time, observations, priority, status, created_at, updated_at, created_by, is_prospect, sales_value, sales_confirmed, sales_type, partial_sales_value, family_product, equipment_quantity, photos, documents, check_in_location, initial_km, final_km, equipment_list')
        .eq('id', taskId)
        .maybeSingle();

      if (taskError) {
        console.error('🔍 TaskEditData - Supabase error:', taskError);
        if (taskError.message?.includes('permission') || taskError.message?.includes('policy')) {
          throw new Error('Você não tem permissão para acessar esta task');
        }
        throw new Error(`Erro ao buscar task: ${taskError.message}`);
      }

      if (!taskData) {
        // FALLBACK: buscar uma única task pela RPC (evita carregar 500 tasks)
        const { data: secureRow, error: secureError } = await supabase.rpc(
          'get_secure_task_by_id',
          { p_task_id: taskId }
        );
        const foundTask = secureRow?.[0];
        if (!secureError && foundTask) {
          console.log('🔍 Task encontrada via get_secure_task_by_id');
          taskData = { ...foundTask, task_type: foundTask.task_type, start_date: foundTask.start_date, end_date: foundTask.end_date } as any;
        }
        if (!taskData) {
          throw new Error('Task não encontrada. Verifique se o ID está correto e se você tem permissão para acessá-la.');
        }
      }

      // Convert tasks table data to unified format
      const unifiedTaskData = {
        id: taskData.id,
        cliente_nome: taskData.client,
        cliente_email: taskData.email,
        filial: taskData.filial,
        filialAtendida: taskData.filial_atendida,
        notas: taskData.observations,
        vendedor_id: taskData.created_by,
        data: taskData.start_date,
        tipo: taskData.task_type,
        created_at: taskData.created_at,
        updated_at: taskData.updated_at,
         // Include all additional task data
         name: taskData.name,
         responsible: taskData.responsible,
         property: taskData.property,
         phone: taskData.phone,
         clientCode: taskData.clientcode,
         taskType: taskData.task_type,
         priority: taskData.priority,
         startDate: taskData.start_date,
         endDate: taskData.end_date,
         startTime: taskData.start_time,
         endTime: taskData.end_time,
         familyProduct: taskData.family_product,
         equipmentQuantity: taskData.equipment_quantity,
         propertyHectares: taskData.propertyhectares,
         status: taskData.status,
         is_prospect: taskData.is_prospect,
         photos: taskData.photos || [],
         documents: taskData.documents || [],
         check_in_location: taskData.check_in_location,
         initialKm: taskData.initial_km,
         finalKm: taskData.final_km,
         equipment_list: taskData.equipment_list,
         // Sales data
         sales_confirmed: taskData.sales_confirmed,
         sales_type: taskData.sales_type,
         sales_value: taskData.sales_value,
         partial_sales_value: taskData.partial_sales_value
       };

      // Fetch opportunity data
      // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários
      const { data: opportunityData, error: opportunityError } = await supabase
        .from('opportunities')
        .select('id, task_id, status, valor_total_oportunidade, valor_venda_fechada, filial, cliente_nome')
        .eq('task_id', taskId)
        .maybeSingle();

      if (opportunityError) throw opportunityError;

      // Fetch opportunity items and products
      let itemsData = [];
      
      if (opportunityData?.id) {
        const { data: fetchedItems, error: itemsError } = await supabase
          .from('opportunity_items')
          .select('id, opportunity_id, produto, sku, qtd_ofertada, qtd_vendida, preco_unit, subtotal_ofertado, subtotal_vendido')
          .eq('opportunity_id', opportunityData.id)
          .order('produto');

        if (itemsError) throw itemsError;
        itemsData = fetchedItems || [];
      }

      // Fallback: quando não há opportunity_items, construir a partir de products
      if (itemsData.length === 0) {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('id, task_id, name, category, selected, quantity, price')
          .eq('task_id', taskId)
          .order('name');

        if (productsError) {
          console.error('Erro buscando produtos:', productsError);
        } else if (productsData && productsData.length > 0) {
          itemsData = productsData.map(product => {
            const preco = product.price || 0;
            const qtdOfertada = product.quantity || 0;
            let qtdVendida = 0;
            if (taskData.sales_type === 'ganho' && taskData.sales_confirmed) {
              qtdVendida = qtdOfertada;
            } else if (taskData.sales_type === 'parcial' && product.selected) {
              qtdVendida = qtdOfertada;
            }
            return {
              id: product.id,
              produto: product.name,
              sku: product.category,
              qtd_ofertada: qtdOfertada,
              qtd_vendida: qtdVendida,
              preco_unit: preco,
              subtotal_ofertado: qtdOfertada * preco,
              subtotal_vendido: qtdVendida * preco
            };
          });
        }
      }
      // Quando opportunity_items existe, usa diretamente — qtd_ofertada e qtd_vendida
      // são preservados como salvos (o save nunca mais sobrescreve qtd_ofertada).

      // Buscar produtos originais para mapeamento de nomes
      const { data: originalProducts } = await supabase
        .from('products')
        .select('id, name, category')
        .eq('task_id', taskId);

      const fullData = {
        ...unifiedTaskData,
        opportunity: opportunityData,
        items: itemsData || [],
        originalProducts: originalProducts || []
      };

      setData(fullData as any);

    } catch (err: any) {
      setError(err.message);
      toast.error('Erro ao carregar dados da task');
    } finally {
      setLoading(false);
    }
  };

  // opportunityId: ID da oportunidade recém-criada pelo ensureOpportunity (primeiro save).
  // Necessário porque data.opportunity é null quando carregado antes da oportunidade existir.
  const updateTaskData = async (updates: any, opportunityId?: string) => {
    if (!taskId || !data) return false;

    setLoading(true);
    setError(null);

    try {
      // Update task data in unified tasks table
      if (updates.cliente_nome || updates.cliente_email || updates.filial || updates.observations || updates.task_type) {
        // Prepare task update with all fields including sales values
        const taskUpdateData: any = {
          name: updates.name || data.name,
          responsible: updates.responsible || data.responsible,
          property: updates.property || data.property,
          phone: updates.phone || data.phone,
          clientcode: updates.clientcode || data.clientCode,
          task_type: updates.task_type || data.taskType || data.tipo,
          priority: updates.priority || data.priority,
          client: updates.cliente_nome || data.cliente_nome,
          email: updates.cliente_email || data.cliente_email,
          filial: updates.filial || data.filial,
          observations: updates.observations || data.notas,
          updated_at: new Date().toISOString()
        };

        // CRÍTICO: NUNCA alterar sales_value - sempre preservar o valor original
        // sales_value não deve ser incluído no update para preservar o valor original
        if (updates.partialSalesValue !== undefined) {
          taskUpdateData.partial_sales_value = updates.partialSalesValue;
        }
        if (updates.sales_type !== undefined) {
          taskUpdateData.sales_type = updates.sales_type;
        }
        if (updates.sales_confirmed !== undefined) {
          taskUpdateData.sales_confirmed = updates.sales_confirmed;
        }
        if (updates.status !== undefined) {
          taskUpdateData.status = updates.status;
        }

        console.log('🔍 useTaskEditData: Atualizando tasks table com:', taskUpdateData);

        const { error: taskError } = await supabase
          .from('tasks')
          .update(taskUpdateData)
          .eq('id', taskId);

        if (taskError) {
          console.error('Erro ao atualizar task:', taskError);
          throw taskError;
        } else {
          console.log('✅ useTaskEditData: Tasks table atualizada com sucesso');
        }
      }

      // REMOVIDO: Não atualizar opportunity aqui - deixar o ensureOpportunity do TaskEditModal gerenciar
      // A opportunity já é gerenciada pelo useOpportunityManager via ensureOpportunity
      
      // REMOVIDO: Criação de nova oportunidade - isso é responsabilidade do ensureOpportunity no TaskEditModal

      // Update items - try both opportunity_items and products
      if (updates.items) {
        // Usar o ID da oportunidade: o recém-criado (primeiro save) ou o já existente (edições)
        const effectiveOpportunityId = opportunityId || data.opportunity?.id;

        for (const item of updates.items) {
          if (effectiveOpportunityId) {
            const qtdOfertada = item.qtd_ofertada || 0;
            const qtdVendida  = item.qtd_vendida  || 0;
            const precoUnit   = item.preco_unit   || 0;

            // UPDATE por id apenas (sem filtrar por opportunity_id).
            // Filtrar por opportunity_id causava 0 rows quando o item foi criado
            // com um opportunity_id diferente, travando em conflito de INSERT.
            const { data: updatedRows, error: updateError } = await supabase
              .from('opportunity_items')
              .update({
                opportunity_id:   effectiveOpportunityId, // corrige opportunity_id se estiver errado
                qtd_ofertada:     qtdOfertada,
                qtd_vendida:      qtdVendida,
                subtotal_ofertado: qtdOfertada * precoUnit,
                subtotal_vendido: qtdVendida * precoUnit,
                produto:          item.produto || 'Produto',
                updated_at:       new Date().toISOString()
              })
              .eq('id', item.id)
              .select('id');

            // Se nenhuma linha foi encontrada pelo id, o item não existe → INSERT
            if (!updatedRows || updatedRows.length === 0) {
              const { error: insertError } = await supabase
                .from('opportunity_items')
                .insert({
                  id:                item.id,
                  opportunity_id:    effectiveOpportunityId,
                  produto:           item.produto || 'Produto',
                  sku:               item.sku || '',
                  qtd_ofertada:      qtdOfertada,
                  qtd_vendida:       qtdVendida,
                  preco_unit:        precoUnit,
                  subtotal_ofertado: qtdOfertada * precoUnit,
                  subtotal_vendido:  qtdVendida  * precoUnit,
                  updated_at:        new Date().toISOString()
                });

              if (insertError) {
                // Se INSERT falhou por conflito de id, força UPDATE novamente sem filtro de id
                console.warn('⚠️ INSERT falhou, tentando UPDATE forçado:', insertError.message);
                await supabase
                  .from('opportunity_items')
                  .update({
                    opportunity_id:   effectiveOpportunityId,
                    qtd_ofertada:     qtdOfertada,
                    qtd_vendida:      qtdVendida,
                    subtotal_ofertado: qtdOfertada * precoUnit,
                    subtotal_vendido: qtdVendida * precoUnit,
                    updated_at:       new Date().toISOString()
                  })
                  .eq('id', item.id);
              }
            }
          } else {
            // Try products table
            const { error: productError } = await supabase
              .from('products')
              .update({
                selected: item.qtd_vendida > 0,
                quantity: item.qtd_vendida > 0 ? item.qtd_vendida : item.qtd_ofertada, // CORRETO: salvar quantidade vendida se vendeu, senão ofertada
                price: item.preco_unit,
                updated_at: new Date().toISOString()
              })
              .eq('id', item.id);

            if (productError) {
              console.warn('Erro ao atualizar products:', productError);
            }
          }
        }
      }

      console.log('✅ useTaskEditData: Dados atualizados com sucesso');
      toast.success('Dados atualizados com sucesso');
      return true;

    } catch (err: any) {
      console.error('🔍 useTaskEditData: Erro ao atualizar dados:', {
        error: err.message,
        taskId,
        stack: err.stack
      });
      setError(err.message);
      toast.error('Erro ao atualizar dados');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId && user?.id) {
      setData(null);
      setError(null);
      fetchTaskData();
    }
  }, [taskId, user?.id]);

  return {
    data,
    loading,
    error,
    refetch: fetchTaskData,
    updateTaskData
  };
};
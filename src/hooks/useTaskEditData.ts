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
        .select('id, name, responsible, client, clientcode, property, email, phone, propertyhectares, filial, filial_atendida, task_type, start_date, end_date, start_time, end_time, observations, priority, status, created_at, updated_at, created_by, is_prospect, sales_value, sales_confirmed, sales_type, partial_sales_value, family_product, equipment_quantity')
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
        // FALLBACK: Try using the secure function as last resort
        console.log('🔍 Task not found via direct query, trying secure function...');
        
        const { data: secureData, error: secureError } = await supabase.rpc(
          'get_secure_tasks_with_customer_protection'
        );
        
        if (!secureError && secureData) {
          const foundTask = secureData.find((task: any) => task.id === taskId);
          if (foundTask) {
            console.log('🔍 Task found via secure function!', { taskId, client: foundTask.client });
            // Convert the secure function result to our expected format
            const convertedTask = {
              ...foundTask,
              task_type: foundTask.task_type,
              start_date: foundTask.start_date,
              end_date: foundTask.end_date,
              // Map all fields properly
            };
            // Use the found task data
            taskData = convertedTask;
          }
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
        // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários
        const { data: fetchedItems, error: itemsError } = await supabase
          .from('opportunity_items')
          .select('id, opportunity_id, produto, sku, qtd_ofertada, qtd_vendida, preco_unit, subtotal_ofertado, subtotal_vendido')
          .eq('opportunity_id', opportunityData.id)
          .order('produto');

        if (itemsError) throw itemsError;
        itemsData = fetchedItems || [];
        
        console.log('🔍 useTaskEditData: opportunity_items encontrados:', itemsData.length);
      }

      // CRITICAL FIX: If no opportunity items, ALWAYS try products table for this task
      // This handles cases where opportunity exists but items weren't migrated
      if (itemsData.length === 0) {
        console.log('🔍 useTaskEditData: Nenhum item em opportunity_items, buscando products...');
        
        // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('id, task_id, name, category, selected, quantity, price')
          .eq('task_id', taskId)
          .order('name');

        if (productsError) {
          console.error('Erro buscando produtos:', productsError);
        } else if (productsData && productsData.length > 0) {
          console.log('🔍 useTaskEditData: products encontrados:', productsData.length);
          
          // Convert products to opportunity items format
          itemsData = productsData.map(product => {
            const preco = product.price || 0;
            const qtdOfertada = product.quantity || 0;
            
            // Determinar qtd_vendida baseado no status da task
            let qtdVendida = 0;
            
            // Se product.selected = true, significa que foi vendido
            if (product.selected) {
              qtdVendida = product.quantity || 0;
            }
            
            // Para venda total (sales_type='ganho'), vendido = ofertado
            if (taskData.sales_type === 'ganho' && taskData.sales_confirmed) {
              qtdVendida = qtdOfertada;
            }
            // Para venda parcial, usar selected
            else if (taskData.sales_type === 'parcial' && product.selected) {
              qtdVendida = product.quantity || 0;
            }
            
            console.log('🔍 useTaskEditData: Mapeando produto:', {
              name: product.name,
              qtdOfertada,
              qtdVendida,
              preco,
              selected: product.selected,
              sales_type: taskData.sales_type
            });
            
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

      // Buscar produtos originais para mapear nomes
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

      setData(fullData);

    } catch (err: any) {
      setError(err.message);
      toast.error('Erro ao carregar dados da task');
    } finally {
      setLoading(false);
    }
  };

  const updateTaskData = async (updates: any) => {
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
        console.log('🔍 useTaskEditData: Atualizando items:', {
          itemsCount: updates.items.length,
          hasOpportunity: !!data.opportunity?.id,
          opportunityId: data.opportunity?.id
        });
        
        for (const item of updates.items) {
          console.log('🔍 useTaskEditData: Processando item:', {
            id: item.id,
            produto: item.produto,
            qtd_vendida: item.qtd_vendida,
            qtd_ofertada: item.qtd_ofertada,
            preco_unit: item.preco_unit
          });
          
          // Try opportunity_items first
          if (data.opportunity?.id) {
            console.log('🔍 useTaskEditData: Tentando upsert opportunity_items');
            
            const { data: updateResult, error: itemError } = await supabase
              .from('opportunity_items')
              .upsert({
                id: item.id,
                opportunity_id: data.opportunity.id,
                produto: item.produto || 'Produto', // Preservar nome do produto se disponível
                sku: item.sku || '',
                qtd_vendida: item.qtd_vendida,
                qtd_ofertada: item.qtd_ofertada,
                preco_unit: item.preco_unit,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'id'
              })
              .select();

            console.log('🔍 useTaskEditData: Resultado upsert opportunity_items:', {
              itemId: item.id,
              error: itemError,
              updateResult,
              rowsAffected: updateResult?.length || 0
            });

            if (itemError) {
              console.warn('❌ Erro ao fazer upsert opportunity_items:', itemError);
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
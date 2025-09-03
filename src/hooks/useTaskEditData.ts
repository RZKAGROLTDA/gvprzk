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
  notas: string;
  vendedor_id: string;
  data: Date;
  tipo: string;
  
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
}

export const useTaskEditData = (taskId: string | null) => {
  const [data, setData] = useState<TaskEditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  console.log('🔍 useTaskEditData: Hook inicializado com:', { taskId, userId: user?.id });

  const fetchTaskData = async () => {
    if (!taskId) {
      console.log('🔍 useTaskEditData: taskId é nulo, não carregando dados');
      return;
    }

    console.log('🔍 useTaskEditData: Iniciando carregamento para taskId:', taskId);
    
    // Verificar autenticação
    if (!user) {
      console.error('🔍 useTaskEditData: Usuário não autenticado');
      setError('Usuário não autenticado');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      // Buscar task na tabela unificada tasks
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (taskError) {
        console.error('🔍 useTaskEditData: Erro buscando task:', taskError);
        throw taskError;
      }

      if (!taskData) {
        throw new Error('Task não encontrada');
      }

      // Convert tasks table data to unified format
      const unifiedTaskData = {
        id: taskData.id,
        cliente_nome: taskData.client,
        cliente_email: taskData.email,
        filial: taskData.filial,
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
        propertyHectares: taskData.propertyhectares
      };

      console.log('🔍 useTaskEditData: Task encontrada:', { 
        id: unifiedTaskData.id, 
        cliente_nome: unifiedTaskData.cliente_nome,
        vendedor_id: unifiedTaskData.vendedor_id,
        table: 'tasks'
      });

      // Fetch opportunity data
      const { data: opportunityData, error: opportunityError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('task_id', taskId)
        .maybeSingle();

      if (opportunityError) throw opportunityError;

      console.log('🔍 useTaskEditData: Opportunity encontrada:', { 
        opportunity: !!opportunityData, 
        status: opportunityData?.status 
      });

      // Fetch opportunity items and products
      let itemsData = [];
      
      if (opportunityData?.id) {
        const { data: fetchedItems, error: itemsError } = await supabase
          .from('opportunity_items')
          .select('*')
          .eq('opportunity_id', opportunityData.id)
          .order('produto');

        if (itemsError) throw itemsError;
        itemsData = fetchedItems || [];
      }

      // If no opportunity items, try products table for this task
      if (itemsData.length === 0) {
        console.log('🔍 useTaskEditData: Tentando buscar produtos da tabela products');
        
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('task_id', taskId)
          .order('name');

        if (productsError) {
          console.error('🔍 useTaskEditData: Erro buscando produtos:', productsError);
        } else if (productsData && productsData.length > 0) {
          // Convert products to opportunity items format
          itemsData = productsData.map(product => ({
            id: product.id,
            produto: product.name,
            sku: product.category,
            qtd_ofertada: product.quantity || 0,
            qtd_vendida: product.selected ? (product.quantity || 0) : 0,
            preco_unit: product.price || 0,
            subtotal_ofertado: (product.quantity || 0) * (product.price || 0),
            subtotal_vendido: product.selected ? ((product.quantity || 0) * (product.price || 0)) : 0
          }));
          
          console.log('🔍 useTaskEditData: Produtos convertidos:', { 
            productsCount: productsData.length,
            convertedItems: itemsData.length
          });
        }
      }

      console.log('🔍 useTaskEditData: Items encontrados:', { 
        items: itemsData?.length || 0 
      });

      const fullData = {
        ...unifiedTaskData,
        opportunity: opportunityData,
        items: itemsData || []
      };

      console.log('🔍 useTaskEditData: Dados completos carregados:', { 
        hasTask: !!unifiedTaskData,
        hasOpportunity: !!opportunityData,
        itemsCount: itemsData?.length || 0
      });

      setData(fullData);

    } catch (err: any) {
      console.error('🔍 useTaskEditData: Erro ao carregar dados:', {
        error: err.message,
        taskId,
        stack: err.stack
      });
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
      if (updates.cliente_nome || updates.cliente_email || updates.filial || updates.notas || updates.tipo) {
        // Prepare task update with all fields including sales values
        const taskUpdateData: any = {
          name: updates.name || data.name,
          responsible: updates.responsible || data.responsible,
          property: updates.property || data.property,
          phone: updates.phone || data.phone,
          clientcode: updates.clientCode || data.clientCode,
          task_type: updates.taskType || data.taskType || updates.tipo,
          priority: updates.priority || data.priority,
          client: updates.cliente_nome || data.cliente_nome,
          email: updates.cliente_email || data.cliente_email,
          filial: updates.filial || data.filial,
          observations: updates.notas || data.notas,
          updated_at: new Date().toISOString()
        };

        // Add sales values if provided - preservar valor original para sales_value
        if (updates.sales_value !== undefined) {
          taskUpdateData.sales_value = updates.sales_value; // Usar valor específico para tasks
        }
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

      // Update opportunity data if exists - APENAS atualizar, não criar
      if (data.opportunity && updates.opportunity) {
        const updateData: any = {
          status: updates.opportunity.status || data.opportunity.status,
          updated_at: new Date().toISOString()
        };
        
        // Atualizar valor_venda_fechada baseado no status e tipo de venda
        if (updates.opportunity.valor_venda_fechada !== undefined) {
          updateData.valor_venda_fechada = updates.opportunity.valor_venda_fechada;
        }
        
        console.log('🔍 useTaskEditData: Atualizando opportunity existente:', updateData);

        const { error: opportunityError } = await supabase
          .from('opportunities')
          .update(updateData)
          .eq('id', data.opportunity.id);

        if (opportunityError) {
          console.error('Erro ao atualizar opportunity:', opportunityError);
          throw opportunityError;
        } else {
          console.log('✅ useTaskEditData: Opportunity atualizada com sucesso');
        }
      }
      
      // REMOVIDO: Criação de nova oportunidade - isso é responsabilidade do ensureOpportunity no TaskEditModal

      // Update items - try both opportunity_items and products
      if (updates.items) {
        for (const item of updates.items) {
          // Try opportunity_items first
          if (data.opportunity?.id) {
            const { error: itemError } = await supabase
              .from('opportunity_items')
              .update({
                qtd_vendida: item.qtd_vendida,
                subtotal_vendido: item.qtd_vendida * item.preco_unit,
                updated_at: new Date().toISOString()
              })
              .eq('id', item.id);

            if (itemError) {
              console.warn('Erro ao atualizar opportunity_items:', itemError);
            }
          } else {
            // Try products table
            const { error: productError } = await supabase
              .from('products')
              .update({
                selected: item.qtd_vendida > 0,
                quantity: item.qtd_ofertada,
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
    fetchTaskData();
  }, [taskId]);

  return {
    data,
    loading,
    error,
    refetch: fetchTaskData,
    updateTaskData
  };
};
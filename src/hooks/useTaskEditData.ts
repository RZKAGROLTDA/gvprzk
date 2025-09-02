import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface TaskEditData {
  // Task data from tasks_new
  id: string;
  cliente_nome: string;
  cliente_email: string;
  filial: string;
  notas: string;
  vendedor_id: string;
  data: Date;
  tipo: string;
  
  // Additional task data from original tasks table
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
      // Try to fetch from tasks_new table first
      let { data: taskData, error: taskError } = await supabase
        .from('tasks_new')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      let isFromTasksNew = true;

      // If not found in tasks_new, try tasks table
      if (!taskData) {
        console.log('🔍 useTaskEditData: Task não encontrada em tasks_new, tentando tasks');
        
        const { data: originalTaskData, error: originalTaskError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .maybeSingle();

        if (originalTaskError) {
          console.error('🔍 useTaskEditData: Erro buscando em tasks:', originalTaskError);
          throw originalTaskError;
        }

        if (!originalTaskData) {
          throw new Error('Task não encontrada');
        }

        // Convert tasks table data to tasks_new format
        taskData = {
          id: originalTaskData.id,
          cliente_nome: originalTaskData.client,
          cliente_email: originalTaskData.email,
          filial: originalTaskData.filial,
          notas: originalTaskData.observations,
          vendedor_id: originalTaskData.created_by,
          data: originalTaskData.start_date,
          tipo: originalTaskData.task_type,
          created_at: originalTaskData.created_at,
          updated_at: originalTaskData.updated_at,
          // Include original task data
          name: originalTaskData.name,
          responsible: originalTaskData.responsible,
          property: originalTaskData.property,
          phone: originalTaskData.phone,
          clientCode: originalTaskData.clientcode,
          taskType: originalTaskData.task_type,
          priority: originalTaskData.priority,
          startDate: originalTaskData.start_date,
          endDate: originalTaskData.end_date,
          startTime: originalTaskData.start_time,
          endTime: originalTaskData.end_time,
          familyProduct: originalTaskData.family_product,
          equipmentQuantity: originalTaskData.equipment_quantity,
          propertyHectares: originalTaskData.propertyhectares
        };
        isFromTasksNew = false;
      }

      console.log('🔍 useTaskEditData: Task encontrada:', { 
        id: taskData.id, 
        cliente_nome: taskData.cliente_nome,
        vendedor_id: taskData.vendedor_id,
        table: isFromTasksNew ? 'tasks_new' : 'tasks'
      });

      // If from tasks_new, try to get additional data from original tasks table
      if (isFromTasksNew) {
        const { data: originalTaskData } = await supabase
          .from('tasks')
          .select('*')
          .eq('client', taskData.cliente_nome)
          .eq('created_by', taskData.vendedor_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('🔍 useTaskEditData: Dados adicionais encontrados:', { 
          hasOriginalData: !!originalTaskData
        });

        // Merge additional data if found
        if (originalTaskData) {
          taskData.name = originalTaskData.name;
          taskData.responsible = originalTaskData.responsible;
          taskData.property = originalTaskData.property;
          taskData.phone = originalTaskData.phone;
          taskData.clientCode = originalTaskData.clientcode;
          taskData.taskType = originalTaskData.task_type;
          taskData.priority = originalTaskData.priority;
          taskData.startDate = originalTaskData.start_date;
          taskData.endDate = originalTaskData.end_date;
          taskData.startTime = originalTaskData.start_time;
          taskData.endTime = originalTaskData.end_time;
          taskData.familyProduct = originalTaskData.family_product;
          taskData.equipmentQuantity = originalTaskData.equipment_quantity;
          taskData.propertyHectares = originalTaskData.propertyhectares;
        }
      }

      // Fetch opportunity data - try both tables
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

      // Fetch opportunity items and products - try both sources
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
        ...taskData,
        // Include additional data if available (already merged above for tasks table)
        opportunity: opportunityData,
        items: itemsData || []
      };

      console.log('🔍 useTaskEditData: Dados completos carregados:', { 
        hasTask: !!taskData,
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
      // Update task data in tasks_new
      if (updates.cliente_nome || updates.cliente_email || updates.filial || updates.notas || updates.tipo) {
        const { error: taskError } = await supabase
          .from('tasks_new')
          .update({
            cliente_nome: updates.cliente_nome || data.cliente_nome,
            cliente_email: updates.cliente_email || data.cliente_email,
            filial: updates.filial || data.filial,
            notas: updates.notas || data.notas,
            tipo: updates.tipo || data.tipo,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);

        if (taskError) throw taskError;
      }

      // Update additional task data in original tasks table if we have the data
      if (data.name || !data.opportunity) {
        // Try to update tasks table directly by ID first
        const { error: originalTaskError } = await supabase
          .from('tasks')
          .update({
            name: updates.name || data.name,
            responsible: updates.responsible || data.responsible,
            property: updates.property || data.property,
            phone: updates.phone || data.phone,
            clientcode: updates.clientCode || data.clientCode,
            task_type: updates.taskType || data.taskType,
            priority: updates.priority || data.priority,
            client: updates.cliente_nome || data.cliente_nome,
            email: updates.cliente_email || data.cliente_email,
            filial: updates.filial || data.filial,
            observations: updates.notas || data.notas,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);

        if (originalTaskError) {
          console.warn('Erro ao atualizar dados da task:', originalTaskError);
        }
      }

      // Update opportunity data if exists
      if (data.opportunity && updates.opportunity) {
        const { error: opportunityError } = await supabase
          .from('opportunities')
          .update({
            status: updates.opportunity.status || data.opportunity.status,
            valor_venda_fechada: updates.opportunity.valor_venda_fechada || data.opportunity.valor_venda_fechada,
            valor_total_oportunidade: updates.opportunity.valor_total_oportunidade || data.opportunity.valor_total_oportunidade,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.opportunity.id);

        if (opportunityError) throw opportunityError;
      }

      // Update tasks table with calculated values if provided
      if (updates.salesValue !== undefined || updates.prospectValue !== undefined || updates.partialSalesValue !== undefined) {
        const { error: taskValuesError } = await supabase
          .from('tasks')
          .update({
            sales_value: updates.salesValue,
            partial_sales_value: updates.partialSalesValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);

        if (taskValuesError) {
          console.warn('Erro ao atualizar valores calculados na tabela tasks:', taskValuesError);
        }
      }

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

      toast.success('Task atualizada com sucesso!');
      await fetchTaskData(); // Reload data
      return true;

    } catch (err: any) {
      console.error('Error updating task data:', err);
      setError(err.message);
      toast.error('Erro ao atualizar task');
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
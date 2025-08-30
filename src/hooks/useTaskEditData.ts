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

      if (taskError) {
        console.error('🔍 useTaskEditData: Erro buscando em tasks_new:', taskError);
        throw taskError;
      }

      // If not found in tasks_new, this task doesn't exist
      if (!taskData) {
        throw new Error('Task não encontrada');
      }

      console.log('🔍 useTaskEditData: Task encontrada:', { 
        id: taskData.id, 
        cliente_nome: taskData.cliente_nome,
        vendedor_id: taskData.vendedor_id,
        table: 'tasks_new'
      });

      // Try to get additional data from original tasks table by multiple criteria
      const { data: originalTaskData } = await supabase
        .from('tasks')
        .select('name, responsible, property, phone, clientcode, task_type, priority, start_date, end_date, start_time, end_time, family_product, equipment_quantity, propertyhectares')
        .or(`and(client.eq.${taskData.cliente_nome},created_by.eq.${taskData.vendedor_id}),and(name.ilike.%${taskData.cliente_nome}%,created_by.eq.${taskData.vendedor_id})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('🔍 useTaskEditData: Dados adicionais encontrados:', { 
        hasOriginalData: !!originalTaskData
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

      // Fetch opportunity items only if we have a valid opportunity
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

      console.log('🔍 useTaskEditData: Items encontrados:', { 
        items: itemsData?.length || 0 
      });

      const fullData = {
        ...taskData,
        // Include additional data from original tasks table if available
        name: originalTaskData?.name,
        responsible: originalTaskData?.responsible,
        property: originalTaskData?.property,
        phone: originalTaskData?.phone,
        clientCode: originalTaskData?.clientcode,
        taskType: originalTaskData?.task_type,
        priority: originalTaskData?.priority,
        startDate: originalTaskData?.start_date,
        endDate: originalTaskData?.end_date,
        startTime: originalTaskData?.start_time,
        endTime: originalTaskData?.end_time,
        familyProduct: originalTaskData?.family_product,
        equipmentQuantity: originalTaskData?.equipment_quantity,
        propertyHectares: originalTaskData?.propertyhectares,
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
      if (data.name && (updates.name || updates.responsible || updates.property || updates.phone || updates.clientCode || updates.taskType || updates.priority)) {
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
            updated_at: new Date().toISOString()
          })
          .eq('client', data.cliente_nome)
          .eq('created_by', data.vendedor_id);

        if (originalTaskError) {
          console.warn('Erro ao atualizar dados adicionais da task:', originalTaskError);
        }
      }

      // Update opportunity data if exists
      if (data.opportunity && updates.opportunity) {
        const { error: opportunityError } = await supabase
          .from('opportunities')
          .update({
            status: updates.opportunity.status || data.opportunity.status,
            valor_venda_fechada: updates.opportunity.valor_venda_fechada || data.opportunity.valor_venda_fechada,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.opportunity.id);

        if (opportunityError) throw opportunityError;
      }

      // Update items if provided
      if (updates.items) {
        for (const item of updates.items) {
          const { error: itemError } = await supabase
            .from('opportunity_items')
            .update({
              qtd_vendida: item.qtd_vendida,
              subtotal_vendido: item.qtd_vendida * item.preco_unit,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          if (itemError) throw itemError;
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
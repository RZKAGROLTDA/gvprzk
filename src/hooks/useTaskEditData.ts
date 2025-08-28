import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  const fetchTaskData = async () => {
    if (!taskId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch task data from tasks_new
      const { data: taskData, error: taskError } = await supabase
        .from('tasks_new')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (taskError) throw taskError;
      if (!taskData) {
        throw new Error('Task não encontrada');
      }

      // Fetch opportunity data
      const { data: opportunityData, error: opportunityError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('task_id', taskId)
        .maybeSingle();

      if (opportunityError) throw opportunityError;

      // Fetch opportunity items
      const { data: itemsData, error: itemsError } = await supabase
        .from('opportunity_items')
        .select('*')
        .eq('opportunity_id', opportunityData?.id || 'none')
        .order('produto');

      if (itemsError) throw itemsError;

      setData({
        ...taskData,
        opportunity: opportunityData,
        items: itemsData || []
      });

    } catch (err: any) {
      console.error('Error fetching task edit data:', err);
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
      // Update task data
      if (updates.cliente_nome || updates.cliente_email || updates.filial || updates.notas) {
        const { error: taskError } = await supabase
          .from('tasks_new')
          .update({
            cliente_nome: updates.cliente_nome || data.cliente_nome,
            cliente_email: updates.cliente_email || data.cliente_email,
            filial: updates.filial || data.filial,
            notas: updates.notas || data.notas,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);

        if (taskError) throw taskError;
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
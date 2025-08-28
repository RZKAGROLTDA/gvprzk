import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TaskWithOpportunity {
  // Task data from tasks_new
  id: string;
  vendedor_id: string;
  data: string;
  tipo: string;
  cliente_nome: string;
  cliente_email: string | null;
  filial: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
  
  // Opportunity data
  opportunity_id: string;
  status: 'Prospect' | 'Venda Total' | 'Venda Parcial' | 'Venda Perdida';
  valor_total_oportunidade: number;
  valor_venda_fechada: number;
  data_criacao: string;
  data_fechamento: string | null;
}

export interface OpportunityItemFull {
  id: string;
  opportunity_id: string;
  produto: string;
  sku: string | null;
  preco_unit: number;
  qtd_ofertada: number;
  qtd_vendida: number;
  subtotal_ofertado: number;
  subtotal_vendido: number;
  incluir_na_venda_parcial: boolean;
  created_at: string;
  updated_at: string;
}

export const useTaskWithOpportunity = (taskId: string) => {
  return useQuery({
    queryKey: ['task-with-opportunity', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks_new')
        .select(`
          *,
          opportunities (
            id,
            status,
            valor_total_oportunidade,
            valor_venda_fechada,
            data_criacao,
            data_fechamento
          )
        `)
        .eq('id', taskId)
        .single();

      if (error) {
        console.error('Error fetching task with opportunity:', error);
        throw error;
      }

      // Transform the data to match our interface
      const opportunity = data.opportunities?.[0];
      if (!opportunity) {
        throw new Error('Opportunity not found for this task');
      }

      return {
        ...data,
        opportunity_id: opportunity.id,
        status: opportunity.status,
        valor_total_oportunidade: opportunity.valor_total_oportunidade,
        valor_venda_fechada: opportunity.valor_venda_fechada,
        data_criacao: opportunity.data_criacao,
        data_fechamento: opportunity.data_fechamento
      } as TaskWithOpportunity;
    },
    enabled: !!taskId
  });
};

export const useTaskOpportunityItems = (taskId: string) => {
  return useQuery({
    queryKey: ['task-opportunity-items', taskId],
    queryFn: async () => {
      // First get the opportunity_id from the task
      const { data: taskData, error: taskError } = await supabase
        .from('tasks_new')
        .select('opportunities(id)')
        .eq('id', taskId)
        .single();

      if (taskError) {
        throw taskError;
      }

      const opportunityId = taskData.opportunities?.[0]?.id;
      if (!opportunityId) {
        return [];
      }

      // Then get the items
      const { data, error } = await supabase
        .from('opportunity_items')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching opportunity items:', error);
        throw error;
      }

      // Add the incluir_na_venda_parcial flag based on qtd_vendida
      return data.map(item => ({
        ...item,
        incluir_na_venda_parcial: item.qtd_vendida > 0
      })) as OpportunityItemFull[];
    },
    enabled: !!taskId
  });
};

export const useUpdateTaskWithOpportunity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      taskData,
      opportunityData,
      items
    }: {
      taskId: string;
      taskData: {
        cliente_nome: string;
        cliente_email: string | null;
      };
      opportunityData: {
        status: 'Prospect' | 'Venda Total' | 'Venda Parcial' | 'Venda Perdida';
        valor_venda_fechada: number;
        data_fechamento?: string | null;
      };
      items: {
        id: string;
        qtd_vendida: number;
        incluir_na_venda_parcial: boolean;
      }[];
    }) => {
      // 1. Update task
      const { error: taskError } = await supabase
        .from('tasks_new')
        .update({
          cliente_nome: taskData.cliente_nome,
          cliente_email: taskData.cliente_email,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (taskError) {
        throw taskError;
      }

      // 2. Get opportunity_id
      const { data: taskWithOpp, error: oppIdError } = await supabase
        .from('tasks_new')
        .select('opportunities(id)')
        .eq('id', taskId)
        .single();

      if (oppIdError) {
        throw oppIdError;
      }

      const opportunityId = taskWithOpp.opportunities?.[0]?.id;
      if (!opportunityId) {
        throw new Error('Opportunity not found');
      }

      // 3. Update opportunity
      const { error: opportunityError } = await supabase
        .from('opportunities')
        .update({
          status: opportunityData.status,
          valor_venda_fechada: opportunityData.valor_venda_fechada,
          data_fechamento: opportunityData.data_fechamento,
          updated_at: new Date().toISOString()
        })
        .eq('id', opportunityId);

      if (opportunityError) {
        throw opportunityError;
      }

      // 4. Update items
      for (const item of items) {
        const { error: itemError } = await supabase
          .from('opportunity_items')
          .update({
            qtd_vendida: item.incluir_na_venda_parcial ? item.qtd_vendida : 0,
            subtotal_vendido: item.incluir_na_venda_parcial ? item.qtd_vendida * (await supabase
              .from('opportunity_items')
              .select('preco_unit')
              .eq('id', item.id)
              .single()
            ).data.preco_unit : 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (itemError) {
          throw itemError;
        }
      }

      return { taskId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-with-opportunity'] });
      queryClient.invalidateQueries({ queryKey: ['task-opportunity-items'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success('Task atualizada com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating task with opportunity:', error);
      toast.error('Erro ao atualizar task');
    }
  });
};
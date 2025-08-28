import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OpportunityWithTask {
  opportunity_id: string;
  task_id: string;
  tipo: string;
  vendedor_id: string;
  cliente_nome: string;
  cliente_email: string;
  filial: string;
  data: string;
  notas: string;
  status: 'Prospect' | 'Venda Total' | 'Venda Parcial' | 'Venda Perdida';
  valor_total_oportunidade: number;
  valor_venda_fechada: number;
  conversao_pct: number;
  data_criacao: string;
  data_fechamento: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityItem {
  id: string;
  produto: string;
  sku: string;
  preco_unit: number;
  qtd_ofertada: number;
  qtd_vendida: number;
  subtotal_ofertado: number;
  subtotal_vendido: number;
  created_at: string;
  updated_at: string;
}

export const useOpportunities = () => {
  return useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_opportunities_with_tasks');
      
      if (error) {
        console.error('Error fetching opportunities:', error);
        throw error;
      }
      
      return data as OpportunityWithTask[];
    }
  });
};

export const useOpportunityItems = (opportunityId: string) => {
  return useQuery({
    queryKey: ['opportunity-items', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_opportunity_items', {
        opportunity_id_param: opportunityId
      });
      
      if (error) {
        console.error('Error fetching opportunity items:', error);
        throw error;
      }
      
      return data as OpportunityItem[];
    },
    enabled: !!opportunityId
  });
};

export const useUpdateOpportunity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      opportunityId, 
      status, 
      items 
    }: { 
      opportunityId: string; 
      status: string;
      items?: { id: string; qtd_vendida: number }[];
    }) => {
      // 1. Atualizar status da oportunidade
      const { error: opportunityError } = await supabase
        .from('opportunities')
        .update({ status })
        .eq('id', opportunityId);

      if (opportunityError) {
        throw opportunityError;
      }

      // 2. Atualizar itens se fornecidos (para venda parcial)
      if (items && items.length > 0) {
        for (const item of items) {
          const { error: itemError } = await supabase
            .from('opportunity_items')
            .update({ qtd_vendida: item.qtd_vendida })
            .eq('id', item.id);

          if (itemError) {
            throw itemError;
          }
        }
      }

      return { opportunityId, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunity-items'] });
      toast.success('Oportunidade atualizada com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating opportunity:', error);
      toast.error('Erro ao atualizar oportunidade');
    }
  });
};

export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskData: {
      tipo: string;
      cliente_nome: string;
      cliente_email?: string;
      filial: string;
      data: string;
      notas?: string;
      items: {
        produto: string;
        sku: string;
        preco_unit: number;
        qtd_ofertada: number;
      }[];
    }) => {
      // 1. Criar task
      const { data: task, error: taskError } = await supabase
        .from('tasks_new')
        .insert({
          tipo: taskData.tipo,
          vendedor_id: (await supabase.auth.getUser()).data.user?.id,
          cliente_nome: taskData.cliente_nome,
          cliente_email: taskData.cliente_email,
          filial: taskData.filial,
          data: taskData.data,
          notas: taskData.notas
        })
        .select()
        .single();

      if (taskError) {
        throw taskError;
      }

      // 2. Criar oportunidade
      const { data: opportunity, error: opportunityError } = await supabase
        .from('opportunities')
        .insert({
          task_id: task.id,
          cliente_nome: taskData.cliente_nome,
          filial: taskData.filial,
          status: 'Prospect'
        })
        .select()
        .single();

      if (opportunityError) {
        throw opportunityError;
      }

      // 3. Criar itens
      if (taskData.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('opportunity_items')
          .insert(
            taskData.items.map(item => ({
              opportunity_id: opportunity.id,
              produto: item.produto,
              sku: item.sku,
              preco_unit: item.preco_unit,
              qtd_ofertada: item.qtd_ofertada,
              qtd_vendida: 0
            }))
          );

        if (itemsError) {
          throw itemsError;
        }
      }

      return { task, opportunity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success('Task e oportunidade criadas com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating task:', error);
      toast.error('Erro ao criar task');
    }
  });
};
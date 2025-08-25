import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOffline } from '@/hooks/useOffline';
import { Task, ProductType, Reminder } from '@/types/task';
import { toast } from '@/components/ui/use-toast';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { loadFiliaisCache, createTaskWithFilialSnapshot } from '@/lib/taskStandardization';

// Query Keys para cache
export const QUERY_KEYS = {
  tasks: ['tasks'] as const,
  consultants: ['consultants'] as const,
  filiais: ['filiais'] as const,
  taskDetails: (id: string) => ['task', id] as const,
};

// Hook principal otimizado para carregar tasks com cache
export const useTasksOptimized = () => {
  const { user } = useAuth();
  const { isOnline, getOfflineTasks } = useOffline();
  const queryClient = useQueryClient();

    // Query super otimizada para máxima performance
    const tasksQuery = useQuery({
      queryKey: QUERY_KEYS.tasks,
      queryFn: async () => {
        if (!user) throw new Error('User not authenticated');

        try {
          // Carregar cache de filiais
          await loadFiliaisCache();

          if (!isOnline) {
            return getOfflineTasks();
          }

          // Query única super otimizada
          const { data: tasksData, error } = await supabase
            .from('tasks')
            .select(`
              id, name, responsible, client, property, filial, task_type,
              start_date, end_date, start_time, end_time, observations,
              priority, status, created_at, updated_at, created_by,
              is_prospect, sales_value, sales_confirmed, prospect_notes,
              family_product, equipment_quantity, equipment_list
            `)
            .order('created_at', { ascending: false })
            .limit(50); // Reduzido para 50 para carregamento ultra-rápido

          if (error) throw error;

          if (!tasksData?.length) return [];

          // Mapear tasks diretamente para máxima performance
          const mappedTasks = tasksData.map(task => {
            return mapSupabaseTaskToTask({
              ...task,
              products: [], // Carregaremos sob demanda se necessário
              reminders: [] // Carregaremos sob demanda se necessário
            });
          });
          
          return mappedTasks;
      } catch (error) {
        console.error('❌ Error loading tasks:', error);
        // Fallback para dados offline
        return getOfflineTasks();
      }
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutos - cache mais longo
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Não refetch automático no mount
    retry: 1, // Apenas 1 retry para performance
    meta: {
      errorMessage: 'Erro ao carregar tarefas'
    }
  });

  // Mutation para criar task
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: Partial<Task>) => {
      if (!user) throw new Error('User not authenticated');

      const standardizedTaskData = await createTaskWithFilialSnapshot(taskData);
      
      // Criar task no Supabase
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          name: taskData.name || getDefaultTaskName(taskData.taskType || 'prospection'),
          responsible: taskData.responsible || user.email || '',
          client: taskData.client || '',
          clientcode: taskData.clientCode || '',
          property: standardizedTaskData.property || '',
          email: taskData.email || '',
          propertyhectares: taskData.propertyHectares || 0,
          filial: standardizedTaskData.filial || '',
          task_type: standardizedTaskData.taskType || 'prospection',
          start_date: standardizedTaskData.startDate?.toISOString().split('T')[0],
          end_date: standardizedTaskData.endDate?.toISOString().split('T')[0],
          start_time: standardizedTaskData.startTime,
          end_time: standardizedTaskData.endTime,
          observations: standardizedTaskData.observations || '',
          priority: standardizedTaskData.priority,
          photos: standardizedTaskData.photos || [],
          documents: standardizedTaskData.documents || [],
          check_in_location: standardizedTaskData.checkInLocation,
          initial_km: standardizedTaskData.initialKm || 0,
          final_km: standardizedTaskData.finalKm || 0,
          created_by: user.id,
          is_prospect: standardizedTaskData.isProspect || false,
          prospect_notes: standardizedTaskData.prospectNotes || '',
          sales_value: standardizedTaskData.salesValue || 0,
          sales_confirmed: standardizedTaskData.salesConfirmed,
          family_product: standardizedTaskData.familyProduct || null,
          equipment_quantity: standardizedTaskData.equipmentQuantity || null,
          equipment_list: standardizedTaskData.equipmentList || null
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Criar products e reminders em paralelo se necessário
      const promises = [];
      
      if (taskData.checklist?.length) {
        const products = taskData.checklist.map(product => ({
          task_id: task.id,
          name: product.name,
          category: product.category,
          selected: product.selected,
          quantity: product.quantity || 0,
          price: product.price || 0,
          observations: product.observations || '',
          photos: product.photos || []
        }));
        promises.push(supabase.from('products').insert(products));
      }

      if (taskData.reminders?.length) {
        const reminders = taskData.reminders.map(reminder => ({
          task_id: task.id,
          title: reminder.title,
          description: reminder.description || '',
          date: reminder.date.toISOString().split('T')[0],
          time: reminder.time,
          completed: reminder.completed || false
        }));
        promises.push(supabase.from('reminders').insert(reminders));
      }

      if (promises.length) {
        await Promise.all(promises);
      }

      return task;
    },
    onSuccess: () => {
      // Invalidar cache para refetch otimizado
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      toast({
        title: "✅ Tarefa Criada",
        description: "Tarefa salva com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error('❌ Error creating task:', error);
      toast({
        title: "❌ Erro",
        description: "Erro ao criar tarefa. Tente novamente.",
        variant: "destructive",
      });
    }
  });

  // Mutation para atualizar task
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      let finalUpdates = { ...updates };
      
      if (updates.salesConfirmed === true || updates.salesConfirmed === false) {
        finalUpdates.status = 'completed';
      }

      if (updates.salesConfirmed !== undefined || (updates.salesValue && updates.salesValue > 0)) {
        finalUpdates.isProspect = true;
      }

      const { error } = await supabase
        .from('tasks')
        .update({
          ...finalUpdates,
          updated_at: new Date().toISOString(),
          family_product: finalUpdates.familyProduct || null,
          equipment_quantity: finalUpdates.equipmentQuantity || null,
          equipment_list: finalUpdates.equipmentList || null
        })
        .eq('id', taskId);

      if (error) throw error;
      return finalUpdates;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
    onError: (error: any) => {
      console.error('❌ Error updating task:', error);
      toast({
        title: "❌ Erro",
        description: "Erro ao atualizar tarefa.",
        variant: "destructive",
      });
    }
  });

  return {
    tasks: tasksQuery.data || [],
    loading: tasksQuery.isLoading,
    error: tasksQuery.error,
    createTask: createTaskMutation.mutateAsync,
    updateTask: (taskId: string, updates: Partial<Task>) => 
      updateTaskMutation.mutateAsync({ taskId, updates }),
    refetch: tasksQuery.refetch,
    isCreating: createTaskMutation.isPending,
    isUpdating: updateTaskMutation.isPending,
  };
};

// Hook para carregar consultants com cache
export const useConsultants = () => {
  return useQuery({
    queryKey: QUERY_KEYS.consultants,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('approval_status', 'approved')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutos - dados relativamente estáticos
    refetchOnWindowFocus: false,
  });
};

// Hook para carregar filiais com cache
export const useFiliais = () => {
  return useQuery({
    queryKey: QUERY_KEYS.filiais,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutos - dados relativamente estáticos
    refetchOnWindowFocus: false,
  });
};

// Função helper para nome padrão da tarefa
const getDefaultTaskName = (taskType: string): string => {
  switch (taskType) {
    case 'ligacao':
      return 'Ligação para Cliente';
    case 'checklist':
      return 'Checklist da Oficina';
    default:
      return 'Visita à Fazenda';
  }
};
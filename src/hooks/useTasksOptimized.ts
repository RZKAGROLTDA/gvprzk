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
export const useTasksOptimized = (includeDetails = false) => {
  const { user } = useAuth();
  const { isOnline, getOfflineTasks } = useOffline();
  const queryClient = useQueryClient();

    // Query super otimizada para máxima performance
    const tasksQuery = useQuery({
      queryKey: includeDetails ? [...QUERY_KEYS.tasks, 'with-details'] : QUERY_KEYS.tasks,
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
              family_product, equipment_quantity, equipment_list, photos, documents,
              email, clientcode, check_in_location, initial_km, final_km,
              propertyhectares, sales_type
            `)
            .order('created_at', { ascending: false })
            .limit(includeDetails ? 100 : 50);

          if (error) throw error;

          if (!tasksData?.length) return [];

          // Se incluir detalhes, carregar products e reminders
          if (includeDetails) {
            const taskIds = tasksData.map(task => task.id);
            
            const [productsResult, remindersResult] = await Promise.all([
              supabase
                .from('products')
                .select('*')
                .in('task_id', taskIds),
              supabase
                .from('reminders')
                .select('*')
                .in('task_id', taskIds)
            ]);

            const productsByTask = productsResult.data?.reduce((acc, product) => {
              if (!acc[product.task_id]) acc[product.task_id] = [];
              acc[product.task_id].push(product);
              return acc;
            }, {} as Record<string, any[]>) || {};

            const remindersByTask = remindersResult.data?.reduce((acc, reminder) => {
              if (!acc[reminder.task_id]) acc[reminder.task_id] = [];
              acc[reminder.task_id].push(reminder);
              return acc;
            }, {} as Record<string, any[]>) || {};

            // Mapear tasks com dados completos
            const mappedTasks = tasksData.map(task => {
              return mapSupabaseTaskToTask({
                ...task,
                products: productsByTask[task.id] || [],
                reminders: remindersByTask[task.id] || []
              });
            });
            
            return mappedTasks;
          }

          // Mapear tasks diretamente para máxima performance (sem details)
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
    staleTime: 2 * 60 * 1000, // 2 minutos - cache mais responsivo
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Permitir refetch no mount para dados atuais
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

// Hook para carregar detalhes completos de uma task específica
export const useTaskDetails = (taskId: string | null) => {
  return useQuery({
    queryKey: taskId ? QUERY_KEYS.taskDetails(taskId) : ['task-details-empty'],
    queryFn: async () => {
      if (!taskId) return null;

      const [taskResult, productsResult, remindersResult] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .single(),
        supabase
          .from('products')
          .select('*')
          .eq('task_id', taskId),
        supabase
          .from('reminders')
          .select('*')
          .eq('task_id', taskId)
      ]);

      if (taskResult.error) throw taskResult.error;

      return mapSupabaseTaskToTask({
        ...taskResult.data,
        products: productsResult.data || [],
        reminders: remindersResult.data || []
      });
    },
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000, // 5 minutos para dados específicos
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
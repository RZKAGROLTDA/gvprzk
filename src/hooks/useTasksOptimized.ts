import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOffline } from '@/hooks/useOffline';
import { Task, ProductType, Reminder } from '@/types/task';
import { toast } from '@/components/ui/use-toast';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { loadFiliaisCache, createTaskWithFilialSnapshot } from '@/lib/taskStandardization';
import { getSalesValueAsNumber, canPerformNumericOperation } from '@/lib/securityUtils';

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

  // Função para verificar e criar perfil se necessário
  const ensureUserProfile = async () => {
    if (!user) return false;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, approval_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && !error.message.includes('No rows')) {
        console.error('❌ Erro ao verificar perfil:', error);
        return false;
      }

      if (!profile) {
        console.log('🔄 Criando perfil ausente...');
        // Buscar filial padrão
        const { data: defaultFilial } = await supabase
          .from('filiais')
          .select('id')
          .order('nome')
          .limit(1)
          .single();

        // Use secure profile creation function
        const { error: createError } = await supabase.rpc('create_secure_profile', {
          user_id_param: user.id,
          name_param: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
          email_param: user.email || '',
          role_param: 'consultant',
          filial_id_param: defaultFilial?.id || null
        });

        if (createError) {
          console.error('❌ Erro ao criar perfil:', createError);
          return false;
        }
        
        console.log('✅ Perfil criado automaticamente (aguardando aprovação)');
        return false; // Return false since profile needs approval
      }

      return profile.approval_status === 'approved';
    } catch (error) {
      console.error('❌ Erro crítico na verificação do perfil:', error);
      return false;
    }
  };

  // Query com retry automático e fallback otimizado
  const tasksQuery = useQuery({
    queryKey: includeDetails ? [...QUERY_KEYS.tasks, 'with-details'] : QUERY_KEYS.tasks,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Verificar perfil primeiro
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, approval_status')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!profile || profile.approval_status !== 'approved') {
          console.log('❌ Perfil não encontrado ou não aprovado, retornando array vazio');
          return [];
        }
      } catch (error) {
        console.error('❌ Erro ao verificar perfil:', error);
        return [];
      }

      // Timeout otimizado de 8 segundos
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        // Carregar cache de filiais
        await loadFiliaisCache().catch(() => console.log('⚠️ Cache de filiais não carregado'));

        if (!isOnline) {
          console.log('📴 App offline - usando dados locais');
          clearTimeout(timeout);
          return getOfflineTasks();
        }

        console.log('🔄 Carregando tasks via função segura...');
        
        // Usar função segura com fallback melhorado
        let tasksData, error;
        try {
          const result = await supabase
            .rpc('get_secure_tasks_with_customer_protection')
            .abortSignal(controller.signal);
            
          tasksData = result.data;
          error = result.error;
          console.log('✅ Tasks carregadas via função segura:', tasksData?.length || 0);
        } catch (rpcError: any) {
          console.log('⚠️ Função segura falhou, tentando fallback...');
          
          // Tentar função alternativa como fallback
          try {
            const fallbackResult = await supabase
              .rpc('get_secure_customer_data_enhanced')
              .abortSignal(controller.signal);
              
            if (fallbackResult.error) {
              throw fallbackResult.error;
            }
            
            tasksData = fallbackResult.data;
            error = null;
            console.log('✅ Fallback bem-sucedido:', tasksData?.length || 0);
          } catch (fallbackError) {
            console.error('❌ Fallback também falhou:', fallbackError);
            // Log de segurança
            try {
              await supabase.rpc('monitor_unauthorized_customer_access');
            } catch (logError) {
              console.error('Failed to log unauthorized access:', logError);
            }
            throw new Error('Access to customer data requires secure function. All access methods failed.');
          }
        }

        clearTimeout(timeout);
        
        if (error) {
          console.error('❌ Erro ao carregar dados:', error);
          // Tentar cache como último recurso
          const cachedData = queryClient.getQueryData(QUERY_KEYS.tasks);
          if (cachedData) {
            console.log('✅ Usando dados do cache como fallback');
            return cachedData as Task[];
          }
          throw error;
        }

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
        clearTimeout(timeout);
        console.error('❌ Erro crítico ao carregar tasks:', error);
        
        // Circuit breaker inteligente
        console.log('🔄 Tentando recuperar dados do cache local...');
        const cachedData = queryClient.getQueryData(QUERY_KEYS.tasks);
        if (cachedData) {
          console.log('✅ Dados recuperados do cache local');
          return cachedData as Task[];
        }
        
        // Se offline, tentar dados offline
        if (!isOnline) {
          console.log('📴 Recuperando dados offline');
          return getOfflineTasks();
        }
        
        // Em último caso, retornar array vazio ao invés de erro para melhor UX
        console.log('⚠️ Circuit breaker ativado - retornando array vazio para melhor UX');
        return [];
      }
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutos - reduzido para dados mais frescos
    refetchOnWindowFocus: false, // Desabilitado para evitar requests desnecessários
    refetchOnMount: true, 
    retry: (failureCount, error) => {
      // Retry mais conservativo
      if (error?.message?.includes('timeout') || 
          error?.message?.includes('JWT') || 
          error?.message?.includes('unauthorized') ||
          error?.message?.includes('AbortError')) {
        return false; // Não retry em timeouts ou erros de auth
      }
      return failureCount < 1; // Apenas 1 retry para outros erros
    },
    retryDelay: 1500, // 1.5 segundos de delay
    refetchInterval: false,
    meta: {
      errorMessage: 'Erro ao carregar tarefas'
    }
  });

  // Mutation para criar task
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: Partial<Task>) => {
      if (!user) throw new Error('User not authenticated');

      const standardizedTaskData = await createTaskWithFilialSnapshot(taskData);
      
      // Process equipment data from equipmentList
      const equipmentData = Array.isArray(taskData.equipmentList) && taskData.equipmentList.length > 0 
        ? {
            family_product: taskData.equipmentList[0]?.familyProduct || null,
            equipment_quantity: taskData.equipmentList.reduce((sum: number, eq: any) => sum + (eq.quantity || 0), 0),
            equipment_list: taskData.equipmentList
          }
        : {
            family_product: taskData.familyProduct || null,
            equipment_quantity: taskData.equipmentQuantity || 0,
            equipment_list: []
          };

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
          sales_type: taskData.salesType || null,
          ...equipmentData
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Auto-criar opportunity se task tem valor de venda
      if (standardizedTaskData.salesValue && standardizedTaskData.salesValue > 0) {
        try {
          // Importar dinamicamente para evitar circular dependency
          const { useOpportunityManager } = await import('./useOpportunityManager');
          const { ensureOpportunity } = useOpportunityManager();
          
          await ensureOpportunity({
            taskId: task.id,
            clientName: taskData.client || '',
            filial: standardizedTaskData.filial || '',
            salesValue: standardizedTaskData.salesValue,
            salesType: taskData.salesType || 'ganho',
            partialSalesValue: taskData.partialSalesValue || 0,
            salesConfirmed: standardizedTaskData.salesConfirmed || false
          });
          
          console.log('✅ Opportunity criada automaticamente para task:', task.id);
        } catch (opportunityError) {
          console.error('❌ Erro ao criar opportunity automaticamente:', opportunityError);
          // Não falhar a criação da task por causa disso
        }
      }

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

      if (updates.salesConfirmed !== undefined || (updates.salesValue && getSalesValueAsNumber(updates.salesValue) > 0)) {
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
    // Função de força refresh melhorada
    forceRefresh: async () => {
      console.log('🔄 Executando force refresh completo...');
      // Limpar todo o cache
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.consultants });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.filiais });
      
      // Forçar refetch
      const result = await tasksQuery.refetch();
      console.log('✅ Force refresh concluído');
      return result;
    },
    // Função para resetar filtros e cache
    resetAndRefresh: async () => {
      console.log('🔄 Reset completo com filtros...');
      queryClient.clear(); // Limpa TUDO
      const result = await tasksQuery.refetch();
      console.log('✅ Reset completo concluído');
      return result;
    }
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
          .rpc('get_secure_tasks_with_customer_protection')
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

      const taskData = taskResult.data;
      if (!taskData) return null;
      
      // Ensure taskData is an object before spreading
      const taskWithProducts = Object.assign({}, taskData, {
        products: productsResult.data || [],
        reminders: remindersResult.data || []
      });
      
      return mapSupabaseTaskToTask(taskWithProducts);
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
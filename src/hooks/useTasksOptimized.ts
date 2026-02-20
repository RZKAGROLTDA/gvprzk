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
  const { isOnline, getOfflineTasks, saveTaskOffline } = useOffline();
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

  // Query com retry automático e fallback
  const tasksQuery = useQuery({
    queryKey: includeDetails ? [...QUERY_KEYS.tasks, 'with-details'] : QUERY_KEYS.tasks,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Verificar perfil primeiro (sem criar se não existir para evitar loops)
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

        // Timeout de 15 segundos
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
          // Carregar cache de filiais
          await loadFiliaisCache().catch(() => console.log('⚠️ Cache de filiais não carregado'));

          if (!isOnline) {
            console.log('📴 App offline - usando dados locais');
            return getOfflineTasks();
          }

          console.log('🔄 Carregando tasks via função segura...');
          
          // Use enhanced secure function that protects customer data
          let tasksData, error;
          try {
            const result = await supabase
              .rpc('get_secure_tasks_with_customer_protection')
              .abortSignal(controller.signal);
              
            tasksData = result.data;
            error = result.error;
            console.log('✅ Tasks carregadas via função segura:', tasksData?.length || 0);
            console.log('🔍 DEBUG - Primeiras 3 tasks:', tasksData?.slice(0, 3).map((t: any) => ({
              id: t.id?.slice(0, 8),
              client: t.client,
              filial: t.filial,
              access_level: t.access_level
            })));
          } catch (rpcError: any) {
            console.log('⚠️ Função segura falhou, bloqueando acesso direto por segurança');
            
            // Log unauthorized access attempt
            try {
              await supabase.rpc('monitor_unauthorized_customer_access');
            } catch (logError) {
              console.error('Failed to log unauthorized access:', logError);
            }
            
            // Do NOT fall back to direct table access for security
            throw new Error('Access to customer data requires secure function. Direct table access blocked for security.');
          }

          clearTimeout(timeout);
          
          if (error) {
            console.error('❌ Erro ao carregar dados:', error);
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
        
        // Melhor tratamento de erro - tentar cache local primeiro
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
        
        // Circuit breaker melhorado - só retornar vazio em último caso
        console.log('⚠️ Circuit breaker ativado - sem dados disponíveis');
        throw error; // Permitir que React Query tente novamente
      }
    },
    enabled: !!user,
    staleTime: 3 * 60 * 1000, // 3 minutos - OTIMIZAÇÃO: reduzir Disk IO
    refetchOnWindowFocus: false, // OTIMIZAÇÃO: desabilitado para reduzir queries
    refetchOnMount: false, // OTIMIZAÇÃO: usar cache existente
    retry: (failureCount, error) => {
      // Retry mais inteligente
      if (error?.message?.includes('JWT') || error?.message?.includes('unauthorized')) {
        return false; // Não retry em erros de auth
      }
      return failureCount < 3; // Até 3 tentativas para outros erros
    },
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

      // ✅ Suporte a criação OFFLINE
      if (!isOnline) {
        const startDate = standardizedTaskData.startDate ? new Date(standardizedTaskData.startDate) : new Date();
        const endDate = standardizedTaskData.endDate ? new Date(standardizedTaskData.endDate) : startDate;

        const offlineTask: Task = {
          id:
            globalThis.crypto?.randomUUID?.() ||
            `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: taskData.name || getDefaultTaskName(taskData.taskType || 'prospection'),
          responsible: taskData.responsible || user.email || '',
          client: taskData.client || '',
          clientCode: taskData.clientCode || '',
          property: standardizedTaskData.property || '',
          cpf: taskData.cpf,
          email: taskData.email,
          phone: taskData.phone,
          filial: standardizedTaskData.filial || '',
          filialAtendida: taskData.filialAtendida,
          taskType: (standardizedTaskData.taskType as any) || 'prospection',
          checklist: taskData.checklist || [],
          startDate,
          endDate,
          startTime: standardizedTaskData.startTime || '09:00',
          endTime: standardizedTaskData.endTime || '17:00',
          observations: standardizedTaskData.observations || '',
          priority: (standardizedTaskData.priority as any) || 'medium',
          reminders: taskData.reminders || [],
          photos: standardizedTaskData.photos || [],
          documents: standardizedTaskData.documents || [],
          checkInLocation: standardizedTaskData.checkInLocation,
          initialKm: standardizedTaskData.initialKm || 0,
          finalKm: standardizedTaskData.finalKm || 0,
          status: 'pending',
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          isProspect: standardizedTaskData.isProspect || false,
          prospectNotes: standardizedTaskData.prospectNotes,
          prospectNotesJustification: standardizedTaskData.prospectNotesJustification,
          prospectItems: standardizedTaskData.prospectItems,
          salesValue: standardizedTaskData.salesValue,
          salesConfirmed: standardizedTaskData.salesConfirmed,
          salesType: taskData.salesType,
          partialSalesValue: taskData.partialSalesValue,
          familyProduct: taskData.familyProduct,
          equipmentQuantity: taskData.equipmentQuantity,
          propertyHectares: taskData.propertyHectares,
          equipmentList: taskData.equipmentList,
        };

        saveTaskOffline(offlineTask);
        return offlineTask;
      }
      
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
          filial_atendida: taskData.filialAtendida || null,
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

      console.log('✅ Task criada com sucesso:', task.id);
      console.log('📦 Verificando produtos para salvar:', {
        hasChecklist: !!taskData.checklist,
        checklistLength: taskData.checklist?.length || 0,
        checklist: taskData.checklist
      });

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

      // Criar products e reminders com tratamento de erro adequado
      if (taskData.checklist?.length) {
        console.log('🔄 Preparando para salvar produtos:', taskData.checklist.length);
        
        // Categorias válidas permitidas pela constraint do banco
        const validCategories = ['tires', 'lubricants', 'oils', 'greases', 'batteries', 'other'];
        
        const products = taskData.checklist.map(product => {
          // Validar e corrigir categoria se necessário
          const category = validCategories.includes(product.category) 
            ? product.category 
            : 'other';
          
          if (product.category && !validCategories.includes(product.category)) {
            console.warn(`⚠️ Categoria inválida "${product.category}" convertida para "other"`);
          }
          
          return {
            task_id: task.id,
            name: product.name,
            category: category,
            selected: product.selected,
            quantity: product.quantity || 0,
            price: product.price || 0,
            observations: product.observations || '',
            photos: product.photos || []
          };
        });
        
        console.log('📤 Enviando produtos para Supabase:', products);
        const { data: insertedProducts, error: productsError } = await supabase
          .from('products')
          .insert(products)
          .select();
        
        if (productsError) {
          console.error('❌ Erro ao salvar produtos:', productsError);
          console.error('❌ Detalhes completos do erro:', JSON.stringify(productsError, null, 2));
          throw new Error(`Falha ao salvar produtos: ${productsError.message}`);
        }
        console.log('✅ Produtos salvos com sucesso:', insertedProducts?.length || products.length);
        console.log('✅ Dados dos produtos salvos:', insertedProducts);
      } else {
        console.log('⚠️ Nenhum produto na checklist para salvar');
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
        
        const { error: remindersError } = await supabase.from('reminders').insert(reminders);
        if (remindersError) {
          console.error('❌ Erro ao salvar lembretes:', remindersError);
          throw new Error(`Falha ao salvar lembretes: ${remindersError.message}`);
        }
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

// Hook para carregar detalhes completos de uma task específica.
// Usa get_secure_task_by_id (1 linha) em vez de get_secure_tasks_with_customer_protection (500 linhas) para reduzir Disk I/O.
export const useTaskDetails = (taskId: string | null) => {
  return useQuery({
    queryKey: taskId ? QUERY_KEYS.taskDetails(taskId) : ['task-details-empty'],
    queryFn: async () => {
      if (!taskId) return null;

      const [taskResult, productsResult, remindersResult] = await Promise.all([
        supabase.rpc('get_secure_task_by_id', { p_task_id: taskId }),
        supabase.from('products').select('*').eq('task_id', taskId),
        supabase.from('reminders').select('*').eq('task_id', taskId),
      ]);

      if (taskResult.error) throw taskResult.error;

      const taskData = taskResult.data?.[0] ?? null;
      if (!taskData) return null;

      const taskWithProducts = {
        ...taskData,
        products: productsResult.data || [],
        reminders: remindersResult.data || [],
      };
      return mapSupabaseTaskToTask(taskWithProducts);
    },
    enabled: !!taskId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
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
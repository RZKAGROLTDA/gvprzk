import React from 'react';
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
  const { user, session } = useAuth();
  const { isOnline, getOfflineTasks } = useOffline();
  const queryClient = useQueryClient();

  // Estados de debugging para monitoramento em tempo real
  const [debugInfo, setDebugInfo] = React.useState({
    lastAttempt: null as Date | null,
    lastError: null as any,
    functionAttempts: { secure: 0, fallback: 0, direct: 0 },
    sessionStatus: 'unknown'
  });

  // Verificação robusta de sessão
  const verifySessionHealth = async () => {
    console.log('🔍 Verificando saúde da sessão...');
    
    if (!user || !session) {
      setDebugInfo(prev => ({ ...prev, sessionStatus: 'missing' }));
      console.log('❌ Sessão ou usuário ausente');
      return false;
    }

    // Verificar se a sessão ainda é válida
    const now = Date.now() / 1000;
    const expiresAt = session.expires_at || 0;
    
    if (expiresAt <= now) {
      setDebugInfo(prev => ({ ...prev, sessionStatus: 'expired' }));
      console.log('❌ Sessão expirada');
      
      // Tentar refresh automático
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) {
          console.log('✅ Sessão renovada automaticamente');
          setDebugInfo(prev => ({ ...prev, sessionStatus: 'refreshed' }));
          return true;
        }
      } catch (refreshError) {
        console.error('❌ Falha ao renovar sessão:', refreshError);
      }
      return false;
    }

    setDebugInfo(prev => ({ ...prev, sessionStatus: 'valid' }));
    console.log('✅ Sessão válida');
    return true;
  };

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

  // Query com retry automático e fallback otimizado com debugging avançado
  const tasksQuery = useQuery({
    queryKey: includeDetails ? [...QUERY_KEYS.tasks, 'with-details'] : QUERY_KEYS.tasks,
    queryFn: async () => {
      const attemptTimestamp = new Date();
      setDebugInfo(prev => ({ ...prev, lastAttempt: attemptTimestamp }));
      
      console.log('🚀 INÍCIO DA QUERY - Timestamp:', attemptTimestamp.toISOString());
      
      if (!user) {
        const error = new Error('User not authenticated');
        setDebugInfo(prev => ({ ...prev, lastError: error }));
        throw error;
      }

      // 1. Verificar saúde da sessão PRIMEIRO
      const sessionHealthy = await verifySessionHealth();
      if (!sessionHealthy) {
        const error = new Error('Session is not healthy - authentication may be expired');
        setDebugInfo(prev => ({ ...prev, lastError: error }));
        console.log('❌ Sessão não saudável, abortando query');
        return [];
      }

      // 2. Verificar perfil com logging detalhado
      console.log('🔍 Verificando perfil do usuário...');
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, approval_status, role, filial_id, name')
          .eq('user_id', user.id)
          .maybeSingle();

        console.log('📊 Resultado do perfil:', profile);

        if (!profile) {
          console.log('❌ Perfil não encontrado');
          setDebugInfo(prev => ({ ...prev, lastError: 'Profile not found' }));
          return [];
        }

        if (profile.approval_status !== 'approved') {
          console.log('❌ Perfil não aprovado:', profile.approval_status);
          setDebugInfo(prev => ({ ...prev, lastError: 'Profile not approved' }));
          return [];
        }

        console.log('✅ Perfil aprovado:', profile.name, '(', profile.role, ')');
      } catch (error) {
        console.error('❌ Erro crítico ao verificar perfil:', error);
        setDebugInfo(prev => ({ ...prev, lastError: error }));
        return [];
      }

      // Timeout mais curto agora que temos queries otimizadas
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

        console.log('🔄 ETAPA 3: Carregando tasks via múltiplas estratégias...');
        
        // Strategy Pattern - tentar múltiplas abordagens
        let tasksData = null;
        let error = null;
        let strategyUsed = 'none';

        // ESTRATÉGIA OTIMIZADA: Nova função ultra-rápida
        try {
          console.log('⚡ QUERY OTIMIZADA: Função ultra-simplificada');
          setDebugInfo(prev => ({ 
            ...prev, 
            functionAttempts: { ...prev.functionAttempts, secure: prev.functionAttempts.secure + 1 }
          }));
          
          const result = await supabase
            .rpc('get_tasks_optimized')
            .abortSignal(controller.signal);
            
          if (result.error) throw result.error;
          
          tasksData = result.data;
          strategyUsed = 'optimized_function';
          console.log('✅ QUERY OTIMIZADA SUCESSO: Carregamento ultra-rápido:', tasksData?.length || 0);
          
        } catch (optimizedError: any) {
          console.log('❌ QUERY OTIMIZADA FALHOU:', optimizedError.message);
          
          // Fallback para função original apenas se necessário
          console.log('🔄 Fallback para função original...');
          try {
            const fallbackResult = await supabase
              .rpc('get_secure_tasks_with_customer_protection')
              .abortSignal(controller.signal);
              
            if (!fallbackResult.error && fallbackResult.data) {
              console.log('✅ FALLBACK SUCESSO:', fallbackResult.data.length);
              tasksData = fallbackResult.data;
              strategyUsed = 'fallback_original';
            } else {
              throw new Error('Fallback failed');
            }
          } catch (fallbackError) {
            console.log('❌ Fallback também falhou:', fallbackError.message);
            error = new Error(`Todas as estratégias falharam: ${optimizedError.message} | Fallback: ${fallbackError.message}`);
            setDebugInfo(prev => ({ ...prev, lastError: error }));
          }
        }

        console.log('📊 RESULTADO FINAL - Estratégia usada:', strategyUsed, '| Dados obtidos:', !!tasksData);

        clearTimeout(timeout);
        
        if (error) {
          console.error('❌ ERRO FINAL:', error);
          setDebugInfo(prev => ({ ...prev, lastError: error }));
          
          // RECOVERY STRATEGIES
          console.log('🔧 INICIANDO ESTRATÉGIAS DE RECUPERAÇÃO...');
          
          // Recovery 1: Cache local
          const cachedData = queryClient.getQueryData(QUERY_KEYS.tasks);
          if (cachedData) {
            console.log('✅ RECOVERY 1: Usando dados do cache como fallback');
            return cachedData as Task[];
          }
          
          // Recovery 2: Dados offline
          if (!isOnline) {
            console.log('📴 RECOVERY 2: Tentando dados offline');
            const offlineData = getOfflineTasks();
            if (offlineData?.length) {
              console.log('✅ RECOVERY 2: Dados offline encontrados');
              return offlineData;
            }
          }
          
          // Recovery 3: Array vazio com notificação
          console.log('⚠️ RECOVERY 3: Retornando array vazio - todas as estratégias falharam');
          toast({
            title: "⚠️ Problema na Conexão",
            description: "Não foi possível carregar os dados. Verifique sua conexão.",
            variant: "destructive",
          });
          
          return [];
        }

        if (!tasksData?.length) {
          console.log('📝 Nenhum dado retornado pelas funções - array vazio válido');
          return [];
        }

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
    staleTime: 2 * 60 * 1000, // 2 minutos - cache mais duradouro para reduzir chamadas
    refetchOnWindowFocus: false, 
    refetchOnMount: true, 
    retry: 1, // Um retry simples
    retryDelay: 5000, // 5 segundos entre retries
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
    
    // FUNÇÕES DE RECUPERAÇÃO E DIAGNÓSTICO AVANÇADAS
    debugInfo,
    
    // Diagnóstico completo do hook
    diagnose: async () => {
      console.log('🔍 DIAGNÓSTICO COMPLETO DO HOOK');
      console.log('User:', user ? `${user.email} (${user.id})` : 'None');
      console.log('Session:', session ? 'Present' : 'Missing');
      console.log('Online:', isOnline);
      console.log('Debug Info:', debugInfo);
      console.log('Query State:', {
        data: tasksQuery.data?.length || 0,
        loading: tasksQuery.isLoading,
        error: tasksQuery.error?.message,
        isFetching: tasksQuery.isFetching,
        isStale: tasksQuery.isStale
      });
      return debugInfo;
    },
    
    // Force refresh melhorado com logging
    forceRefresh: async () => {
      console.log('🔄 FORCE REFRESH INICIADO');
      setDebugInfo(prev => ({ ...prev, lastAttempt: new Date() }));
      
      // Limpar todo o cache relacionado
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.consultants });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.filiais });
      
      // Verificar sessão antes do refetch
      const sessionHealthy = await verifySessionHealth();
      if (!sessionHealthy) {
        console.log('❌ Sessão não saudável durante force refresh');
        return { data: [], error: 'Session not healthy' };
      }
      
      // Forçar refetch
      const result = await tasksQuery.refetch();
      console.log('✅ FORCE REFRESH CONCLUÍDO:', result.data?.length || 0, 'tasks');
      return result;
    },
    
    // Reset completo do sistema
    resetAndRefresh: async () => {
      console.log('🔄 RESET COMPLETO DO SISTEMA');
      
      // Limpar TUDO
      queryClient.clear();
      setDebugInfo({
        lastAttempt: new Date(),
        lastError: null,
        functionAttempts: { secure: 0, fallback: 0, direct: 0 },
        sessionStatus: 'unknown'
      });
      
      // Verificar e renovar sessão se necessário
      await verifySessionHealth();
      
      const result = await tasksQuery.refetch();
      console.log('✅ RESET COMPLETO CONCLUÍDO:', result.data?.length || 0, 'tasks');
      return result;
    },
    
    // Função de emergency para acesso direto (apenas managers)
    emergencyAccess: async () => {
      console.log('🚨 ACESSO DE EMERGÊNCIA INICIADO');
      
      if (!user) {
        throw new Error('User not authenticated for emergency access');
      }
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();
          
        if (profile?.role !== 'manager') {
          throw new Error('Emergency access requires manager role');
        }
        
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
          
        if (error) throw error;
        
        console.log('✅ ACESSO DE EMERGÊNCIA CONCLUÍDO:', data?.length || 0, 'tasks');
        return data;
      } catch (error) {
        console.error('❌ ACESSO DE EMERGÊNCIA FALHOU:', error);
        throw error;
      }
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
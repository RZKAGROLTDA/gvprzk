
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOffline } from '@/hooks/useOffline';
import { Task, ProductType, Reminder } from '@/types/task';
import { toast } from '@/components/ui/use-toast';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { loadFiliaisCache, createTaskWithFilialSnapshot } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

// Função helper para gerar nome padrão da tarefa
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

export const useTasks = () => {
  const { user } = useAuth();
  const { isOnline, saveTaskOffline, getOfflineTasks } = useOffline();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Cache e debounce para reduzir chamadas desnecessárias - OTIMIZAÇÃO Disk IO
  const lastLoadTime = useRef<number>(0);
  const loadCooldown = 60000; // 60 segundos entre carregamentos - OTIMIZAÇÃO Disk IO
  const lastErrorTime = useRef<Record<string, number>>({});
  const errorCooldown = 10000; // 10 segundos entre toasts de erro similares

  // Função helper para mostrar toast de erro com debounce
  const showDebouncedErrorToast = (key: string, message: string) => {
    const now = Date.now();
    if (!lastErrorTime.current[key] || now - lastErrorTime.current[key] > errorCooldown) {
      lastErrorTime.current[key] = now;
      toast({
        title: "Erro de conexão",
        description: message,
        variant: "destructive",
      });
    }
  };

  const loadTasks = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    
    // Implementar cooldown para evitar carregamentos excessivos
    const now = Date.now();
    if (!forceRefresh && now - lastLoadTime.current < loadCooldown) {
      console.log('🚫 useTasks: Load cooldown active, skipping');
      return;
    }
    lastLoadTime.current = now;
    
    console.log(`🔄 useTasks: Loading tasks... ${forceRefresh ? '(FORCE REFRESH)' : ''}`);
    setLoading(true);
    try {
      // Carregar cache de filiais para resolução de nomes
      await loadFiliaisCache();
      
      if (isOnline) {
        // Carregar do Supabase quando online com query otimizada
        const { data: tasksData, error } = await supabase
          .from('tasks')
          .select(`
            id,
            name,
            responsible,
            client,
            clientcode,
            property,
            email,
            propertyhectares,
            filial,
            task_type,
            start_date,
            end_date,
            start_time,
            end_time,
            observations,
            priority,
            status,
            created_at,
            updated_at,
            created_by,
            is_prospect,
            sales_value,
            sales_confirmed,
            sales_type,
            prospect_notes,
            photos,
            documents,
            check_in_location,
            initial_km,
            final_km
          `)
          .order('created_at', { ascending: false })
          .limit(50); // Reduzir para 50 para melhor performance

        if (error) {
          console.error('❌ useTasks: Error loading tasks from Supabase:', error);
          // Fallback para dados offline
          const offlineTasks = getOfflineTasks();
          setTasks(offlineTasks);
          showDebouncedErrorToast('load_tasks', "Carregando dados offline disponíveis");
          return;
        }

        // Carregar produtos e lembretes apenas se necessário
        let tasksWithRelations = tasksData;
        if (tasksData && tasksData.length > 0) {
          // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários
          const { data: productsData } = await supabase
            .from('products')
            .select('id, task_id, name, category, selected, quantity, price, observations, photos')
            .in('task_id', tasksData.map(t => t.id));

          // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários
          const { data: remindersData } = await supabase
            .from('reminders')
            .select('id, task_id, title, description, date, time, completed')
            .in('task_id', tasksData.map(t => t.id));

          // Associar dados relacionados
          tasksWithRelations = tasksData.map(task => ({
            ...task,
            products: productsData?.filter(p => p.task_id === task.id) || [],
            reminders: remindersData?.filter(r => r.task_id === task.id) || []
          }));
        }

        // Converter dados do Supabase para o formato da aplicação
        const formattedTasks: Task[] = tasksWithRelations?.map(mapSupabaseTaskToTask) || [];

        console.log(`✅ useTasks: Loaded ${formattedTasks.length} tasks from Supabase`);
        setTasks(formattedTasks);
      } else {
        // Carregar dados offline quando desconectado
        const offlineTasks = getOfflineTasks();
        setTasks(offlineTasks);
        
        console.log(`📱 useTasks: Loaded ${offlineTasks.length} tasks from offline cache`);
        
        if (offlineTasks.length > 0 && forceRefresh) {
          toast({
            title: "📱 Modo Offline",
            description: `${offlineTasks.length} tarefas carregadas do cache local`,
          });
        }
      }
    } catch (error: any) {
      console.error('❌ useTasks: Error in loadTasks:', error);
      // Fallback para dados offline em caso de erro
      const offlineTasks = getOfflineTasks();
      setTasks(offlineTasks);
      
      showDebouncedErrorToast('load_error', "Carregando dados offline disponíveis");
    } finally {
      setLoading(false);
    }
  }, [user, isOnline, getOfflineTasks]); // Dependências do useCallback

  // Lock map to prevent duplicate submissions
  const createTaskLocks = new Map<string, boolean>();

  const createTask = async (taskData: Partial<Task>) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para criar tarefas",
        variant: "destructive",
      });
      return null;
    }

    // Create a unique lock key based on task data to prevent duplicates
    const lockKey = `${taskData.client || ''}-${taskData.responsible || ''}-${taskData.startDate?.getTime() || ''}-${taskData.salesValue || 0}`;
    
    // Check if this exact task is already being created
    if (createTaskLocks.get(lockKey)) {
      console.warn('🔒 createTask: Task creation already in progress for:', lockKey);
      toast({
        title: "Aguarde",
        description: "Esta tarefa já está sendo criada, aguarde um momento...",
        variant: "destructive",
      });
      return null;
    }

    // Set lock to prevent duplicate submissions
    createTaskLocks.set(lockKey, true);

    try {
      // Check for recent duplicates in the database
      if (isOnline) {
        const { data: existingTasks } = await supabase
          .from('tasks')
          .select('id, created_at')
          .eq('client', taskData.client || '')
          .eq('responsible', taskData.responsible || '')
          .eq('start_date', taskData.startDate?.toISOString().split('T')[0] || '')
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Last 5 minutes

        if (existingTasks && existingTasks.length > 0) {
          console.warn('🚫 createTask: Duplicate task found, preventing creation');
          toast({
            title: "Tarefa duplicada",
            description: "Uma tarefa similar foi criada recentemente",
            variant: "destructive",
          });
          return null;
        }
      }

      // Create task with unique ID using crypto.randomUUID() if available
      const tempTask: Task = {
        id: crypto.randomUUID ? crypto.randomUUID() : `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: taskData.name || '',
        responsible: taskData.responsible || '',
        client: taskData.client || '',
        property: taskData.property || '',
        filial: taskData.filial || '',
        taskType: taskData.taskType || 'prospection',
        checklist: taskData.checklist || [],
        startDate: taskData.startDate || new Date(),
        endDate: taskData.endDate || new Date(),
        startTime: taskData.startTime || '09:00',
        endTime: taskData.endTime || '17:00',
        observations: taskData.observations || '',
        priority: taskData.priority || 'medium',
        reminders: taskData.reminders || [],
        photos: taskData.photos || [],
        documents: taskData.documents || [],
        checkInLocation: taskData.checkInLocation,
        initialKm: taskData.initialKm || 0,
        finalKm: taskData.finalKm || 0,
        status: 'pending',
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        isProspect: taskData.isProspect || false,
        prospectNotes: taskData.prospectNotes || '',
        prospectItems: [],
        salesValue: taskData.salesValue || 0,
        salesConfirmed: taskData.salesConfirmed
      };

      // Modo offline - salvar localmente
      if (!isOnline) {
        saveTaskOffline(tempTask);
        setTasks(prev => [tempTask, ...prev]);
        return tempTask;
      }

      // Modo online - salvar no Supabase
      // Criar dados padronizados com snapshot de filial
      const standardizedTaskData = await createTaskWithFilialSnapshot(taskData);
      
      // Validação de campos obrigatórios
      const requiredFields = {
        name: standardizedTaskData.name || getDefaultTaskName(standardizedTaskData.taskType || 'prospection'),
        responsible: standardizedTaskData.responsible || user.email || '',
        client: standardizedTaskData.client
      };

      if (!requiredFields.client) {
        throw new Error('Cliente é obrigatório');
      }

      // Tentar salvar online
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          name: requiredFields.name,
          responsible: requiredFields.responsible,
          client: requiredFields.client,
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
          sales_confirmed: standardizedTaskData.salesConfirmed
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
            clientName: standardizedTaskData.client || '',
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

      // Criar produtos (checklist)
      if (taskData.checklist && taskData.checklist.length > 0) {
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

        const { error: productsError } = await supabase
          .from('products')
          .insert(products);

        if (productsError) throw productsError;
      }

      // Criar lembretes
      if (taskData.reminders && taskData.reminders.length > 0) {
        const reminders = taskData.reminders.map(reminder => ({
          task_id: task.id,
          title: reminder.title,
          description: reminder.description || '',
          date: reminder.date.toISOString().split('T')[0],
          time: reminder.time,
          completed: reminder.completed || false
        }));

        const { error: remindersError } = await supabase
          .from('reminders')
          .insert(reminders);

        if (remindersError) throw remindersError;
      }

      toast({
        title: "✅ Tarefa Criada",
        description: "Tarefa salva com sucesso no banco de dados!",
      });

      // OTIMIZAÇÃO: Usar cache otimista ao invés de reload
      setTasks(prev => [mapSupabaseTaskToTask({ ...task, products: [], reminders: [] }), ...prev]);
      
      return task;
    } catch (error: any) {
      console.error('❌ createTask: Erro ao criar tarefa:', error);
      
      // Melhor tratamento de erro com detalhes específicos
      let errorMessage = "Não foi possível criar a tarefa";
      if (error.message?.includes('violates row-level security')) {
        errorMessage = "Erro de permissão. Verifique se está logado corretamente.";
      } else if (error.message?.includes('null value')) {
        errorMessage = "Campos obrigatórios não preenchidos. Verifique os dados.";
      } else if (error.message?.includes('Cliente é obrigatório')) {
        errorMessage = "Cliente é obrigatório para criar a tarefa";
      }
      
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });

      return null;
    } finally {
      // Always release the lock after 2 seconds
      setTimeout(() => {
        createTaskLocks.delete(lockKey);
      }, 2000);
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!user) return;

    console.log('🔄 useTasks: Iniciando updateTask', { taskId, updates });

    try {
      // Automaticamente definir status como "completed" quando há venda confirmada ou perdida
      let finalUpdates = { ...updates };
      if (updates.salesConfirmed === true || updates.salesConfirmed === false) {
        finalUpdates.status = 'completed';
        console.log('🔄 useTasks: Auto-setting status to completed due to salesConfirmed');
      }

      // Garantir que isProspect seja sempre verdadeiro quando há informações de prospect
      if (updates.salesConfirmed !== undefined || (updates.salesValue && getSalesValueAsNumber(updates.salesValue) > 0)) {
        finalUpdates.isProspect = true;
        console.log('🔄 useTasks: Setting isProspect to true');
      }

      console.log('🔄 useTasks: Final updates to be sent:', finalUpdates);

      const { error } = await supabase
        .from('tasks')
        .update({
          ...finalUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) {
        console.error('❌ useTasks: Error updating task:', error);
        throw error;
      }

      console.log('✅ useTasks: Task updated successfully');

      // OTIMIZAÇÃO: Atualizar state local imediatamente (cache otimista)
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, ...finalUpdates } : task
      ));

      console.log('✅ useTasks: Task updated (usando cache otimista)');

      return true;
    } catch (error: any) {
      console.error('❌ useTasks: Error in updateTask:', error);
      throw error;
    }
  };

  // Add loading state to prevent multiple simultaneous loads
  const [isLoading, setIsLoading] = useState(false);
  const hasInitialLoad = useRef(false);

  useEffect(() => {
    if (user && !hasInitialLoad.current && !isLoading) {
      hasInitialLoad.current = true;
      setIsLoading(true);
      loadTasks(true).finally(() => setIsLoading(false));
    }
  }, [user, loadTasks]); // Incluir loadTasks nas dependências

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    loadTasks
  };
};

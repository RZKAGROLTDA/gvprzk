
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOffline } from '@/hooks/useOffline';
import { Task, ProductType, Reminder } from '@/types/task';
import { toast } from '@/components/ui/use-toast';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { loadFiliaisCache, createTaskWithFilialSnapshot } from '@/lib/taskStandardization';

export const useTasks = () => {
  const { user } = useAuth();
  const { isOnline, saveTaskOffline, getOfflineTasks } = useOffline();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Carregar cache de filiais para resolução de nomes
      await loadFiliaisCache();
      
      if (isOnline) {
        console.log('Carregando tarefas do Supabase...');
        
        // Carregar do Supabase quando online
        const { data: tasksData, error } = await supabase
          .from('tasks')
          .select(`
            *,
            products (*),
            reminders (*)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Erro ao carregar tarefas do servidor:', error);
          // Fallback para dados offline
          const offlineTasks = getOfflineTasks();
          setTasks(offlineTasks);
          toast({
            title: "Erro de conexão",
            description: "Carregando dados offline disponíveis",
            variant: "destructive",
          });
          return;
        }

        // Converter dados do Supabase para o formato da aplicação
        const formattedTasks: Task[] = tasksData?.map(mapSupabaseTaskToTask) || [];
        
        console.log('Tarefas carregadas:', formattedTasks.length);
        console.log('Exemplo de tarefa (primeiro item):', formattedTasks[0]);

        setTasks(formattedTasks);
      } else {
        // Carregar dados offline quando desconectado
        const offlineTasks = getOfflineTasks();
        setTasks(offlineTasks);
        
        if (offlineTasks.length > 0) {
          toast({
            title: "📱 Modo Offline",
            description: `${offlineTasks.length} tarefas carregadas do cache local`,
          });
        }
      }
    } catch (error: any) {
      console.error('Erro ao carregar tarefas:', error);
      
      // Fallback para dados offline em caso de erro
      const offlineTasks = getOfflineTasks();
      setTasks(offlineTasks);
      
      toast({
        title: "Erro na conexão",
        description: "Carregando dados offline disponíveis",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (taskData: Partial<Task>) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para criar tarefas",
        variant: "destructive",
      });
      return null;
    }

    // Criar task temporária para modo offline
    const tempTask: Task = {
      id: `temp_${Date.now()}`,
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
      salesConfirmed: taskData.salesConfirmed || false
    };

    if (isOnline) {
      try {
        // Criar dados padronizados com snapshot de filial
        const standardizedTaskData = await createTaskWithFilialSnapshot(taskData);
        
        // Tentar salvar online
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            name: standardizedTaskData.name,
            responsible: standardizedTaskData.responsible,
            client: standardizedTaskData.client,
            property: standardizedTaskData.property || '',
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
            sales_confirmed: standardizedTaskData.salesConfirmed || false
          })
          .select()
          .single();

        if (taskError) throw taskError;

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

        // Recarregar tarefas para atualizar a lista
        setTimeout(() => loadTasks(), 100);
        
        return task;
      } catch (error: any) {
        console.error('Erro ao criar tarefa online, salvando offline:', error);
        
        // Se falhar online, salvar offline
        saveTaskOffline(tempTask);
        setTasks(prev => [tempTask, ...prev]);
        
        return tempTask;
      }
    } else {
      // Modo offline - salvar localmente
      saveTaskOffline(tempTask);
      setTasks(prev => [tempTask, ...prev]);
      
      return tempTask;
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!user) return;

    try {
      console.log('Atualizando tarefa:', taskId, 'com dados:', updates);
      
      // Automaticamente definir status como "completed" quando há venda confirmada ou perdida
      let finalUpdates = { ...updates };
      if (updates.salesConfirmed === true || updates.salesConfirmed === false) {
        finalUpdates.status = 'completed';
      }

      // Garantir que isProspect seja sempre verdadeiro quando há informações de prospect
      if (updates.salesConfirmed !== undefined || (updates.salesValue && updates.salesValue > 0)) {
        finalUpdates.isProspect = true;
      }

      const { error } = await supabase
        .from('tasks')
        .update({
          ...finalUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) {
        console.error('Erro ao atualizar tarefa no Supabase:', error);
        throw error;
      }

      console.log('Tarefa atualizada com sucesso no banco');

      // Atualizar state local imediatamente
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, ...finalUpdates } : task
      ));

      // Recarregar dados do servidor para garantir sincronização
      setTimeout(() => loadTasks(), 500);

      return true;
    } catch (error: any) {
      console.error('Erro ao atualizar tarefa:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (user) {
      loadTasks();
    }
  }, [user, isOnline]); // Recarregar quando status offline mudar

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    loadTasks
  };
};

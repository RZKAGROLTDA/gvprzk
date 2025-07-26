import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Task, ProductType, Reminder } from '@/types/task';
import { toast } from '@/components/ui/use-toast';

export const useTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: tasksData, error } = await supabase
        .from('tasks')
        .select(`
          *,
          products (*),
          reminders (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Converter dados do Supabase para o formato da aplicação
      const formattedTasks: Task[] = tasksData?.map(task => ({
        id: task.id,
        name: task.name,
        responsible: task.responsible,
        client: task.client,
        property: task.property || '',
        filial: task.filial || '',
        taskType: 'prospection',
        checklist: task.products || [],
        startDate: new Date(task.start_date),
        endDate: new Date(task.end_date),
        startTime: task.start_time,
        endTime: task.end_time,
        observations: task.observations || '',
        priority: task.priority as 'low' | 'medium' | 'high',
        reminders: task.reminders || [],
        photos: task.photos || [],
        documents: task.documents || [],
        checkInLocation: task.check_in_location ? {
          lat: task.check_in_location.lat,
          lng: task.check_in_location.lng,
          timestamp: new Date(task.check_in_location.timestamp)
        } : undefined,
        initialKm: task.initial_km || 0,
        finalKm: task.final_km || 0,
        status: task.status as 'pending' | 'in_progress' | 'completed' | 'closed',
        createdBy: task.created_by,
        createdAt: new Date(task.created_at),
        updatedAt: new Date(task.updated_at),
        isProspect: task.is_prospect || false,
        prospectNotes: task.prospect_notes || '',
        prospectItems: [],
        salesValue: task.sales_value ? Number(task.sales_value) : 0,
        salesConfirmed: task.sales_confirmed || false
      })) || [];

      setTasks(formattedTasks);
    } catch (error: any) {
      console.error('Erro ao carregar tarefas:', error);
      toast({
        title: "Erro ao carregar tarefas",
        description: error.message,
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

    try {
      // Criar a tarefa principal
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          name: taskData.name,
          responsible: taskData.responsible,
          client: taskData.client,
          property: taskData.property || '',
          filial: taskData.filial || '',
          start_date: taskData.startDate?.toISOString().split('T')[0],
          end_date: taskData.endDate?.toISOString().split('T')[0],
          start_time: taskData.startTime,
          end_time: taskData.endTime,
          observations: taskData.observations || '',
          priority: taskData.priority,
          photos: taskData.photos || [],
          documents: taskData.documents || [],
          check_in_location: taskData.checkInLocation,
          initial_km: taskData.initialKm || 0,
          final_km: taskData.finalKm || 0,
          created_by: user.id,
          is_prospect: taskData.isProspect || false,
          prospect_notes: taskData.prospectNotes || '',
          sales_value: taskData.salesValue || 0,
          sales_confirmed: taskData.salesConfirmed || false
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

      // Recarregar tarefas
      await loadTasks();
      
      return task;
    } catch (error: any) {
      console.error('Erro ao criar tarefa:', error);
      toast({
        title: "Erro ao criar tarefa",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };

  useEffect(() => {
    if (user) {
      loadTasks();
    }
  }, [user]);

  return {
    tasks,
    loading,
    createTask,
    loadTasks
  };
};
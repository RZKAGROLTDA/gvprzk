import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface OfflineData {
  tasks: any[];
  syncQueue: any[];
  lastSyncTime: Date | null;
}

const STORAGE_KEY = 'visitapp_offline_data';

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  // Detectar mudanças no status de conectividade
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "✅ Conectado",
        description: "Sincronizando dados...",
      });
      syncData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "📱 Modo Offline",
        description: "Dados serão salvos localmente",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carregar dados offline do localStorage
  const loadOfflineData = (): OfflineData => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        return {
          ...data,
          lastSyncTime: data.lastSyncTime ? new Date(data.lastSyncTime) : null
        };
      }
    } catch (error) {
      console.error('Erro ao carregar dados offline:', error);
    }
    
    return {
      tasks: [],
      syncQueue: [],
      lastSyncTime: null
    };
  };

  // Salvar dados offline
  const saveOfflineData = (data: OfflineData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Erro ao salvar dados offline:', error);
      toast({
        title: "Erro de Armazenamento",
        description: "Não foi possível salvar dados localmente",
        variant: "destructive",
      });
    }
  };

  // Adicionar item à fila de sincronização
  const addToSyncQueue = (item: any) => {
    const data = loadOfflineData();
    const syncItem = {
      id: Date.now().toString(),
      data: item,
      action: 'create',
      timestamp: new Date(),
      attempts: 0
    };
    
    data.syncQueue.push(syncItem);
    saveOfflineData(data);
    setPendingSync(data.syncQueue.length);

    if (!isOnline) {
      toast({
        title: "💾 Salvo Offline",
        description: "Será sincronizado quando conectar",
      });
    }
  };

  // Salvar tarefa offline
  const saveTaskOffline = (task: any) => {
    console.log('saveTaskOffline chamado com:', task);
    const data = loadOfflineData();
    console.log('Dados offline atuais:', data);
    
    // Adicionar à lista local
    const newTask = {
      ...task,
      id: task.id || Date.now().toString(),
      offline: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    data.tasks.push(newTask);
    console.log('Nova tarefa adicionada:', newTask);
    console.log('Total de tarefas após adicionar:', data.tasks.length);

    // Salvar primeiro, depois adicionar à fila
    saveOfflineData(data);
    
    // Adicionar à fila de sincronização
    addToSyncQueue(task);
    
    toast({
      title: "✅ Tarefa Salva",
      description: `Tarefa salva ${isOnline ? 'online' : 'offline'}!`,
    });
  };

  // Obter tarefas offline
  const getOfflineTasks = () => {
    const data = loadOfflineData();
    console.log('getOfflineTasks retornando:', data.tasks.length, 'tarefas');
    return data.tasks;
  };

  // Sincronizar dados com o servidor
  const syncData = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    const data = loadOfflineData();

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const item of data.syncQueue) {
        try {
          console.log('Sincronizando item:', item);
          
          if (item.action === 'create' && item.data) {
            // Sincronizar tarefa criada offline
            const taskData = item.data;
            
            // Criar tarefa no Supabase com campos alinhados
            const { data: insertedTask, error: taskError } = await supabase
              .from('tasks')
              .insert([{
                name: taskData.name,
                responsible: taskData.responsible,
                client: taskData.client,
                clientcode: taskData.clientCode || '',
                property: taskData.property || '',
                email: taskData.email || '',
                propertyhectares: taskData.propertyHectares || 0,
                filial: taskData.filial || '',
                task_type: taskData.taskType || 'prospection',
                start_date: taskData.startDate instanceof Date ? 
                  taskData.startDate.toISOString().split('T')[0] : 
                  taskData.startDate,
                end_date: taskData.endDate instanceof Date ? 
                  taskData.endDate.toISOString().split('T')[0] : 
                  taskData.endDate,
                start_time: taskData.startTime,
                end_time: taskData.endTime,
                observations: taskData.observations || '',
                priority: taskData.priority,
                photos: taskData.photos || [],
                documents: taskData.documents || [],
                check_in_location: taskData.checkInLocation,
                initial_km: taskData.initialKm || 0,
                final_km: taskData.finalKm || 0,
                status: taskData.status || 'pending',
                created_by: taskData.createdBy,
                is_prospect: taskData.isProspect || false,
                prospect_notes: taskData.prospectNotes || '',
                sales_value: taskData.salesValue || null,
                sales_confirmed: taskData.salesConfirmed || null
              }])
              .select()
              .single();

            if (taskError) throw taskError;

            // Sincronizar produtos/checklist se existirem
            if (taskData.checklist && taskData.checklist.length > 0) {
              const products = taskData.checklist.map(product => ({
                task_id: insertedTask.id,
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

            // Sincronizar lembretes se existirem
            if (taskData.reminders && taskData.reminders.length > 0) {
              const reminders = taskData.reminders.map(reminder => ({
                task_id: insertedTask.id,
                title: reminder.title,
                description: reminder.description || '',
                date: reminder.date instanceof Date ? 
                  reminder.date.toISOString().split('T')[0] : 
                  reminder.date,
                time: reminder.time,
                completed: reminder.completed || false
              }));

              const { error: remindersError } = await supabase
                .from('reminders')
                .insert(reminders);

              if (remindersError) throw remindersError;
            }

            successCount++;
          }
          
          // Remover item da fila após sucesso
          data.syncQueue = data.syncQueue.filter(queueItem => queueItem.id !== item.id);
          
          // Remover da lista de tarefas offline (evitar duplicação)
          data.tasks = data.tasks.filter(task => task.id !== item.data?.id);
          
        } catch (error) {
          console.error('Erro ao sincronizar item:', error);
          errorCount++;
          
          item.attempts = (item.attempts || 0) + 1;
          
          // Remover após 3 tentativas falhadas
          if (item.attempts >= 3) {
            data.syncQueue = data.syncQueue.filter(queueItem => queueItem.id !== item.id);
            toast({
              title: "Erro na Sincronização",
              description: `Item ${item.data?.name || 'desconhecido'} falhou após 3 tentativas`,
              variant: "destructive",
            });
          }
        }
      }

      data.lastSyncTime = new Date();
      saveOfflineData(data);
      setPendingSync(data.syncQueue.length);

      if (successCount > 0) {
        toast({
          title: "✅ Sincronizado",
          description: `${successCount} ${successCount === 1 ? 'item sincronizado' : 'itens sincronizados'}`,
        });
      }

      if (errorCount > 0 && successCount === 0) {
        toast({
          title: "Erro de Sincronização",
          description: `${errorCount} ${errorCount === 1 ? 'item falhou' : 'itens falharam'}`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Erro na sincronização:', error);
      toast({
        title: "Erro de Sincronização",
        description: "Tentaremos novamente em breve",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Limpar dados offline
  const clearOfflineData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingSync(0);
    toast({
      title: "Dados Limpos",
      description: "Cache offline removido",
    });
  };

  // Verificar pendências na inicialização
  useEffect(() => {
    const data = loadOfflineData();
    setPendingSync(data.syncQueue.length);
    
    // Sincronizar automaticamente se estiver online e houver pendências
    if (isOnline && data.syncQueue.length > 0) {
      syncData();
    }
  }, [isOnline]);

  return {
    isOnline,
    isSyncing,
    pendingSync,
    saveTaskOffline,
    getOfflineTasks,
    syncData,
    clearOfflineData,
    addToSyncQueue,
    loadOfflineData
  };
};
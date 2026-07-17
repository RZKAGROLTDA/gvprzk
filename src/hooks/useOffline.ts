import { useState, useEffect, useRef } from 'react';
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
  
  // Debounce e cache para evitar toasts duplicados
  const lastToastTime = useRef<Record<string, number>>({});
  const toastCooldown = 5000; // 5 segundos entre toasts similares

  // Função helper para mostrar toast com debounce
  const showDebouncedToast = (key: string, toastConfig: any) => {
    const now = Date.now();
    if (!lastToastTime.current[key] || now - lastToastTime.current[key] > toastCooldown) {
      lastToastTime.current[key] = now;
      toast(toastConfig);
    }
  };

  // Detectar mudanças no status de conectividade
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showDebouncedToast('online', {
        title: "✅ Conectado",
        description: "Sincronizando dados...",
      });
      syncData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showDebouncedToast('offline', {
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
        // Validar estrutura dos dados
        return {
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
          syncQueue: Array.isArray(data.syncQueue) ? data.syncQueue : [],
          lastSyncTime: data.lastSyncTime ? new Date(data.lastSyncTime) : null
        };
      }
    } catch (error) {
      console.error('Erro ao carregar dados offline:', error);
      localStorage.removeItem(STORAGE_KEY);
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
    try {
      const data = loadOfflineData();
      console.log('getOfflineTasks retornando:', data.tasks.length, 'tarefas');
      return Array.isArray(data.tasks) ? data.tasks : [];
    } catch (error) {
      console.error('Erro ao carregar tarefas offline:', error);
      return [];
    }
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
            // Sincronizar tarefa criada offline — paridade com useTasksOptimized.createTask
            const taskData = item.data;

            const toDateStr = (v: any) =>
              v instanceof Date ? v.toISOString().split('T')[0] : v;

            // Equipment data (mesmo mapeamento do fluxo online)
            const equipmentData = Array.isArray(taskData.equipmentList) && taskData.equipmentList.length > 0
              ? {
                  family_product: taskData.equipmentList[0]?.familyProduct || null,
                  equipment_quantity: taskData.equipmentList.reduce(
                    (sum: number, eq: any) => sum + (eq.quantity || 0),
                    0
                  ),
                  equipment_list: taskData.equipmentList,
                }
              : {
                  family_product: taskData.familyProduct || null,
                  equipment_quantity: taskData.equipmentQuantity || 0,
                  equipment_list: [],
                };

            const insertPayload: any = {
              name: taskData.name,
              responsible: taskData.responsible,
              client: taskData.client,
              clientcode: taskData.clientCode || '',
              property: taskData.property || '',
              email: taskData.email || '',
              propertyhectares: taskData.propertyHectares || 0,
              filial: taskData.filial || '',
              filial_atendida: taskData.filialAtendida || null,
              task_type: taskData.taskType || 'prospection',
              start_date: toDateStr(taskData.startDate),
              end_date: toDateStr(taskData.endDate),
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
              sales_confirmed: taskData.salesConfirmed || null,
              sales_type: taskData.salesType || null,
              ...equipmentData,
            };

            if (taskData.contactName !== undefined) insertPayload.contact_name = taskData.contactName;
            if (taskData.contactFunction !== undefined) insertPayload.contact_function = taskData.contactFunction;
            if (taskData.technicalCategory !== undefined) insertPayload.technical_category = taskData.technicalCategory;
            if (taskData.technicalFunnelStage !== undefined) insertPayload.technical_funnel_stage = taskData.technicalFunnelStage;
            if (taskData.technicalVisitData !== undefined) insertPayload.technical_visit_data = taskData.technicalVisitData;
            if (taskData.opportunityInterest !== undefined) insertPayload.opportunity_interest = taskData.opportunityInterest;
            if (taskData.opportunityUrgency !== undefined) insertPayload.opportunity_urgency = taskData.opportunityUrgency;
            if (taskData.opportunityImpact !== undefined) insertPayload.opportunity_impact = taskData.opportunityImpact;
            if (taskData.opportunityClosing !== undefined) insertPayload.opportunity_closing = taskData.opportunityClosing;
            if (taskData.salesEstimate !== undefined) insertPayload.sales_estimate = taskData.salesEstimate;
            if (taskData.nextAction !== undefined) insertPayload.next_action = taskData.nextAction;
            if (taskData.nextActionDate !== undefined) {
              insertPayload.next_action_date = toDateStr(taskData.nextActionDate);
            }
            if (taskData.checklistMachine !== undefined) {
              insertPayload.checklist_machine = taskData.checklistMachine;
            }

            const { data: insertedTask, error: taskError } = await supabase
              .from('tasks')
              .insert([insertPayload])
              .select()
              .single();

            if (taskError) throw taskError;

            // Sincronizar produtos/checklist se existirem
            if (taskData.checklist && taskData.checklist.length > 0) {
              const validCategories = ['tires', 'lubricants', 'oils', 'greases', 'batteries', 'other'];
              const products = taskData.checklist.map((product: any) => ({
                task_id: insertedTask.id,
                name: product.name,
                category: validCategories.includes(product.category) ? product.category : 'other',
                selected: product.selected,
                quantity: product.quantity || 0,
                price: product.price || 0,
                observations: product.observations || '',
                photos: product.photos || [],
                response_status: product.responseStatus ?? null,
                response_notes: product.responseNotes ?? '',
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
    try {
      localStorage.removeItem(STORAGE_KEY);
      setPendingSync(0);
      toast({
        title: "✅ Dados Limpos",
        description: "Cache offline removido com sucesso",
      });
    } catch (error) {
      console.error('Erro ao limpar dados offline:', error);
      toast({
        title: "❌ Erro",
        description: "Erro ao limpar dados offline",
        variant: "destructive",
      });
    }
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
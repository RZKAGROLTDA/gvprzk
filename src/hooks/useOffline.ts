import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';

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
    const data = loadOfflineData();
    
    // Adicionar à lista local
    data.tasks.push({
      ...task,
      id: task.id || Date.now().toString(),
      offline: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Adicionar à fila de sincronização
    addToSyncQueue(task);
    
    saveOfflineData(data);
  };

  // Obter tarefas offline
  const getOfflineTasks = () => {
    const data = loadOfflineData();
    return data.tasks;
  };

  // Sincronizar dados com o servidor
  const syncData = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    const data = loadOfflineData();

    try {
      // Simular sincronização (aqui você implementaria a chamada real à API)
      for (const item of data.syncQueue) {
        try {
          // Aqui você faria a chamada real para o servidor
          console.log('Sincronizando item:', item);
          
          // Simular delay de rede
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Remover item da fila após sucesso
          data.syncQueue = data.syncQueue.filter(queueItem => queueItem.id !== item.id);
        } catch (error) {
          console.error('Erro ao sincronizar item:', error);
          item.attempts = (item.attempts || 0) + 1;
          
          // Remover após 3 tentativas falhadas
          if (item.attempts >= 3) {
            data.syncQueue = data.syncQueue.filter(queueItem => queueItem.id !== item.id);
          }
        }
      }

      data.lastSyncTime = new Date();
      saveOfflineData(data);
      setPendingSync(data.syncQueue.length);

      if (data.syncQueue.length === 0) {
        toast({
          title: "✅ Sincronizado",
          description: "Todos os dados foram sincronizados",
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
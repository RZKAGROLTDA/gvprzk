import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

interface EmergencyState {
  isConnected: boolean;
  lastPing: Date | null;
  connectionAttempts: number;
  emergencyMode: boolean;
}

export const useEmergencyData = () => {
  const { user } = useAuth();
  const [state, setState] = useState<EmergencyState>({
    isConnected: false,
    lastPing: null,
    connectionAttempts: 0,
    emergencyMode: false
  });

  // Teste simples de conectividade
  const testConnection = useCallback(async () => {
    if (!user) return false;
    
    try {
      console.log('🏥 Testando conectividade básica...');
      
      // Timeout moderado para permitir conexão
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .abortSignal(controller.signal);
        
      clearTimeout(timeout);
      
      const isConnected = !error && data !== undefined;
      
      setState(prev => ({
        ...prev,
        isConnected,
        lastPing: new Date(),
        connectionAttempts: isConnected ? 0 : prev.connectionAttempts + 1,
        emergencyMode: prev.connectionAttempts >= 3
      }));
      
      if (!isConnected) {
        console.log('❌ Conectividade falhou:', error?.message);
      } else {
        console.log('✅ Conectividade OK');
      }
      
      return isConnected;
    } catch (error) {
      console.log('❌ Erro na conectividade:', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        lastPing: new Date(),
        connectionAttempts: prev.connectionAttempts + 1,
        emergencyMode: prev.connectionAttempts >= 3
      }));
      return false;
    }
  }, [user]);

  // Acesso simplificado de emergência
  const getEmergencyTasks = useCallback(async () => {
    if (!user) return [];
    
    try {
      console.log('🚨 MODO EMERGÊNCIA: Acesso simplificado');
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      // Query ultra-simplificada
      const { data, error } = await supabase
        .from('tasks')
        .select('id, name, responsible, status, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
        .abortSignal(controller.signal);
        
      clearTimeout(timeout);
      
      if (error) throw error;
      
      console.log('✅ Dados de emergência carregados:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('❌ Falha no modo emergência:', error);
      return [];
    }
  }, [user]);

  // Força refresh da conexão
  const forceReconnect = useCallback(async () => {
    setState(prev => ({ ...prev, connectionAttempts: 0, emergencyMode: false }));
    
    toast({
      title: "🔄 Forçando Reconexão",
      description: "Tentando restabelecer conexão...",
    });
    
    const connected = await testConnection();
    
    if (connected) {
      toast({
        title: "✅ Conexão Restaurada",
        description: "Sistema funcionando normalmente",
      });
    } else {
      toast({
        title: "❌ Falha na Reconexão",
        description: "Problema persiste",
        variant: "destructive"
      });
    }
    
    return connected;
  }, [testConnection]);

  return {
    ...state,
    testConnection,
    getEmergencyTasks,
    forceReconnect
  };
};
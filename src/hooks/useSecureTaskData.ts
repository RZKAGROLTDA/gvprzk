import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSecurityMonitor } from './useSecurityMonitor';

interface SecureTaskData {
  id: string;
  name: string;
  responsible: string;
  client: string;
  property: string;
  filial: string;
  email: string;
  phone: string;
  sales_value: number | null;
  is_masked: boolean;
  access_level: 'full' | 'owner' | 'supervisor' | 'limited';
  start_date: string;
  end_date: string;
  status: string;
  priority: string;
  task_type: string;
  observations: string;
  created_at: string;
  created_by: string;
}

export const useSecureTaskData = (taskIds?: string[]) => {
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  return useQuery({
    queryKey: ['secure-task-data', taskIds],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_secure_task_data_enhanced', {
          task_ids: taskIds || null
        });

        if (error) {
          console.error('Secure task data error:', error);
          monitorSuspiciousActivity('task_data_access_error', { error: error.message }, 3);
          // Return empty array as fallback instead of throwing
          return [];
        }

        // Log successful data access for audit
        if (data?.length > 0) {
          const maskedCount = data.filter((task: SecureTaskData) => task.is_masked).length;
          if (maskedCount > 0) {
            console.log(`🔒 Data masking applied to ${maskedCount} tasks for security`);
          }
        }

        return data as SecureTaskData[];
      } catch (error) {
        console.error('Failed to fetch secure task data:', error);
        monitorSuspiciousActivity('task_data_access_failure', { error: String(error) }, 4);
        // Return empty array as fallback instead of throwing
        return [];
      }
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2, // Retry twice on failure
  });
};

export const useSecureUserDirectory = () => {
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  return useQuery({
    queryKey: ['secure-user-directory'],
    queryFn: async () => {
      try {
        // Use the corrected fallback function
        const { data, error } = await supabase.rpc('get_user_directory_with_fallback');

        if (error) {
          console.error('🚨 User directory access error:', error);
          monitorSuspiciousActivity('user_directory_access_error', { error: error.message }, 3);
          
          // Provide more specific error handling
          if (error.message?.includes('ambiguous')) {
            throw new Error('Erro de configuração do banco de dados. Tente novamente em alguns segundos.');
          } else if (error.message?.includes('Access denied')) {
            throw new Error('Acesso negado. Verifique suas permissões.');
          } else {
            throw new Error('Não foi possível carregar os dados dos usuários. Tente novamente.');
          }
        }

        console.log('✅ User directory loaded successfully:', data?.length || 0, 'users');

        // Log email masking for audit
        const maskedEmails = data?.filter((user: any) => user.email?.includes('***')).length || 0;
        if (maskedEmails > 0) {
          console.log(`🔒 Email masking applied to ${maskedEmails} user records for privacy protection`);
        }

        return data || [];
      } catch (error) {
        console.error('🚨 Failed to fetch user directory:', error);
        throw error;
      }
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
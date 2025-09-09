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

export const useSecureTaskData = () => {
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  return useQuery({
    queryKey: ['completely-secure-tasks'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_completely_secure_tasks');

        if (error) {
          console.error('🚨 Ultra-secure task data access error:', error);
          monitorSuspiciousActivity('ultra_secure_task_access_error', { error: error.message }, 4);
          return [];
        }

        // Log secure access with detailed monitoring
        if (data?.length > 0) {
          const protectedCount = data.filter((task: any) => task.is_customer_data_protected).length;
          const totalTasks = data.length;
          
          console.log(`✅ Ultra-secure task data loaded: ${totalTasks} records, ${protectedCount} with customer data protection`);
          
          // Only log if user is authenticated to avoid 500 errors
          try {
            await supabase.rpc('log_customer_contact_access', {
              access_type: 'ultra_secure_access',
              customer_count: totalTasks,
              masked_count: protectedCount
            });
          } catch (logError) {
            console.warn('Failed to log access (user may not be authenticated):', logError);
          }
          
          if (protectedCount > 0) {
            console.log(`🔒 Customer contact information fully protected for ${protectedCount} records`);
          }
        }

        return data as SecureTaskData[];
      } catch (error) {
        console.error('🚨 Failed to fetch ultra-secure task data:', error);
        monitorSuspiciousActivity('ultra_secure_task_access_failure', { error: String(error) }, 5);
        return [];
      }
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1, // Only retry once for security
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
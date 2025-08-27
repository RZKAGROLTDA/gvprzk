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
          // Log security-related errors
          monitorSuspiciousActivity('task_data_access_error', { error: error.message }, 3);
          throw error;
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
        console.error('Error fetching secure task data:', error);
        throw error;
      }
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useSecureUserDirectory = () => {
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  return useQuery({
    queryKey: ['secure-user-directory'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_secure_user_directory');

        if (error) {
          monitorSuspiciousActivity('user_directory_access_error', { error: error.message }, 3);
          throw error;
        }

        // Log email masking for audit
        const maskedEmails = data?.filter((user: any) => user.email === '***@***.***').length || 0;
        if (maskedEmails > 0) {
          console.log(`🔒 Email masking applied to ${maskedEmails} user records for privacy protection`);
        }

        return data;
      } catch (error) {
        console.error('Error fetching secure user directory:', error);
        throw error;
      }
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};
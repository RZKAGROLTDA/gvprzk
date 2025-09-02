import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSecurityMonitor } from './useSecurityMonitor';

interface CustomerAccessAlert {
  alert_type: string;
  severity: string;
  count: number;
  description: string;
  recommendation: string;
}

export const useSecureCustomerMonitoring = () => {
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  const customerAccessAlerts = useQuery({
    queryKey: ['customer-access-alerts'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('check_customer_data_access_alerts');

        if (error) {
          console.error('Failed to check customer access alerts:', error);
          monitorSuspiciousActivity('customer_monitoring_error', { error: error.message }, 3);
          return [];
        }

        return data as CustomerAccessAlert[];
      } catch (error) {
        console.error('Customer monitoring error:', error);
        return [];
      }
    },
    enabled: true,
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const logCustomerDataExport = async (exportType: string, recordCount: number) => {
    try {
      await supabase.rpc('log_customer_contact_access', {
        access_type: exportType,
        customer_count: recordCount,
        masked_count: 0 // Exports typically show unmasked data
      });

      // High-risk activity for bulk exports
      monitorSuspiciousActivity('customer_data_export', {
        export_type: exportType,
        record_count: recordCount
      }, 4);
    } catch (error) {
      console.error('Failed to log customer data export:', error);
    }
  };

  const checkForSuspiciousAccess = (accessPattern: {
    totalAccess: number;
    unmaskedAccess: number;
    timeWindow: string;
  }) => {
    const { totalAccess, unmaskedAccess, timeWindow } = accessPattern;
    
    // Flag suspicious patterns
    if (unmaskedAccess > 50 && timeWindow === '1hour') {
      monitorSuspiciousActivity('excessive_unmasked_access', {
        total_access: totalAccess,
        unmasked_access: unmaskedAccess,
        time_window: timeWindow
      }, 5);
    } else if (totalAccess > 100 && timeWindow === '1hour') {
      monitorSuspiciousActivity('high_volume_customer_access', {
        total_access: totalAccess,
        time_window: timeWindow
      }, 3);
    }
  };

  return {
    customerAccessAlerts,
    logCustomerDataExport,
    checkForSuspiciousAccess,
    isLoading: customerAccessAlerts.isLoading,
    error: customerAccessAlerts.error,
    alerts: customerAccessAlerts.data || []
  };
};
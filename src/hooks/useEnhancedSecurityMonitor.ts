import { useQuery } from '@tanstack/react-query';
import { useSecurityMonitor } from './useSecurityMonitor';
import { useAuth } from './useAuth';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SecurityAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: string;
  dismissed: boolean;
  recommendation: string;
  metadata?: Record<string, any>;
}

export const useEnhancedSecurityMonitor = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeAlerts, setActiveAlerts] = useState<SecurityAlert[]>([]);
  const [alertStats, setAlertStats] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  });

  const { 
    monitorSuspiciousActivity, 
    monitorCustomerDataAccess, 
    monitorBulkDataExport 
  } = useSecurityMonitor();

  // Monitor high-value sales access with enhanced security
  const monitorHighValueAccess = useCallback(async (salesValue: number, context: string) => {
    if (salesValue > 15000) {
      await supabase.rpc('monitor_high_value_sales_access');
      
      monitorSuspiciousActivity('high_value_sales_access', {
        sales_value: salesValue,
        context,
        threshold_exceeded: true
      }, 4);
    }
  }, [monitorSuspiciousActivity]);

  // Monitor data export activities with enhanced tracking
  const monitorSecureExport = useCallback((exportType: string, recordCount: number) => {
    monitorBulkDataExport(exportType, recordCount, true);
    
    if (recordCount > 100) {
      monitorSuspiciousActivity('large_data_export', {
        export_type: exportType,
        record_count: recordCount,
        user_id: user?.id
      }, 4);
    }
  }, [monitorBulkDataExport, monitorSuspiciousActivity, user?.id]);

  // Monitor customer data access patterns
  const monitorCustomerDataPattern = useCallback((accessCount: number, timeWindow: string) => {
    if (accessCount > 50) {
      monitorSuspiciousActivity('excessive_customer_data_access', {
        access_count: accessCount,
        time_window: timeWindow,
        user_id: user?.id
      }, 5);
    }
  }, [monitorSuspiciousActivity, user?.id]);

  // Bulk export monitoring with alerts
  const monitorBulkDataExportWithAlert = useCallback(async (exportType: string, recordCount: number, includesSensitiveData: boolean = false) => {
    monitorBulkDataExport(exportType, recordCount, includesSensitiveData);
    
    if (recordCount > 50 || includesSensitiveData) {
      const alert: SecurityAlert = {
        id: `export-${Date.now()}`,
        type: 'bulk_export',
        severity: recordCount > 200 ? 'CRITICAL' : recordCount > 100 ? 'HIGH' : 'MEDIUM',
        title: 'Large Data Export Detected',
        description: `Export of ${recordCount} records containing ${includesSensitiveData ? 'sensitive' : 'standard'} data`,
        timestamp: new Date().toISOString(),
        dismissed: false,
        recommendation: recordCount > 200 ? 'Immediate review required - potential data breach' : 'Monitor user activity for suspicious patterns',
        metadata: { exportType, recordCount, includesSensitiveData }
      };
      
      setActiveAlerts(prev => [...prev, alert]);
    }
  }, [monitorBulkDataExport]);

  // Customer data access monitoring with alerts
  const monitorCustomerDataAccessWithAlert = useCallback(async (accessType: 'view' | 'edit' | 'export', customerCount: number = 1, sensitiveFields: string[] = []) => {
    monitorCustomerDataAccess(accessType, customerCount, sensitiveFields);
    
    if (customerCount > 20 || sensitiveFields.length > 0) {
      const alert: SecurityAlert = {
        id: `access-${Date.now()}`,
        type: 'customer_access',
        severity: customerCount > 50 ? 'HIGH' : 'MEDIUM',
        title: 'High Volume Customer Data Access',
        description: `Access to ${customerCount} customer records with ${sensitiveFields.length} sensitive fields`,
        timestamp: new Date().toISOString(),
        dismissed: false,
        recommendation: customerCount > 50 ? 'Review user permissions and implement additional access controls' : 'Monitor for data harvesting patterns',
        metadata: { accessType, customerCount, sensitiveFields }
      };
      
      setActiveAlerts(prev => [...prev, alert]);
    }
  }, [monitorCustomerDataAccess]);

  // Dismiss alert
  const dismissAlert = useCallback((alertId: string) => {
    setActiveAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, dismissed: true } : alert
    ));
  }, []);

  // Get critical alerts
  const getCriticalAlerts = useCallback(() => {
    return activeAlerts.filter(alert => alert.severity === 'CRITICAL' && !alert.dismissed);
  }, [activeAlerts]);

  // Get alerts by type
  const getAlertsByType = useCallback((type: string) => {
    return activeAlerts.filter(alert => alert.type === type && !alert.dismissed);
  }, [activeAlerts]);

  // Update alert stats
  useEffect(() => {
    const nonDismissedAlerts = activeAlerts.filter(alert => !alert.dismissed);
    setAlertStats({
      total: nonDismissedAlerts.length,
      critical: nonDismissedAlerts.filter(a => a.severity === 'CRITICAL').length,
      high: nonDismissedAlerts.filter(a => a.severity === 'HIGH').length,
      medium: nonDismissedAlerts.filter(a => a.severity === 'MEDIUM').length,
      low: nonDismissedAlerts.filter(a => a.severity === 'LOW').length
    });
  }, [activeAlerts]);

  // Enhanced session monitoring
  useEffect(() => {
    let activityCount = 0;
    let sessionTimer: NodeJS.Timeout;

    const trackActivity = () => {
      activityCount++;
      
      // Reset counter every hour
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => {
        if (activityCount > 200) {
          monitorSuspiciousActivity('high_activity_session', {
            activity_count: activityCount,
            session_duration: '1_hour'
          }, 3);
        }
        activityCount = 0;
      }, 3600000); // 1 hour
    };

    const events = ['click', 'keydown', 'scroll', 'mousemove'];
    events.forEach(event => {
      document.addEventListener(event, trackActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, trackActivity);
      });
      clearTimeout(sessionTimer);
    };
  }, [monitorSuspiciousActivity]);

  return {
    // Enhanced monitoring functions
    monitorHighValueAccess,
    monitorSecureExport,
    monitorCustomerDataPattern,
    
    // Alert management
    monitorBulkDataExportWithAlert,
    monitorCustomerDataAccessWithAlert,
    activeAlerts: activeAlerts.filter(alert => !alert.dismissed),
    dismissAlert,
    getCriticalAlerts,
    getAlertsByType,
    alertStats
  };
};
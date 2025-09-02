import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSecurityMonitor } from './useSecurityMonitor';
import { toast } from '@/components/ui/use-toast';

interface BulkExportAlert {
  type: 'bulk_export';
  severity: 'HIGH' | 'CRITICAL';
  description: string;
  recordCount: number;
  includesSensitiveData: boolean;
  timestamp: string;
}

interface RateLimitAlert {
  type: 'rate_limit_exceeded';
  severity: 'MEDIUM' | 'HIGH';
  description: string;
  operationType: string;
  timestamp: string;
}

interface SecurityAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  recommendation: string;
  timestamp: string;
}

export const useEnhancedSecurityMonitor = () => {
  const { 
    monitorBulkDataExport, 
    monitorSuspiciousActivity,
    monitorCustomerDataAccess,
    logSecurityEvent
  } = useSecurityMonitor();
  
  const [activeAlerts, setActiveAlerts] = useState<SecurityAlert[]>([]);
  const [bulkExportThreshold, setBulkExportThreshold] = useState(50);
  const [rateLimitThreshold, setRateLimitThreshold] = useState(100);

  // Enhanced bulk data export monitoring with alerts
  const monitorBulkDataExportWithAlert = useCallback(async (
    exportType: string,
    recordCount: number,
    includesSensitiveData: boolean = false
  ) => {
    // Log the export
    monitorBulkDataExport(exportType, recordCount, includesSensitiveData);
    
    // Check if this triggers an alert
    if (recordCount > bulkExportThreshold || includesSensitiveData) {
      const severity = includesSensitiveData || recordCount > 100 ? 'CRITICAL' : 'HIGH';
      
      const alert: SecurityAlert = {
        id: `bulk_export_${Date.now()}`,
        type: 'bulk_export',
        severity,
        title: 'Bulk Data Export Detected',
        description: `Large data export detected: ${recordCount} records exported${includesSensitiveData ? ' (includes sensitive data)' : ''}`,
        recommendation: includesSensitiveData 
          ? 'Immediately investigate this sensitive data export. Verify user authorization and business justification.'
          : 'Review data export justification and ensure compliance with data protection policies.',
        timestamp: new Date().toISOString()
      };
      
      setActiveAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts
      
      // Show toast notification for critical alerts
      if (severity === 'CRITICAL') {
        toast({
          title: "⚠️ Critical Security Alert",
          description: alert.description,
          variant: "destructive",
        });
      }
    }
  }, [monitorBulkDataExport, bulkExportThreshold]);

  // Enhanced customer data access monitoring
  const monitorCustomerDataAccessWithAlert = useCallback(async (
    accessType: 'view' | 'edit' | 'export',
    customerCount: number = 1,
    sensitiveFields: string[] = []
  ) => {
    monitorCustomerDataAccess(accessType, customerCount, sensitiveFields);
    
    // Alert for high-volume customer data access
    if (customerCount > 20 && accessType === 'view') {
      const alert: SecurityAlert = {
        id: `customer_access_${Date.now()}`,
        type: 'high_volume_customer_access',
        severity: 'MEDIUM',
        title: 'High Volume Customer Data Access',
        description: `User accessed ${customerCount} customer records in a single operation`,
        recommendation: 'Monitor for potential data harvesting. Verify legitimate business purpose.',
        timestamp: new Date().toISOString()
      };
      
      setActiveAlerts(prev => [alert, ...prev.slice(0, 9)]);
    }
  }, [monitorCustomerDataAccess]);

  // Rate limit monitoring with enhanced alerting
  const checkRateLimitWithAlert = useCallback(async (
    operationType: string,
    currentCount: number
  ) => {
    if (currentCount > rateLimitThreshold) {
      logSecurityEvent({
        type: 'suspicious_activity',
        riskLevel: 4,
        metadata: {
          activity_type: 'rate_limit_exceeded',
          operation_type: operationType,
          current_count: currentCount,
          threshold: rateLimitThreshold
        }
      });

      const alert: SecurityAlert = {
        id: `rate_limit_${Date.now()}`,
        type: 'rate_limit_exceeded',
        severity: 'HIGH',
        title: 'Rate Limit Exceeded',
        description: `User exceeded rate limit for ${operationType}: ${currentCount} operations`,
        recommendation: 'Investigate potential automated/bot activity. Consider temporary access restriction.',
        timestamp: new Date().toISOString()
      };
      
      setActiveAlerts(prev => [alert, ...prev.slice(0, 9)]);
      
      toast({
        title: "🚨 Rate Limit Alert",
        description: alert.description,
        variant: "destructive",
      });
      
      return false; // Block operation
    }
    return true; // Allow operation
  }, [logSecurityEvent, rateLimitThreshold]);

  // Monitor for suspicious patterns in real-time
  const monitorSuspiciousPatterns = useCallback(async () => {
    try {
      const { data: recentLogs, error } = await supabase
        .from('security_audit_log')
        .select('*')
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()) // Last 15 minutes
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .order('created_at', { ascending: false });

      if (error) return;

      // Check for rapid successive high-risk activities
      const highRiskEvents = recentLogs?.filter(log => log.risk_score >= 3) || [];
      
      if (highRiskEvents.length > 5) {
        const alert: SecurityAlert = {
          id: `suspicious_pattern_${Date.now()}`,
          type: 'suspicious_activity_pattern',
          severity: 'CRITICAL',
          title: 'Suspicious Activity Pattern Detected',
          description: `Multiple high-risk activities detected in short timeframe: ${highRiskEvents.length} events`,
          recommendation: 'Immediately investigate user account for potential compromise or misuse.',
          timestamp: new Date().toISOString()
        };
        
        setActiveAlerts(prev => [alert, ...prev.slice(0, 9)]);
        
        toast({
          title: "🔴 Critical Security Pattern Alert",
          description: alert.description,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error monitoring suspicious patterns:', error);
    }
  }, []);

  // Periodic monitoring
  useEffect(() => {
    const interval = setInterval(monitorSuspiciousPatterns, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [monitorSuspiciousPatterns]);

  // Clear old alerts
  useEffect(() => {
    const cleanup = setInterval(() => {
      setActiveAlerts(prev => 
        prev.filter(alert => 
          Date.now() - new Date(alert.timestamp).getTime() < 24 * 60 * 60 * 1000 // Keep for 24 hours
        )
      );
    }, 60 * 60 * 1000); // Every hour
    
    return () => clearInterval(cleanup);
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setActiveAlerts(prev => prev.filter(alert => alert.id !== alertId));
  }, []);

  const getAlertsByType = useCallback((type: string) => {
    return activeAlerts.filter(alert => alert.type === type);
  }, [activeAlerts]);

  const getCriticalAlerts = useCallback(() => {
    return activeAlerts.filter(alert => alert.severity === 'CRITICAL');
  }, [activeAlerts]);

  return {
    // Enhanced monitoring functions
    monitorBulkDataExportWithAlert,
    monitorCustomerDataAccessWithAlert,
    checkRateLimitWithAlert,
    monitorSuspiciousPatterns,
    
    // Alert management
    activeAlerts,
    dismissAlert,
    getAlertsByType,
    getCriticalAlerts,
    
    // Configuration
    bulkExportThreshold,
    setBulkExportThreshold,
    rateLimitThreshold,
    setRateLimitThreshold,
    
    // Statistics
    alertStats: {
      total: activeAlerts.length,
      critical: activeAlerts.filter(a => a.severity === 'CRITICAL').length,
      high: activeAlerts.filter(a => a.severity === 'HIGH').length,
      medium: activeAlerts.filter(a => a.severity === 'MEDIUM').length,
      low: activeAlerts.filter(a => a.severity === 'LOW').length
    }
  };
};
import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SecurityEvent {
  type: 'login_attempt' | 'failed_login' | 'password_reset' | 'suspicious_activity' | 'privilege_escalation' | 'data_access_violation' | 'high_risk_activity' | 'customer_data_access' | 'bulk_data_export' | 'sensitive_field_access';
  metadata?: Record<string, any>;
  riskLevel?: number;
}

export const useSecurityMonitor = () => {
  const { user } = useAuth();

  const checkRateLimit = useCallback(async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_login_rate_limit', {
        user_email: email
      });
      
      if (error) {
        console.error('Rate limit check failed:', error);
        return true; // Allow on error to prevent blocking legitimate users
      }
      
      return data;
    } catch (error) {
      console.error('Rate limit check error:', error);
      return true;
    }
  }, []);

  const logSecurityEvent = useCallback(async (event: SecurityEvent) => {
    try {
      // Get basic request info (without exposing sensitive data)
      const userAgent = navigator.userAgent;
      const timestamp = new Date().toISOString();
      
      // Use the new secure logging function with proper parameter names
      const { error } = await supabase.rpc('secure_log_security_event', {
        event_type_param: event.type,
        user_id_param: user?.id,
        metadata_param: {
          ...event.metadata,
          user_agent: userAgent,
          timestamp,
          screen_resolution: `${screen.width}x${screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        risk_score_param: event.riskLevel || 1
      });

      if (error) {
        console.error('Security logging error:', error);
      }
    } catch (error) {
      // Silently fail - don't break functionality for logging
      console.error('Security logging failed:', error);
    }
  }, [user?.id]);

  const monitorLoginAttempt = useCallback(async (email: string, success: boolean, ipAddress?: string) => {
    // Check for suspicious login patterns
    if (ipAddress) {
      try {
        await supabase.rpc('check_suspicious_login_pattern', {
          user_email: email.toLowerCase(),
          ip_addr: ipAddress
        });
      } catch (error) {
        console.error('Suspicious login pattern check failed:', error);
      }
    }
    
    logSecurityEvent({
      type: success ? 'login_attempt' : 'failed_login',
      metadata: {
        email: email.toLowerCase(),
        success,
        ip_address: ipAddress
      }
    });
  }, [logSecurityEvent]);

  const monitorPasswordReset = useCallback((email: string) => {
    logSecurityEvent({
      type: 'password_reset',
      metadata: {
        email: email.toLowerCase()
      }
    });
  }, [logSecurityEvent]);

  const monitorSuspiciousActivity = useCallback((activityType: string, details: Record<string, any>, riskLevel = 2) => {
    logSecurityEvent({
      type: 'suspicious_activity',
      riskLevel,
      metadata: {
        activity_type: activityType,
        ...details
      }
    });
  }, [logSecurityEvent]);

  const monitorPrivilegeEscalation = useCallback((attemptType: string, targetRole: string) => {
    logSecurityEvent({
      type: 'privilege_escalation',
      riskLevel: 5,
      metadata: {
        attempt_type: attemptType,
        target_role: targetRole,
        current_user_id: user?.id
      }
    });
  }, [logSecurityEvent, user?.id]);

  const monitorDataAccessViolation = useCallback((resource: string, attemptedAction: string) => {
    logSecurityEvent({
      type: 'data_access_violation',
      riskLevel: 4,
      metadata: {
        resource,
        attempted_action: attemptedAction,
        current_user_id: user?.id
      }
    });
  }, [logSecurityEvent, user?.id]);

  const monitorCustomerDataAccess = useCallback((accessType: 'view' | 'edit' | 'export', customerCount: number = 1, sensitiveFields: string[] = []) => {
    const riskLevel = accessType === 'export' ? 4 : sensitiveFields.length > 0 ? 3 : 2;
    
    logSecurityEvent({
      type: 'customer_data_access',
      riskLevel,
      metadata: {
        access_type: accessType,
        customer_count: customerCount,
        sensitive_fields: sensitiveFields,
        timestamp: new Date().toISOString(),
        current_user_id: user?.id
      }
    });
  }, [logSecurityEvent, user?.id]);

  const monitorBulkDataExport = useCallback((exportType: string, recordCount: number, includesSensitiveData: boolean = false) => {
    logSecurityEvent({
      type: 'bulk_data_export',
      riskLevel: includesSensitiveData ? 5 : 3,
      metadata: {
        export_type: exportType,
        record_count: recordCount,
        includes_sensitive_data: includesSensitiveData,
        timestamp: new Date().toISOString(),
        current_user_id: user?.id
      }
    });
  }, [logSecurityEvent, user?.id]);

  const monitorSensitiveFieldAccess = useCallback((fieldType: 'email' | 'phone' | 'sales_value' | 'customer_name', accessContext: string) => {
    logSecurityEvent({
      type: 'sensitive_field_access',
      riskLevel: 3,
      metadata: {
        field_type: fieldType,
        access_context: accessContext,
        timestamp: new Date().toISOString(),
        current_user_id: user?.id
      }
    });
  }, [logSecurityEvent, user?.id]);

  // Monitor for suspicious patterns
  useEffect(() => {
    let rapidClickCount = 0;
    let rapidClickTimer: NodeJS.Timeout;

    const handleClick = () => {
      rapidClickCount++;
      
      if (rapidClickCount > 20) { // More than 20 clicks in 5 seconds
        monitorSuspiciousActivity('rapid_clicking', {
          click_count: rapidClickCount,
          duration: '5_seconds'
        }, 3);
        rapidClickCount = 0;
      }

      clearTimeout(rapidClickTimer);
      rapidClickTimer = setTimeout(() => {
        rapidClickCount = 0;
      }, 5000);
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
      clearTimeout(rapidClickTimer);
    };
  }, [monitorSuspiciousActivity]);

  return {
    logSecurityEvent,
    monitorLoginAttempt,
    monitorPasswordReset,
    monitorSuspiciousActivity,
    monitorPrivilegeEscalation,
    monitorDataAccessViolation,
    monitorCustomerDataAccess,
    monitorBulkDataExport,
    monitorSensitiveFieldAccess,
    checkRateLimit
  };
};
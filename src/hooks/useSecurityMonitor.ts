import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SecurityEvent {
  type: 'login_attempt' | 'failed_login' | 'password_reset' | 'suspicious_activity' | 'privilege_escalation' | 'data_access_violation' | 'high_risk_activity';
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
      
      // Log to our security audit table
      if (event.riskLevel && event.riskLevel > 3) {
        await supabase.rpc('log_high_risk_activity', {
          activity_type: event.type,
          risk_level: event.riskLevel,
          additional_data: {
            ...event.metadata,
            user_agent: userAgent,
            timestamp,
            screen_resolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        });
      } else {
        await supabase.rpc('log_security_event', {
          event_type: event.type,
          metadata: {
            ...event.metadata,
            user_agent: userAgent,
            timestamp,
            screen_resolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        });
      }
    } catch (error) {
      // Silently fail - don't break functionality for logging
      console.error('Security logging failed:', error);
    }
  }, []);

  const monitorLoginAttempt = useCallback((email: string, success: boolean) => {
    logSecurityEvent({
      type: success ? 'login_attempt' : 'failed_login',
      metadata: {
        email: email.toLowerCase(),
        success
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
    checkRateLimit
  };
};
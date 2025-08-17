import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SecurityEvent {
  type: 'login_attempt' | 'failed_login' | 'password_reset' | 'suspicious_activity';
  metadata?: Record<string, any>;
}

export const useSecurityMonitor = () => {
  const { user } = useAuth();

  const logSecurityEvent = useCallback(async (event: SecurityEvent) => {
    try {
      // Get basic request info (without exposing sensitive data)
      const userAgent = navigator.userAgent;
      const timestamp = new Date().toISOString();
      
      // Log to our security audit table
      await supabase.rpc('log_security_event', {
        event_type: event.type,
        metadata: {
          ...event.metadata,
          user_agent: userAgent,
          timestamp,
          // Add other non-sensitive context
          screen_resolution: `${screen.width}x${screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      });
    } catch (error) {
      // Silently fail - don't break functionality for logging
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

  const monitorSuspiciousActivity = useCallback((activityType: string, details: Record<string, any>) => {
    logSecurityEvent({
      type: 'suspicious_activity',
      metadata: {
        activity_type: activityType,
        ...details
      }
    });
  }, [logSecurityEvent]);

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
        });
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
    monitorSuspiciousActivity
  };
};
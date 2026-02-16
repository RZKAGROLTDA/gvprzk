import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSecurityMonitor } from '@/hooks/useSecurityMonitor';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_TIME = 5 * 60 * 1000; // 5 minutes before timeout

export const useSessionSecurity = () => {
  const { user, signOut } = useAuth();
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  const checkSessionHealth = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.warn('Session check failed:', error);
        monitorSuspiciousActivity('session_validation_failed', {
          error: error?.message || 'No session found',
          timestamp: new Date().toISOString()
        }, 3);
        await signOut();
        return false;
      }
      
      // Enhanced session validation
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const timeToExpiry = expiresAt.getTime() - now.getTime();
      
      // Check for concurrent session detection
      const sessionId = session.access_token.split('.')[2]; // Simple session fingerprint
      const storedSessionId = localStorage.getItem('session_fingerprint');
      
      if (storedSessionId && storedSessionId !== sessionId) {
        monitorSuspiciousActivity('concurrent_session_detected', {
          current_session: sessionId.substring(0, 8),
          stored_session: storedSessionId.substring(0, 8),
          timestamp: new Date().toISOString()
        }, 4);
        
        // Log the concurrent session activity
        try {
          console.warn('[Security] Concurrent session detected');
        } catch (logError) {
          console.warn('Failed to log concurrent session:', logError);
        }
      } else {
        localStorage.setItem('session_fingerprint', sessionId);
      }
      
      if (timeToExpiry < WARNING_TIME) {
        // Attempt to refresh session
        const { error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.warn('Session refresh failed:', refreshError);
          monitorSuspiciousActivity('session_refresh_failed', {
            error: refreshError.message,
            time_to_expiry: timeToExpiry
          }, 3);
          await signOut();
          return false;
        }
        
        // Log successful refresh
        try {
          console.log('[Security] Session refreshed, time to expiry:', timeToExpiry);
        } catch (logError) {
          console.warn('Failed to log session refresh:', logError);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Session health check failed:', error);
      monitorSuspiciousActivity('session_health_check_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 3);
      await signOut();
      return false;
    }
  }, [signOut, monitorSuspiciousActivity]);

  const handleInactivityTimeout = useCallback(async () => {
    monitorSuspiciousActivity('session_timeout', {
      reason: 'inactivity',
      duration: SESSION_TIMEOUT,
      forced_logout: true
    }, 3);
    
    // Enhanced session invalidation logging
    try {
      console.warn('[Security] Forced logout due to inactivity');
    } catch (error) {
      console.warn('Failed to log session activity:', error);
    }
    
    await signOut();
  }, [signOut, monitorSuspiciousActivity]);

  const resetInactivityTimer = useCallback(() => {
    // Clear existing timer
    if (typeof window !== 'undefined') {
      clearTimeout(window.sessionTimeoutId);
      
      // Set new timer
      window.sessionTimeoutId = setTimeout(handleInactivityTimeout, SESSION_TIMEOUT);
    }
  }, [handleInactivityTimeout]);

  // Monitor user activity
  useEffect(() => {
    if (!user) return;

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Initial timer setup
    resetInactivityTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      
      if (typeof window !== 'undefined') {
        clearTimeout(window.sessionTimeoutId);
      }
    };
  }, [user, resetInactivityTimer]);

  // Periodic session health checks
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(checkSessionHealth, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(interval);
  }, [user, checkSessionHealth]);

  // Monitor for concurrent sessions (simplified detection)
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check session when tab becomes visible
        setTimeout(checkSessionHealth, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, checkSessionHealth]);

  return {
    checkSessionHealth,
    resetInactivityTimer
  };
};

// Extend window type for TypeScript
declare global {
  interface Window {
    sessionTimeoutId: NodeJS.Timeout;
  }
}
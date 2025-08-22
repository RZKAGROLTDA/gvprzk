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
        await signOut();
        return false;
      }
      
      // Check if session is close to expiry
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const timeToExpiry = expiresAt.getTime() - now.getTime();
      
      if (timeToExpiry < WARNING_TIME) {
        // Attempt to refresh session
        const { error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.warn('Session refresh failed:', refreshError);
          await signOut();
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Session health check failed:', error);
      await signOut();
      return false;
    }
  }, [signOut]);

  const handleInactivityTimeout = useCallback(async () => {
    monitorSuspiciousActivity('session_timeout', {
      reason: 'inactivity',
      duration: SESSION_TIMEOUT
    }, 2);
    
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
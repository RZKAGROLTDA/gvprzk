import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSecurityMonitor } from '@/hooks/useSecurityMonitor';
import { useInputSecurity } from '@/hooks/useInputSecurity';

export const useEnhancedSecurity = () => {
  const { user } = useAuth();
  const { monitorSuspiciousActivity } = useSecurityMonitor();
  const { sanitizeTaskInput, detectMaliciousInput } = useInputSecurity();

  // Enhanced role change monitoring
  const monitorRoleChange = useCallback(async (targetUserId: string, newRole: string) => {
    try {
      const { data, error } = await supabase.rpc('update_user_role_secure', {
        target_user_id: targetUserId,
        new_role: newRole
      });

      if (error) {
        monitorSuspiciousActivity('role_change_failed', {
          target_user: targetUserId,
          attempted_role: newRole,
          error: error.message
        }, 4);
        throw error;
      }

      // Check if session invalidation was triggered
      if (data?.session_invalidated) {
        // Force the target user to sign out by broadcasting an event
        // This would require a real-time channel setup in production
        console.warn('Target user session should be invalidated');
      }

      return data;
    } catch (error) {
      console.error('Role change monitoring failed:', error);
      throw error;
    }
  }, [monitorSuspiciousActivity]);

  // Enhanced input validation for task creation
  const validateTaskInput = useCallback(async (taskData: any) => {
    try {
      // Client-side validation first
      const sanitizedData = sanitizeTaskInput(taskData);
      
      // Check for malicious content
      const hasmaliciousContent = Object.values(taskData).some(value => 
        typeof value === 'string' && detectMaliciousInput(value)
      );

      if (hasmaliciousContent) {
        monitorSuspiciousActivity('malicious_task_input', {
          fields: Object.keys(taskData),
          timestamp: new Date().toISOString()
        }, 4);
        throw new Error('Input contém conteúdo suspeito');
      }

      // Server-side validation
      const { data, error } = await supabase.rpc('validate_task_input', {
        input_data: sanitizedData
      });

      if (error || !data) {
        monitorSuspiciousActivity('server_input_validation_failed', {
          error: error?.message || 'Validation failed',
          timestamp: new Date().toISOString()
        }, 3);
        throw new Error('Validação de entrada falhou');
      }

      return sanitizedData;
    } catch (error) {
      console.error('Task input validation failed:', error);
      throw error;
    }
  }, [sanitizeTaskInput, detectMaliciousInput, monitorSuspiciousActivity]);

  // Monitor for suspicious session activity
  const monitorSessionActivity = useCallback((activityType: string, details: any = {}) => {
    if (!user) return;

    // Log session activity to server
    supabase.rpc('log_session_activity', {
      activity_type: activityType,
      details: {
        ...details,
        user_id: user.id,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
      }
    }).then(({ error }) => {
      if (error) {
        console.warn('Failed to log session activity:', error);
      }
    });

    // Log locally for monitoring
    monitorSuspiciousActivity(`session_${activityType}`, details, 
      ['concurrent_session', 'suspicious_activity'].includes(activityType) ? 4 : 2
    );
  }, [user, monitorSuspiciousActivity]);

  // Enhanced password validation
  const validatePasswordStrength = useCallback((password: string) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      noCommon: !['password', '123456', 'qwerty', 'admin'].includes(password.toLowerCase()),
      noUserData: true // This would check against user's name/email in real implementation
    };

    const score = Object.values(checks).filter(Boolean).length;
    const strength = score < 4 ? 'weak' : score < 6 ? 'medium' : 'strong';

    if (strength === 'weak') {
      monitorSuspiciousActivity('weak_password_attempt', {
        score,
        checks: Object.entries(checks).filter(([, passed]) => !passed).map(([check]) => check)
      }, 2);
    }

    return { strength, score, checks };
  }, [monitorSuspiciousActivity]);

  // Monitor for rapid form submissions (potential bot activity)
  useEffect(() => {
    let formSubmissionTimes: number[] = [];

    const handleFormSubmit = () => {
      const now = Date.now();
      formSubmissionTimes.push(now);
      
      // Keep only submissions from last minute
      formSubmissionTimes = formSubmissionTimes.filter(time => now - time < 60000);
      
      // If more than 5 submissions in a minute, flag as suspicious
      if (formSubmissionTimes.length > 5) {
        monitorSuspiciousActivity('rapid_form_submission', {
          submission_count: formSubmissionTimes.length,
          time_window: '1_minute'
        }, 3);
      }
    };

    // Add event listeners to all forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      form.addEventListener('submit', handleFormSubmit);
    });

    return () => {
      forms.forEach(form => {
        form.removeEventListener('submit', handleFormSubmit);
      });
    };
  }, [monitorSuspiciousActivity]);

  return {
    monitorRoleChange,
    validateTaskInput,
    monitorSessionActivity,
    validatePasswordStrength
  };
};

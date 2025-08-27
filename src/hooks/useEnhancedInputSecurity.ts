import { useMemo, useCallback } from 'react';
import { useInputSecurity } from './useInputSecurity';
import { useSecurityMonitor } from './useSecurityMonitor';

/**
 * Enhanced input security hook that combines client-side validation
 * with security monitoring and server-side validation preparation
 */
export const useEnhancedInputSecurity = () => {
  const { sanitizeTaskInput, detectMaliciousInput, sanitizeText } = useInputSecurity();
  const { monitorSuspiciousActivity } = useSecurityMonitor();

  const validateAndSanitizeForServer = useCallback(async (data: Record<string, any>) => {
    // Client-side pre-validation
    const sanitizedData: Record<string, any> = {};
    let hasViolations = false;

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Check for malicious patterns
        if (detectMaliciousInput(value)) {
          hasViolations = true;
          monitorSuspiciousActivity(
            'client_side_malicious_input',
            { 
              field: key, 
              pattern: 'multiple_suspicious_patterns',
              sample: value.substring(0, 50)
            },
            4
          );
          sanitizedData[key] = '[CONTENT BLOCKED - SECURITY VIOLATION]';
        } else {
          sanitizedData[key] = sanitizeText(value, { maxLength: 5000 });
        }
      } else {
        sanitizedData[key] = value;
      }
    }

    // Log if any violations were detected
    if (hasViolations) {
      console.warn('🚨 Security violations detected and blocked in form submission');
    }

    return sanitizedData;
  }, [detectMaliciousInput, sanitizeText, monitorSuspiciousActivity]);

  const secureFormSubmit = useCallback(async (
    data: Record<string, any>,
    submitFunction: (sanitizedData: Record<string, any>) => Promise<any>
  ) => {
    try {
      // Pre-sanitize on client
      const sanitizedData = await validateAndSanitizeForServer(data);
      
      // Submit to server (which will apply additional server-side validation)
      return await submitFunction(sanitizedData);
    } catch (error) {
      monitorSuspiciousActivity(
        'form_submission_error',
        { error: error instanceof Error ? error.message : 'Unknown error' },
        3
      );
      throw error;
    }
  }, [validateAndSanitizeForServer, monitorSuspiciousActivity]);

  const validateFileUpload = useCallback((file: File) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      monitorSuspiciousActivity(
        'invalid_file_type_upload',
        { fileName: file.name, fileType: file.type },
        3
      );
      throw new Error('Tipo de arquivo não permitido por questões de segurança');
    }

    if (file.size > maxSize) {
      monitorSuspiciousActivity(
        'oversized_file_upload',
        { fileName: file.name, fileSize: file.size },
        2
      );
      throw new Error('Arquivo muito grande. Máximo permitido: 10MB');
    }

    return true;
  }, [monitorSuspiciousActivity]);

  return {
    sanitizeTaskInput,
    detectMaliciousInput,
    sanitizeText,
    validateAndSanitizeForServer,
    secureFormSubmit,
    validateFileUpload
  };
};
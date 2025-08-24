import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface SecurityConfig {
  allowHtml?: boolean;
  maxLength?: number;
  allowedTags?: string[];
}

export const useInputSecurity = () => {
  const sanitizeText = useMemo(() => {
    return (input: string, config: SecurityConfig = {}): string => {
      const {
        allowHtml = false,
        maxLength = 1000,
        allowedTags = []
      } = config;

      // First, truncate if too long
      let sanitized = input.slice(0, maxLength);

      if (allowHtml) {
        // Allow specific HTML tags only
        sanitized = DOMPurify.sanitize(sanitized, {
          ALLOWED_TAGS: allowedTags,
          ALLOWED_ATTR: []
        });
      } else {
        // Strip all HTML and encode special characters
        sanitized = DOMPurify.sanitize(sanitized, {
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: []
        });
      }

      // Additional protection against XSS patterns
      sanitized = sanitized
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/<script/gi, '&lt;script')
        .replace(/eval\s*\(/gi, 'eval (');

      return sanitized;
    };
  }, []);

  const sanitizeFileName = useMemo(() => {
    return (filename: string): string => {
      return filename
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/\.{2,}/g, '.')
        .slice(0, 255);
    };
  }, []);

  const validateEmail = useMemo(() => {
    return (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email) && email.length <= 254;
    };
  }, []);

  const detectMaliciousInput = useMemo(() => {
    return (input: string): boolean => {
      const maliciousPatterns = [
        /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /on\w+\s*=/gi,
        /data:text\/html/gi,
        /<iframe/gi,
        /<embed/gi,
        /<object/gi,
        /expression\s*\(/gi,
        /eval\s*\(/gi,
        /setTimeout\s*\(/gi,
        /setInterval\s*\(/gi,
        /Function\s*\(/gi,
        /\bxss\b/gi,
        /\binjection\b/gi,
        /\bdrop\s+table\b/gi,
        /\bunion\s+select\b/gi,
        /\bselect\s+.*\s+from\b/gi
      ];

      // Check for suspicious input length (potential DoS)
      if (input.length > 50000) {
        return true;
      }

      // Check for repeated suspicious characters
      if (/[<>'"(){}[\]]{10,}/.test(input)) {
        return true;
      }

      return maliciousPatterns.some(pattern => pattern.test(input));
    };
  }, []);

  const sanitizeTaskInput = useMemo(() => {
    return (input: any): any => {
      if (typeof input === 'string') {
        // Enhanced security - check for malicious patterns first
        if (detectMaliciousInput(input)) {
          console.warn('Malicious input detected and blocked:', input.substring(0, 50));
          return ''; // Return empty string for malicious input
        }
        return sanitizeText(input, { maxLength: 2000 });
      }
      
      if (Array.isArray(input)) {
        return input.map(item => sanitizeTaskInput(item));
      }
      
      if (input && typeof input === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(input)) {
          // Skip potentially dangerous keys
          if (['__proto__', 'constructor', 'prototype'].includes(key)) {
            continue;
          }
          sanitized[key] = sanitizeTaskInput(value);
        }
        return sanitized;
      }
      
      return input;
    };
  }, [sanitizeText, detectMaliciousInput]);

  return {
    sanitizeText,
    sanitizeFileName,
    validateEmail,
    sanitizeTaskInput,
    detectMaliciousInput
  };
};
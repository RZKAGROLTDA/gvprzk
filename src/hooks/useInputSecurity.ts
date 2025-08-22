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

  const sanitizeTaskInput = useMemo(() => {
    return (input: any): any => {
      if (typeof input === 'string') {
        return sanitizeText(input, { maxLength: 2000 });
      }
      
      if (Array.isArray(input)) {
        return input.map(item => sanitizeTaskInput(item));
      }
      
      if (input && typeof input === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(input)) {
          sanitized[key] = sanitizeTaskInput(value);
        }
        return sanitized;
      }
      
      return input;
    };
  }, [sanitizeText]);

  return {
    sanitizeText,
    sanitizeFileName,
    validateEmail,
    sanitizeTaskInput
  };
};
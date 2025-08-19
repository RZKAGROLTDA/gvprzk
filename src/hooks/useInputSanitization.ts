import { useMemo } from 'react';

interface SanitizationOptions {
  maxLength?: number;
  allowHtml?: boolean;
  trimWhitespace?: boolean;
}

export const useInputSanitization = () => {
  const sanitizeText = useMemo(() => {
    return (input: string, options: SanitizationOptions = {}): string => {
      if (!input || typeof input !== 'string') return '';
      
      const {
        maxLength = 1000,
        allowHtml = false,
        trimWhitespace = true
      } = options;

      let sanitized = input;

      // Trim whitespace if requested
      if (trimWhitespace) {
        sanitized = sanitized.trim();
      }

      // Remove HTML tags if not allowed
      if (!allowHtml) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
      }

      // Encode HTML entities to prevent XSS
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      // Limit length
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }

      return sanitized;
    };
  }, []);

  const sanitizeEmail = useMemo(() => {
    return (email: string): string => {
      if (!email) return '';
      
      // Basic email validation and sanitization
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const sanitized = email.toLowerCase().trim();
      
      return emailRegex.test(sanitized) ? sanitized : '';
    };
  }, []);

  const sanitizeNumericInput = useMemo(() => {
    return (input: string | number, options: { min?: number; max?: number; allowDecimals?: boolean } = {}): number | null => {
      const { min, max, allowDecimals = true } = options;
      
      let numValue: number;
      
      if (typeof input === 'string') {
        // Remove any non-numeric characters except decimal point
        const cleaned = allowDecimals 
          ? input.replace(/[^0-9.-]/g, '') 
          : input.replace(/[^0-9-]/g, '');
        
        numValue = parseFloat(cleaned);
      } else {
        numValue = input;
      }

      // Check if valid number
      if (isNaN(numValue)) return null;

      // Apply min/max constraints
      if (min !== undefined && numValue < min) return min;
      if (max !== undefined && numValue > max) return max;

      return numValue;
    };
  }, []);

  return {
    sanitizeText,
    sanitizeEmail,
    sanitizeNumericInput
  };
};
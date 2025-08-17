import { useState } from 'react';

interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: string) => string | null;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const useInputValidation = () => {
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const validateField = (name: string, value: string, rules: ValidationRule): ValidationResult => {
    const fieldErrors: string[] = [];

    if (rules.required && (!value || value.trim().length === 0)) {
      fieldErrors.push('Este campo é obrigatório');
    }

    if (value && rules.minLength && value.length < rules.minLength) {
      fieldErrors.push(`Mínimo ${rules.minLength} caracteres`);
    }

    if (value && rules.maxLength && value.length > rules.maxLength) {
      fieldErrors.push(`Máximo ${rules.maxLength} caracteres`);
    }

    if (value && rules.pattern && !rules.pattern.test(value)) {
      fieldErrors.push('Formato inválido');
    }

    if (value && rules.custom) {
      const customError = rules.custom(value);
      if (customError) {
        fieldErrors.push(customError);
      }
    }

    // Update errors state
    setErrors(prev => ({
      ...prev,
      [name]: fieldErrors
    }));

    return {
      isValid: fieldErrors.length === 0,
      errors: fieldErrors
    };
  };

  const validateForm = (formData: Record<string, string>, validationRules: Record<string, ValidationRule>) => {
    const allErrors: Record<string, string[]> = {};
    let isFormValid = true;

    Object.keys(validationRules).forEach(fieldName => {
      const value = formData[fieldName] || '';
      const result = validateField(fieldName, value, validationRules[fieldName]);
      
      if (!result.isValid) {
        isFormValid = false;
        allErrors[fieldName] = result.errors;
      }
    });

    setErrors(allErrors);
    return isFormValid;
  };

  const clearErrors = (fieldName?: string) => {
    if (fieldName) {
      setErrors(prev => {
        const { [fieldName]: removed, ...rest } = prev;
        return rest;
      });
    } else {
      setErrors({});
    }
  };

  const getFieldErrors = (fieldName: string): string[] => {
    return errors[fieldName] || [];
  };

  const hasErrors = (fieldName?: string): boolean => {
    if (fieldName) {
      return Boolean(errors[fieldName]?.length);
    }
    return Object.keys(errors).some(key => errors[key]?.length > 0);
  };

  // Common validation rules
  const validationRules = {
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      custom: (value: string) => {
        // Additional email security checks
        if (value.includes('..')) return 'Email inválido';
        if (value.startsWith('.') || value.endsWith('.')) return 'Email inválido';
        return null;
      }
    },
    password: {
      required: true,
      minLength: 8,
      custom: (value: string) => {
        if (!/(?=.*[a-z])/.test(value)) return 'Deve conter pelo menos uma letra minúscula';
        if (!/(?=.*[A-Z])/.test(value)) return 'Deve conter pelo menos uma letra maiúscula';
        if (!/(?=.*\d)/.test(value)) return 'Deve conter pelo menos um número';
        if (!/(?=.*[@$!%*?&])/.test(value)) return 'Deve conter pelo menos um caractere especial';
        return null;
      }
    },
    name: {
      required: true,
      minLength: 2,
      maxLength: 100,
      custom: (value: string) => {
        if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(value)) return 'Apenas letras e espaços são permitidos';
        return null;
      }
    },
    phone: {
      pattern: /^\(\d{2}\)\s\d{4,5}-\d{4}$/,
      custom: (value: string) => {
        if (value && !/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(value)) {
          return 'Formato: (11) 99999-9999';
        }
        return null;
      }
    }
  };

  return {
    validateField,
    validateForm,
    clearErrors,
    getFieldErrors,
    hasErrors,
    errors,
    validationRules
  };
};
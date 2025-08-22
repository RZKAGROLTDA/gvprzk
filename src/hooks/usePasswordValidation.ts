import { useMemo } from 'react';

export interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  requirements: PasswordRequirements;
  score: number;
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

export const usePasswordValidation = () => {
  const validatePassword = useMemo(() => {
    return (password: string): PasswordValidationResult => {
      const requirements: PasswordRequirements = {
        minLength: password.length >= 8,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
      };

      const metRequirements = Object.values(requirements).filter(Boolean).length;
      const score = (metRequirements / 5) * 100;

      let strength: 'weak' | 'fair' | 'good' | 'strong';
      if (score < 40) strength = 'weak';
      else if (score < 60) strength = 'fair';
      else if (score < 80) strength = 'good';
      else strength = 'strong';

      return {
        isValid: metRequirements >= 4, // Require at least 4 out of 5 criteria
        requirements,
        score,
        strength
      };
    };
  }, []);

  const getPasswordErrorMessage = useMemo(() => {
    return (validation: PasswordValidationResult): string | null => {
      if (validation.isValid) return null;

      const missing = [];
      if (!validation.requirements.minLength) missing.push('8 caracteres');
      if (!validation.requirements.hasUppercase) missing.push('1 letra maiúscula');
      if (!validation.requirements.hasLowercase) missing.push('1 letra minúscula');
      if (!validation.requirements.hasNumber) missing.push('1 número');
      if (!validation.requirements.hasSpecialChar) missing.push('1 caractere especial');

      return `A senha deve conter pelo menos: ${missing.join(', ')}`;
    };
  }, []);

  return {
    validatePassword,
    getPasswordErrorMessage
  };
};
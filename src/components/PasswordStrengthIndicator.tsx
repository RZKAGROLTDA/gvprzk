import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password,
  className = ''
}) => {
  const requirements = [
    {
      test: (pwd: string) => pwd.length >= 8,
      label: 'Pelo menos 8 caracteres',
      met: password.length >= 8
    },
    {
      test: (pwd: string) => /[a-z]/.test(pwd),
      label: 'Uma letra minúscula',
      met: /[a-z]/.test(password)
    },
    {
      test: (pwd: string) => /[A-Z]/.test(pwd),
      label: 'Uma letra maiúscula',
      met: /[A-Z]/.test(password)
    },
    {
      test: (pwd: string) => /\d/.test(pwd),
      label: 'Um número',
      met: /\d/.test(password)
    },
    {
      test: (pwd: string) => /[@$!%*?&]/.test(pwd),
      label: 'Um caractere especial (@$!%*?&)',
      met: /[@$!%*?&]/.test(password)
    }
  ];

  const metRequirements = requirements.filter(req => req.met).length;
  const strength = (metRequirements / requirements.length) * 100;

  const getStrengthLabel = () => {
    if (strength < 40) return 'Fraca';
    if (strength < 80) return 'Média';
    return 'Forte';
  };

  const getStrengthColor = () => {
    if (strength < 40) return 'bg-red-500';
    if (strength < 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (!password) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Força da senha:</span>
        <span className={`font-medium ${
          strength < 40 ? 'text-red-600' : 
          strength < 80 ? 'text-yellow-600' : 
          'text-green-600'
        }`}>
          {getStrengthLabel()}
        </span>
      </div>
      
      <Progress 
        value={strength} 
        className="h-2"
      />
      
      <div className="space-y-1">
        {requirements.map((req, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            {req.met ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <X className="h-3 w-3 text-red-600" />
            )}
            <span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
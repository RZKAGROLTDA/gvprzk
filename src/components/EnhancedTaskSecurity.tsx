import React from 'react';
import { Badge } from './ui/badge';
import { Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from './ui/card';

interface TaskSecurityIndicatorProps {
  accessLevel: 'full' | 'owner' | 'supervisor' | 'limited' | 'none';
  isMasked: boolean;
  className?: string;
}

export const TaskSecurityIndicator: React.FC<TaskSecurityIndicatorProps> = ({
  accessLevel,
  isMasked,
  className = ''
}) => {
  const getSecurityIcon = () => {
    if (isMasked) return <EyeOff className="h-3 w-3" />;
    if (accessLevel === 'full' || accessLevel === 'owner') return <Eye className="h-3 w-3" />;
    return <Shield className="h-3 w-3" />;
  };

  const getSecurityVariant = () => {
    switch (accessLevel) {
      case 'full':
      case 'owner':
        return 'default';
      case 'supervisor':
        return 'secondary';
      case 'limited':
        return 'outline';
      case 'none':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getSecurityLabel = () => {
    switch (accessLevel) {
      case 'full':
        return 'Acesso Completo';
      case 'owner':
        return 'Proprietário';
      case 'supervisor':
        return 'Supervisor';
      case 'limited':
        return 'Acesso Limitado';
      case 'none':
        return 'Sem Acesso';
      default:
        return 'Indefinido';
    }
  };

  return (
    <Badge variant={getSecurityVariant()} className={`text-xs ${className}`}>
      {getSecurityIcon()}
      <span className="ml-1">
        {isMasked ? 'Dados Protegidos' : getSecurityLabel()}
      </span>
    </Badge>
  );
};

interface SecureDataDisplayProps {
  value: string | number | null;
  isMasked: boolean;
  type: 'email' | 'phone' | 'currency' | 'text';
  children?: React.ReactNode;
}

export const SecureDataDisplay: React.FC<SecureDataDisplayProps> = ({
  value,
  isMasked,
  type,
  children
}) => {
  const formatValue = () => {
    if (isMasked || value === null || value === undefined) {
      switch (type) {
        case 'email':
          return '***@***.***';
        case 'phone':
          return '***-***-***';
        case 'currency':
          return 'R$ ***,**';
        default:
          return '***';
      }
    }

    if (type === 'currency' && typeof value === 'number') {
      return value.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      });
    }

    return String(value);
  };

  return (
    <div className="flex items-center gap-2">
      <span className={isMasked ? 'italic text-muted-foreground' : ''}>
        {formatValue()}
      </span>
      {isMasked && (
        <Badge variant="secondary" className="text-xs">
          <Shield className="h-3 w-3 mr-1" />
          Protegido
        </Badge>
      )}
      {children}
    </div>
  );
};

interface SecurityWarningProps {
  message: string;
  type: 'warning' | 'error' | 'info';
}

export const SecurityWarning: React.FC<SecurityWarningProps> = ({
  message,
  type
}) => {
  const getVariant = () => {
    switch (type) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'secondary';
      case 'info':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'error':
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <Shield className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="text-sm">{message}</span>
        </div>
      </CardContent>
    </Card>
  );
};
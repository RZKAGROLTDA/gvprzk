import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecurityBadgeProps {
  isMasked?: boolean;
  className?: string;
}

export const SecurityBadge: React.FC<SecurityBadgeProps> = ({ 
  isMasked = false, 
  className 
}) => {
  if (!isMasked) return null;

  return (
    <Badge 
      variant="secondary" 
      className={cn("text-xs flex items-center gap-1", className)}
    >
      <Shield className="h-3 w-3" />
      Dados Protegidos
    </Badge>
  );
};
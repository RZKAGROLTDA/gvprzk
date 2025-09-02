import React from 'react';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SecureTaskDisplayProps {
  value: string;
  isMasked: boolean;
  type: 'email' | 'phone' | 'client' | 'property';
  accessLevel: 'full' | 'owner' | 'supervisor' | 'limited';
}

export const SecureTaskDisplay: React.FC<SecureTaskDisplayProps> = ({
  value,
  isMasked,
  type,
  accessLevel
}) => {
  const getTooltipContent = () => {
    if (!isMasked) return null;
    
    switch (type) {
      case 'email':
        return 'Customer email address is protected. Full access requires appropriate permissions.';
      case 'phone':
        return 'Customer phone number is protected. Full access requires appropriate permissions.';
      case 'client':
        return 'Customer name is protected. Full access requires appropriate permissions.';
      case 'property':
        return 'Property information is protected. Full access requires appropriate permissions.';
      default:
        return 'This information is protected for security reasons.';
    }
  };

  const getDisplayValue = () => {
    if (!value) return '-';
    return value;
  };

  const getAccessBadgeColor = () => {
    switch (accessLevel) {
      case 'full': return 'default';
      case 'owner': return 'success';
      case 'supervisor': return 'warning';
      case 'limited': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`${isMasked ? 'text-muted-foreground' : ''}`}>
        {getDisplayValue()}
      </span>
      
      {isMasked && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1">
                <Shield className="h-4 w-4 text-amber-500" />
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-sm">{getTooltipContent()}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {!isMasked && accessLevel !== 'limited' && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Eye className="h-3 w-3 text-green-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Full access granted - {accessLevel} level</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      <Badge variant={getAccessBadgeColor()} className="text-xs">
        {accessLevel}
      </Badge>
    </div>
  );
};
import { AlertTriangle, Clock, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface SecurityMessageProps {
  variant?: 'warning' | 'pending' | 'info';
  title: string;
  description: string;
  badge?: string;
}

export const SecurityMessage = ({ 
  variant = 'info', 
  title, 
  description, 
  badge 
}: SecurityMessageProps) => {
  const getIcon = () => {
    switch (variant) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getVariantClass = () => {
    switch (variant) {
      case 'warning':
        return 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive';
      case 'pending':
        return 'border-warning/50 text-warning dark:border-warning [&>svg]:text-warning';
      default:
        return 'border-primary/50 text-primary dark:border-primary [&>svg]:text-primary';
    }
  };

  return (
    <Alert className={getVariantClass()}>
      {getIcon()}
      <AlertTitle className="flex items-center gap-2">
        {title}
        {badge && (
          <Badge variant={variant === 'warning' ? 'destructive' : 'secondary'}>
            {badge}
          </Badge>
        )}
      </AlertTitle>
      <AlertDescription>
        {description}
      </AlertDescription>
    </Alert>
  );
};
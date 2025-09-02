import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useSecureCustomerMonitoring } from '@/hooks/useSecureCustomerMonitoring';

export const SecurityAlertPanel: React.FC = () => {
  const { alerts, isLoading } = useSecureCustomerMonitoring();

  if (isLoading || !alerts.length) {
    return null;
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <AlertCircle className="h-4 w-4" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4" />;
      case 'medium':
        return <Shield className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const criticalAlerts = alerts.filter(alert => alert.severity.toLowerCase() === 'critical');
  const highAlerts = alerts.filter(alert => alert.severity.toLowerCase() === 'high');
  
  if (criticalAlerts.length === 0 && highAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mb-6">
      {criticalAlerts.map((alert, index) => (
        <Alert key={`critical-${index}`} variant="destructive" className="border-red-500 bg-red-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            🚨 CRITICAL SECURITY ALERT
            <Badge variant="destructive">{alert.severity}</Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="space-y-2">
              <p className="font-semibold">{alert.description}</p>
              <p className="text-sm text-muted-foreground">{alert.recommendation}</p>
              <p className="text-xs">
                <strong>Alert Type:</strong> {alert.alert_type} | 
                <strong> Count:</strong> {alert.count}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      ))}
      
      {highAlerts.map((alert, index) => (
        <Alert key={`high-${index}`} variant="default" className="border-orange-500 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="flex items-center gap-2">
            ⚠️ High Priority Security Alert
            <Badge variant={getSeverityColor(alert.severity)}>{alert.severity}</Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="space-y-2">
              <p className="font-semibold">{alert.description}</p>
              <p className="text-sm text-muted-foreground">{alert.recommendation}</p>
              <p className="text-xs">
                <strong>Alert Type:</strong> {alert.alert_type} | 
                <strong> Count:</strong> {alert.count}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield, X, Eye, Clock, Database } from 'lucide-react';
import { useEnhancedSecurityMonitor } from '@/hooks/useEnhancedSecurityMonitor';

interface SecurityAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  recommendation: string;
  timestamp: string;
}

export const SecurityAlertPanel: React.FC = () => {
  const {
    activeAlerts,
    dismissAlert,
    getCriticalAlerts,
    alertStats
  } = useEnhancedSecurityMonitor();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'outline';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'HIGH':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'MEDIUM':
        return <Eye className="h-4 w-4 text-yellow-500" />;
      case 'LOW':
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <Shield className="h-4 w-4 text-gray-500" />;
    }
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'bulk_export':
        return <Database className="h-4 w-4" />;
      case 'rate_limit_exceeded':
        return <Clock className="h-4 w-4" />;
      case 'suspicious_activity_pattern':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diffMs = now.getTime() - alertTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return alertTime.toLocaleDateString('pt-BR');
  };

  if (activeAlerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            Alertas de Segurança
          </CardTitle>
          <CardDescription>
            Monitoramento em tempo real de eventos de segurança
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="font-medium text-green-700 mb-2">Sistema Seguro</h3>
            <p className="text-sm text-muted-foreground">
              Nenhum alerta de segurança ativo no momento
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alert Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-500">{alertStats.critical}</p>
                <p className="text-xs text-muted-foreground">Críticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-orange-500">{alertStats.high}</p>
                <p className="text-xs text-muted-foreground">Altos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-500">{alertStats.medium}</p>
                <p className="text-xs text-muted-foreground">Médios</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-blue-500">{alertStats.low}</p>
                <p className="text-xs text-muted-foreground">Baixos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Alertas Ativos ({activeAlerts.length})
          </CardTitle>
          <CardDescription>
            Eventos de segurança que requerem atenção
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <Alert key={alert.id} className="relative">
                <div className="flex items-start gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getAlertTypeIcon(alert.type)}
                      <h4 className="font-medium truncate">{alert.title}</h4>
                      <Badge variant={getSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatRelativeTime(alert.timestamp)}
                      </span>
                    </div>
                    
                    <AlertDescription className="mb-3">
                      {alert.description}
                    </AlertDescription>
                    
                    <div className="bg-muted/50 p-3 rounded text-sm">
                      <p className="font-medium text-primary mb-1">
                        📋 Recomendação:
                      </p>
                      <p className="text-muted-foreground">{alert.recommendation}</p>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAlert(alert.id)}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Alert>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts Summary */}
      {getCriticalAlerts().length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              ⚠️ Ação Imediata Requerida
            </CardTitle>
            <CardDescription className="text-red-600">
              {getCriticalAlerts().length} alerta(s) crítico(s) detectado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="border-red-300">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-red-700">
                <strong>Alertas críticos requerem investigação imediata.</strong>
                <br />
                Verifique os logs de auditoria e tome as ações recomendadas para cada alerta.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
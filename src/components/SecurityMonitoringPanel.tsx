import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Eye, X, Clock } from 'lucide-react';
import { useEnhancedSecurityMonitor } from '@/hooks/useEnhancedSecurityMonitor';

export const SecurityMonitoringPanel: React.FC = () => {
  const {
    activeAlerts,
    alertStats,
    dismissAlert,
    getCriticalAlerts
  } = useEnhancedSecurityMonitor();

  const criticalAlerts = getCriticalAlerts();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle className="h-4 w-4" />;
      case 'medium':
        return <Eye className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Critical Alerts Banner */}
      {criticalAlerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {criticalAlerts.length} alerta(s) crítico(s) requer(em) atenção imediata!
          </AlertDescription>
        </Alert>
      )}

      {/* Security Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{alertStats.total}</p>
              </div>
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Críticos</p>
                <p className="text-2xl font-bold text-destructive">{alertStats.critical}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Altos</p>
                <p className="text-2xl font-bold text-destructive">{alertStats.high}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Médios</p>
                <p className="text-2xl font-bold text-yellow-600">{alertStats.medium}</p>
              </div>
              <Eye className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Baixos</p>
                <p className="text-2xl font-bold text-green-600">{alertStats.low}</p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Alertas de Segurança Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeAlerts.filter(alert => !alert.dismissed).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium">Sistema Seguro</p>
              <p className="text-sm">Nenhum alerta de segurança ativo no momento.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeAlerts
                .filter(alert => !alert.dismissed)
                .sort((a, b) => {
                  // Sort by severity (critical first) then by timestamp (newest first)
                  const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
                  const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
                  if (severityDiff !== 0) return severityDiff;
                  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                })
                .slice(0, 10) // Show only latest 10 alerts
                .map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between p-4 border rounded-lg bg-card"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(alert.severity)}
                        <Badge variant={getSeverityColor(alert.severity)}>
                          {alert.severity.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{alert.title}</span>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        {alert.description}
                      </p>
                      
                      {alert.recommendation && (
                        <p className="text-xs text-primary bg-primary/10 p-2 rounded">
                          <strong>Recomendação:</strong> {alert.recommendation}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(alert.timestamp).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAlert(alert.id)}
                      className="ml-4"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
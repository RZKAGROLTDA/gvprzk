import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnhancedSecurityMonitor } from '@/hooks/useEnhancedSecurityMonitor';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Lock, 
  Database, 
  Activity,
  Clock,
  Users,
  FileWarning
} from 'lucide-react';

export const SecurityStatusOverview: React.FC = () => {
  const { alertStats, getCriticalAlerts } = useEnhancedSecurityMonitor();

  const { data: securityMetrics, isLoading } = useQuery({
    queryKey: ['security-overview'],
    queryFn: async () => {
      const [threats, audit] = await Promise.all([
        supabase.rpc('check_security_threats'),
        supabase.rpc('check_customer_data_access_alerts')
      ]);

      return {
        threats: threats.data || [],
        audit: audit.data || []
      };
    },
    staleTime: 10 * 60 * 1000, // 10 minutos - OTIMIZAÇÃO Disk IO
    refetchInterval: false, // OTIMIZAÇÃO: polling desabilitado para reduzir Disk IO
    refetchOnWindowFocus: false,
  });

  const criticalAlerts = getCriticalAlerts();
  const securityScore = Math.max(0, 100 - (alertStats.critical * 30 + alertStats.high * 15 + alertStats.medium * 5));

  const getSecurityScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSecurityScoreLabel = (score: number) => {
    if (score >= 80) return 'Excelente';
    if (score >= 60) return 'Boa';
    if (score >= 40) return 'Regular';
    return 'Crítica';
  };

  return (
    <div className="space-y-6">
      {/* Security Score Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Status de Segurança Geral
          </CardTitle>
          <CardDescription>
            Avaliação em tempo real da segurança do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-3xl font-bold ${getSecurityScoreColor(securityScore)}`}>
                {securityScore}/100
              </div>
              <div className="text-sm text-muted-foreground">
                Pontuação de Segurança - {getSecurityScoreLabel(securityScore)}
              </div>
            </div>
            <div className="flex flex-col items-end space-y-1">
              <Badge variant={securityScore >= 80 ? 'default' : securityScore >= 60 ? 'secondary' : 'destructive'}>
                {getSecurityScoreLabel(securityScore)}
              </Badge>
              {securityScore < 80 && (
                <div className="text-xs text-muted-foreground">
                  {alertStats.critical > 0 && `${alertStats.critical} críticos`}
                  {alertStats.high > 0 && ` ${alertStats.high} altos`}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold mb-2">
              {criticalAlerts.length} Alerta(s) Crítico(s) Detectado(s)
            </div>
            <div className="space-y-1">
              {criticalAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="text-sm">
                  • {alert.title}: {alert.description}
                </div>
              ))}
              {criticalAlerts.length > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{criticalAlerts.length - 3} alertas adicionais
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Security Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{alertStats.total}</div>
                <div className="text-sm text-muted-foreground">Alertas Ativos</div>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{securityMetrics?.threats?.length || 0}</div>
                <div className="text-sm text-muted-foreground">Ameaças Detectadas</div>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {securityMetrics?.audit?.filter(a => a.severity === 'CRITICAL').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Acessos Críticos</div>
              </div>
              <Database className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {securityScore >= 80 ? '✓' : securityScore >= 60 ? '⚠' : '✗'}
                </div>
                <div className="text-sm text-muted-foreground">Status RLS</div>
              </div>
              <Lock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Threats */}
      {securityMetrics?.threats && securityMetrics.threats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              Ameaças de Segurança Detectadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {securityMetrics.threats.map((threat, index) => (
                <Alert key={index} variant={threat.threat_level === 'CRITICAL' ? 'destructive' : 'default'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{threat.threat_type}</div>
                        <div className="text-sm">{threat.recommendation}</div>
                        <div className="text-xs text-muted-foreground">
                          {threat.event_count} eventos detectados
                        </div>
                      </div>
                      <Badge variant={threat.threat_level === 'CRITICAL' ? 'destructive' : 'secondary'}>
                        {threat.threat_level}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Rápidas de Segurança</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <Clock className="h-4 w-4 mr-2" />
              Verificar Logs de Auditoria
            </Button>
            <Button variant="outline" size="sm">
              <Users className="h-4 w-4 mr-2" />
              Revisar Permissões
            </Button>
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" />
              Executar Teste de Segurança
            </Button>
            <Button variant="outline" size="sm">
              <Shield className="h-4 w-4 mr-2" />
              Configurar Alertas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Seguro (80-100)</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>Atenção (60-79)</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span>Crítico (0-59)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
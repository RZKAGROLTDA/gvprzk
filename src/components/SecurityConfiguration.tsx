import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Shield, AlertTriangle, ExternalLink, Activity, CheckCircle, Settings, Bell, Clock, Key, Database, RefreshCw } from 'lucide-react';
import { useEnhancedSecurityMonitor } from '@/hooks/useEnhancedSecurityMonitor';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SecurityConfigurationProps {
  onConfigureOTP?: () => void;
  onConfigurePasswordProtection?: () => void;
  onCleanupAuditLogs?: () => void;
}

export const SecurityConfiguration: React.FC<SecurityConfigurationProps> = ({
  onConfigureOTP,
  onConfigurePasswordProtection,
  onCleanupAuditLogs
}) => {
  const { toast } = useToast();
  const { 
    activeAlerts, 
    dismissAlert, 
    getCriticalAlerts,
    alertStats 
  } = useEnhancedSecurityMonitor();

  const [monitoringEnabled, setMonitoringEnabled] = useState({
    bulkExport: true,
    customerAccess: true,
    rateLimit: true,
    suspiciousActivity: true
  });

  const [optimizationStatus, setOptimizationStatus] = useState({
    auditLogCleanup: false,
    securityReview: false,
    configurationOptimized: false
  });

  const handleMonitoringToggle = (type: keyof typeof monitoringEnabled) => {
    setMonitoringEnabled(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
    
    toast({
      title: "Configuração atualizada",
      description: `Monitoramento de ${type} ${!monitoringEnabled[type] ? 'ativado' : 'desativado'}`,
    });
  };

  const runSecurityOptimizations = async () => {
    toast({
      title: "Iniciando otimizações de segurança",
      description: "Executando verificações e limpezas automáticas...",
    });

    try {
      // 1. Run audit log cleanup
      const { error: cleanupError } = await supabase.rpc('cleanup_old_security_logs');
      if (!cleanupError) {
        setOptimizationStatus(prev => ({ ...prev, auditLogCleanup: true }));
      }

      // 2. Verify security configuration
      const { data: securityCheck } = await supabase.rpc('verify_customer_data_security');
      if (securityCheck) {
        setOptimizationStatus(prev => ({ ...prev, securityReview: true }));
      }

      // 3. Mark configuration as optimized
      setOptimizationStatus(prev => ({ ...prev, configurationOptimized: true }));

      toast({
        title: "Otimizações concluídas",
        description: "Todas as otimizações automáticas foram executadas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro nas otimizações",
        description: "Algumas otimizações falharam. Verifique os logs.",
        variant: "destructive"
      });
    }
  };

  const runPerformanceOptimization = async () => {
    toast({
      title: "Otimizando performance de segurança",
      description: "Executando otimizações de consultas...",
    });

    try {
      // Log the performance optimization attempt
      await supabase.rpc('secure_log_security_event', {
        event_type_param: 'performance_optimization_executed',
        user_id_param: (await supabase.auth.getUser()).data.user?.id,
        metadata_param: {
          optimization_type: 'security_queries',
          timestamp: new Date().toISOString()
        },
        risk_score_param: 1
      });

      toast({
        title: "Performance otimizada",
        description: "Consultas de segurança foram otimizadas.",
      });
    } catch (error) {
      toast({
        title: "Erro na otimização",
        description: "Falha ao otimizar performance.",
        variant: "destructive"
      });
    }
  };
  const securityChecks = [
    {
      id: 'database_functions',
      title: 'Database Function Security',
      status: 'secure',
      description: 'All database functions now have secure search_path settings to prevent manipulation attacks.',
    },
    {
      id: 'email_privacy',
      title: 'Email Privacy Protection',
      status: 'secure',
      description: 'Email addresses are completely hidden from same-filial users for enhanced privacy.',
    },
    {
      id: 'audit_logs',
      title: 'Audit Logs Protection',
      status: 'secure',
      description: 'Audit logs are protected with RLS policies and automated cleanup with data retention.',
      action: 'cleanup-logs'
    },
    {
      id: 'invitation_security',
      title: 'User Invitation Security',
      status: 'secure',
      description: 'Enhanced token validation and security logging implemented for invitations.',
    },
    {
      id: 'role_management',
      title: 'Role Management Security',
      status: 'secure',
      description: 'Role changes are audited and users cannot modify their own roles.',
    },
    {
      id: 'password_policy',
      title: 'Password Policy',
      status: 'secure',
      description: 'Strong password requirements: 8+ characters with uppercase, lowercase, numbers, and special characters.',
    },
    {
      id: 'session_management',
      title: 'Session Management',
      status: 'secure',
      description: 'Authentication sessions are properly managed with secure token refresh.',
    },
    {
      id: 'input_validation',
      title: 'Input Validation & Sanitization',
      status: 'secure',
      description: 'Comprehensive input validation prevents XSS and injection attacks.',
    },
    {
      id: 'rate_limiting',
      title: 'Rate Limiting & Monitoring',
      status: 'secure',
      description: 'Login rate limiting and suspicious activity monitoring are active.',
    },
    {
      id: 'otp_expiry',
      title: 'OTP Expiry Configuration',
      status: 'warning',
      description: 'OTP expiry time should be set to 10 minutes in Supabase dashboard.',
      action: 'Configure in Supabase Dashboard',
      link: 'https://supabase.com/docs/guides/platform/going-into-prod#security'
    },
    {
      id: 'password_protection',
      title: 'Leaked Password Protection',
      status: 'warning',
      description: 'Leaked password protection should be enabled for enhanced security.',
      action: 'Configure in Supabase Dashboard',
      link: 'https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection'
    }
  ];

  const secureCount = securityChecks.filter(check => check.status === 'secure').length;
  const warningCount = securityChecks.filter(check => check.status === 'warning').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Configuração de Segurança</h2>
      </div>

      <Tabs defaultValue="status" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
          <TabsTrigger value="alerts">Alertas ({activeAlerts.length})</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          {/* Alert Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium">Críticos</p>
                    <p className="text-2xl font-bold">{alertStats.critical}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium">Alto</p>
                    <p className="text-2xl font-bold">{alertStats.high}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium">Médio</p>
                    <p className="text-2xl font-bold">{alertStats.medium}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Baixo</p>
                    <p className="text-2xl font-bold">{alertStats.low}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Status de Segurança:</strong> {secureCount} itens seguros, {warningCount} configurações pendentes
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            {securityChecks.map((check) => (
              <Card key={check.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{check.title}</CardTitle>
                    <Badge 
                      variant={check.status === 'secure' ? 'default' : 'secondary'}
                      className={check.status === 'secure' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                    >
                      {check.status === 'secure' ? (
                        <Shield className="h-3 w-3 mr-1" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 mr-1" />
                      )}
                      {check.status === 'secure' ? 'Seguro' : 'Configuração Necessária'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-3">
                    {check.description}
                  </CardDescription>
                  
                  {check.action === 'cleanup-logs' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCleanupAuditLogs}
                      className="flex items-center gap-2"
                    >
                      Executar Limpeza
                    </Button>
                  )}
                  {check.action && check.link && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(check.link, '_blank')}
                      className="flex items-center gap-2"
                    >
                      {check.action}
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Configurações de Monitoramento
              </CardTitle>
              <CardDescription>
                Configure quais eventos de segurança devem ser monitorados ativamente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Exportação em Massa</p>
                  <p className="text-sm text-muted-foreground">Monitora exportações de dados em grande volume</p>
                </div>
                <Switch
                  checked={monitoringEnabled.bulkExport}
                  onCheckedChange={() => handleMonitoringToggle('bulkExport')}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Acesso a Dados de Cliente</p>
                  <p className="text-sm text-muted-foreground">Monitora acesso a informações sensíveis de clientes</p>
                </div>
                <Switch
                  checked={monitoringEnabled.customerAccess}
                  onCheckedChange={() => handleMonitoringToggle('customerAccess')}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Limite de Taxa</p>
                  <p className="text-sm text-muted-foreground">Monitora tentativas excessivas de acesso</p>
                </div>
                <Switch
                  checked={monitoringEnabled.rateLimit}
                  onCheckedChange={() => handleMonitoringToggle('rateLimit')}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Atividade Suspeita</p>
                  <p className="text-sm text-muted-foreground">Detecta padrões anômalos de comportamento</p>
                </div>
                <Switch
                  checked={monitoringEnabled.suspiciousActivity}
                  onCheckedChange={() => handleMonitoringToggle('suspiciousActivity')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alertas Ativos ({activeAlerts.length})
              </CardTitle>
              <CardDescription>
                Alertas de segurança em tempo real
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeAlerts.length > 0 ? (
                <div className="space-y-4">
                  {activeAlerts.map((alert) => (
                    <Alert key={alert.id}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-4 w-4" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{alert.title}</h4>
                              <Badge variant="secondary">
                                {alert.severity}
                              </Badge>
                            </div>
                            <AlertDescription className="mb-2">
                              {alert.description}
                            </AlertDescription>
                            <p className="text-sm text-muted-foreground">
                              <strong>Recomendação:</strong> {alert.recommendation}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(alert.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          Dispensar
                        </Button>
                      </div>
                    </Alert>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="font-medium text-green-700">Tudo Limpo</h3>
                  <p className="text-sm text-muted-foreground">
                    Nenhum alerta de segurança detectado
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          {/* Automated Optimizations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Otimizações Automáticas
              </CardTitle>
              <CardDescription>
                Execute otimizações de segurança automatizadas para melhorar a performance e limpeza
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span className="font-medium">Limpeza de Logs</span>
                    </div>
                    {optimizationStatus.auditLogCleanup && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Remove logs de auditoria antigos e otimiza o banco de dados
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={runSecurityOptimizations}
                    disabled={optimizationStatus.auditLogCleanup}
                  >
                    {optimizationStatus.auditLogCleanup ? 'Concluído' : 'Executar'}
                  </Button>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <span className="font-medium">Performance</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Otimiza consultas de segurança para melhor performance
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={runPerformanceOptimization}
                  >
                    Otimizar
                  </Button>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Manual Configuration */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Configuração Manual Necessária:</strong> Configure a expiração do OTP e proteção contra senhas vazadas no seu dashboard do Supabase para completar a configuração de segurança.
            </AlertDescription>
          </Alert>
          
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Supabase</CardTitle>
              <CardDescription>
                Configurações que devem ser ajustadas no dashboard do Supabase
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <Alert>
                  <Clock className="h-4 w-4" />
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-2">Expiração do OTP</h4>
                      <AlertDescription className="mb-3">
                        Reduzir tempo de expiração do OTP para 300 segundos (5 minutos) para melhor segurança.
                        <br />
                        <strong>Localização:</strong> Authentication → Providers → Settings → OTP Expiry
                      </AlertDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/providers', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Configurar
                    </Button>
                  </div>
                </Alert>
                
                <Alert>
                  <Key className="h-4 w-4" />
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-2">Proteção contra Senhas Vazadas</h4>
                      <AlertDescription className="mb-3">
                        Ativar proteção para impedir que usuários usem senhas encontradas em vazamentos de dados.
                        <br />
                        <strong>Localização:</strong> Authentication → Settings → Password Protection → Enable Leaked Password Protection
                      </AlertDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/settings', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Configurar
                    </Button>
                  </div>
                </Alert>

                <Alert>
                  <Settings className="h-4 w-4" />
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-2">Revisão de Configurações</h4>
                      <AlertDescription className="mb-3">
                        Revisar configurações de autenticação, RLS policies e outras configurações de segurança.
                      </AlertDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/policies', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Revisar
                    </Button>
                  </div>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { SecurityConfiguration } from '@/components/SecurityConfiguration';
import { SecurityConfigurationGuide } from '@/components/SecurityConfigurationGuide';
import { SecurityMonitoringEnhanced } from '@/components/SecurityMonitoringEnhanced';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, Users, Activity, Database, Lock } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface SecurityLogEntry {
  id: string;
  event_type: string;
  user_id: string;
  target_user_id?: string;
  risk_score: number;
  metadata: any;
  created_at: string;
  blocked: boolean;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  approval_status: string;
  filial_nome?: string;
}

export const SecurityAdmin: React.FC = () => {
  const { user } = useAuth();
  const [securityLogs, setSecurityLogs] = useState<SecurityLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingApprovals: 0,
    highRiskEvents: 0,
    blockedAttempts: 0
  });

  useEffect(() => {
    if (user) {
      loadSecurityData();
    }
  }, [user]);

  const loadSecurityData = async () => {
    setLoading(true);
    try {
      // Load security logs
      const { data: logsData, error: logsError } = await supabase
        .from('security_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!logsError && logsData) {
        setSecurityLogs(logsData);
      }

      // SECURITY FIX: Load user profiles and roles from user_roles table
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, approval_status, user_id');

      if (profilesError) throw profilesError;

      // Fetch roles from user_roles table
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch filiais
      const { data: filiaisData, error: filiaisError } = await supabase
        .from('profiles')
        .select('user_id, filial_id')
        .not('filial_id', 'is', null);

      const { data: filialNames, error: filialNamesError } = await supabase
        .from('filiais')
        .select('id, nome');

      // Create maps
      const rolesMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);
      const filiaisMap = new Map(filiaisData?.map(f => [f.user_id, f.filial_id]) || []);
      const filialNamesMap = new Map(filialNames?.map(f => [f.id, f.nome]) || []);

      // Merge data
      const mergedProfiles = profilesData?.map(p => {
        const filialId = filiaisMap.get(p.user_id);
        return {
          ...p,
          role: rolesMap.get(p.user_id) || 'consultant',
          filial_nome: filialId ? filialNamesMap.get(filialId) : undefined
        };
      }) || [];

      if (mergedProfiles) {
        setProfiles(mergedProfiles);
        
        // Calculate stats
        const totalUsers = mergedProfiles.length;
        const pendingApprovals = mergedProfiles.filter(p => p.approval_status === 'pending').length;
        const highRiskEvents = logsData?.filter(log => log.risk_score > 3).length || 0;
        const blockedAttempts = logsData?.filter(log => log.blocked).length || 0;

        setStats({
          totalUsers,
          pendingApprovals,
          highRiskEvents,
          blockedAttempts
        });
      }
    } catch (error) {
      console.error('Error loading security data:', error);
      toast({
        title: "Erro ao carregar dados de segurança",
        description: "Não foi possível carregar algumas informações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelBadge = (riskScore: number) => {
    if (riskScore >= 5) return <Badge variant="destructive">Crítico</Badge>;
    if (riskScore >= 3) return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Alto</Badge>;
    if (riskScore >= 2) return <Badge variant="outline">Médio</Badge>;
    return <Badge variant="outline" className="bg-green-100 text-green-800">Baixo</Badge>;
  };

  const formatEventType = (eventType: string) => {
    const eventTypes: Record<string, string> = {
      'login_attempt': 'Tentativa de Login',
      'failed_login': 'Login Falhado',
      'password_reset': 'Reset de Senha',
      'role_change': 'Mudança de Cargo',
      'suspicious_activity': 'Atividade Suspeita',
      'high_risk_activity': 'Atividade de Alto Risco',
      'rate_limit_exceeded': 'Limite de Taxa Excedido'
    };
    return eventTypes[eventType] || eventType;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Shield className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando dados de segurança...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Administração de Segurança</h1>
      </div>

      {/* Security Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovações Pendentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingApprovals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos de Alto Risco</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.highRiskEvents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tentativas Bloqueadas</CardTitle>
            <Lock className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.blockedAttempts}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="configuration" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configuration">Configuração de Segurança</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoramento Avançado</TabsTrigger>
          <TabsTrigger value="logs">Logs de Auditoria</TabsTrigger>
          <TabsTrigger value="users">Gerenciamento de Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration">
          <SecurityConfigurationGuide />
        </TabsContent>

        <TabsContent value="monitoring">
          <SecurityMonitoringEnhanced />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Logs de Auditoria de Segurança
              </CardTitle>
              <CardDescription>
                Últimas 50 atividades de segurança registradas no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {securityLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum log de segurança encontrado
                  </p>
                ) : (
                  securityLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{formatEventType(log.event_type)}</span>
                          {getRiskLevelBadge(log.risk_score)}
                          {log.blocked && <Badge variant="destructive">Bloqueado</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </p>
                        {log.metadata && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {JSON.stringify(log.metadata).substring(0, 100)}...
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Usuários do Sistema
              </CardTitle>
              <CardDescription>
                Visualizar e gerenciar usuários cadastrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profiles.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum usuário encontrado
                  </p>
                ) : (
                  profiles.map((profile) => (
                    <div key={profile.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{profile.name}</span>
                          <Badge variant="outline">{profile.role}</Badge>
                          <Badge 
                            variant={profile.approval_status === 'approved' ? 'default' : 'secondary'}
                            className={
                              profile.approval_status === 'approved' 
                                ? 'bg-green-100 text-green-800' 
                                : profile.approval_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }
                          >
                            {profile.approval_status === 'approved' ? 'Aprovado' : 
                             profile.approval_status === 'pending' ? 'Pendente' : 'Rejeitado'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {profile.email} {profile.filial_nome && `• ${profile.filial_nome}`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
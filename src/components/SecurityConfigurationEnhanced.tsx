import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, CheckCircle, ExternalLink, Lock, Users, Database, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SecurityConfigItem {
  id: string;
  title: string;
  description: string;
  status: 'secure' | 'warning' | 'critical';
  action?: string;
  actionUrl?: string;
  implemented: boolean;
}

const SecurityConfigurationEnhanced: React.FC = () => {
  const [activeTab, setActiveTab] = useState('authentication');

  const authenticationConfig: SecurityConfigItem[] = [
    {
      id: 'otp-expiry',
      title: 'OTP Expiry Configuration',
      description: 'Configure OTP (One-Time Password) expiry to 5-10 minutes for enhanced security',
      status: 'warning',
      action: 'Configure in Supabase Dashboard',
      actionUrl: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/providers',
      implemented: false
    },
    {
      id: 'leaked-password-protection',
      title: 'Leaked Password Protection',
      description: 'Enable protection against commonly leaked passwords',
      status: 'warning',
      action: 'Enable in Auth Settings',
      actionUrl: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/providers',
      implemented: false
    },
    {
      id: 'email-rate-limiting',
      title: 'Email Rate Limiting',
      description: 'Configure rate limits for password reset and signup emails',
      status: 'warning',
      action: 'Configure Rate Limits',
      actionUrl: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/rate-limits',
      implemented: false
    },
    {
      id: 'session-security',
      title: 'Session Security Implementation',
      description: 'Advanced session validation, timeout, and concurrent session detection',
      status: 'secure',
      implemented: true
    }
  ];

  const authorizationConfig: SecurityConfigItem[] = [
    {
      id: 'secure-task-deletion',
      title: 'Secure Task Deletion',
      description: 'Server-side authorization for task deletion with audit logging',
      status: 'secure',
      implemented: true
    },
    {
      id: 'profile-management',
      title: 'Secure Profile Management',
      description: 'Role-based profile updates with privilege escalation prevention',
      status: 'secure',
      implemented: true
    },
    {
      id: 'rls-policies',
      title: 'Row Level Security Policies',
      description: 'Comprehensive RLS implementation across all sensitive tables',
      status: 'secure',
      implemented: true
    },
    {
      id: 'admin-functions',
      title: 'Administrative Functions',
      description: 'Secure functions for administrative operations with proper authorization',
      status: 'secure',
      implemented: true
    }
  ];

  const monitoringConfig: SecurityConfigItem[] = [
    {
      id: 'security-audit-logging',
      title: 'Security Audit Logging',
      description: 'Comprehensive logging of all security-related events',
      status: 'secure',
      implemented: true
    },
    {
      id: 'suspicious-activity-detection',
      title: 'Suspicious Activity Detection',
      description: 'Real-time monitoring and alerting for suspicious activities',
      status: 'secure',
      implemented: true
    },
    {
      id: 'customer-data-protection',
      title: 'Customer Data Protection',
      description: 'Advanced masking and access control for sensitive customer data',
      status: 'secure',
      implemented: true
    },
    {
      id: 'security-dashboard',
      title: 'Security Dashboard',
      description: 'Real-time security monitoring and metrics dashboard',
      status: 'secure',
      implemented: true
    }
  ];

  const getStatusIcon = (status: SecurityConfigItem['status']) => {
    switch (status) {
      case 'secure':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'critical':
        return <Shield className="h-5 w-5 text-red-600" />;
    }
  };

  const getStatusBadge = (status: SecurityConfigItem['status']) => {
    const variants = {
      secure: 'default',
      warning: 'secondary',
      critical: 'destructive'
    } as const;
    
    const labels = {
      secure: 'Secure',
      warning: 'Needs Attention',
      critical: 'Critical'
    };

    return (
      <Badge variant={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const ConfigurationSection: React.FC<{ 
    title: string; 
    items: SecurityConfigItem[]; 
    icon: React.ReactNode 
  }> = ({ title, items, icon }) => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      
      <div className="grid gap-4">
        {items.map((item) => (
          <Card key={item.id} className="border-l-4 border-l-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(item.status)}
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
                {getStatusBadge(item.status)}
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-3">
                {item.description}
              </CardDescription>
              
              {item.action && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => item.actionUrl && window.open(item.actionUrl, '_blank')}
                    className="flex items-center space-x-1"
                  >
                    <span>{item.action}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const secureCount = [
    ...authenticationConfig,
    ...authorizationConfig, 
    ...monitoringConfig
  ].filter(item => item.status === 'secure').length;
  
  const warningCount = [
    ...authenticationConfig,
    ...authorizationConfig, 
    ...monitoringConfig
  ].filter(item => item.status === 'warning').length;
  
  const criticalCount = [
    ...authenticationConfig,
    ...authorizationConfig, 
    ...monitoringConfig
  ].filter(item => item.status === 'critical').length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center space-x-2">
          <Shield className="h-8 w-8 text-primary" />
          <span>Security Configuration Center</span>
        </h1>
        <p className="text-muted-foreground">
          Comprehensive security configuration and monitoring for your application
        </p>
      </div>

      {/* Security Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-600">{secureCount}</p>
                <p className="text-sm text-muted-foreground">Secure Configurations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{warningCount}</p>
                <p className="text-sm text-muted-foreground">Need Attention</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
                <p className="text-sm text-muted-foreground">Critical Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Alerts */}
      {warningCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Action Required:</strong> {warningCount} security configuration{warningCount > 1 ? 's' : ''} need{warningCount === 1 ? 's' : ''} attention. 
            Please review the Authentication settings and configure the highlighted items in your Supabase dashboard.
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="authentication" className="flex items-center space-x-1">
            <Lock className="h-4 w-4" />
            <span>Authentication</span>
          </TabsTrigger>
          <TabsTrigger value="authorization" className="flex items-center space-x-1">
            <Users className="h-4 w-4" />
            <span>Authorization</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center space-x-1">
            <Eye className="h-4 w-4" />
            <span>Monitoring</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="authentication" className="mt-6">
          <ConfigurationSection
            title="Authentication Security"
            items={authenticationConfig}
            icon={<Lock className="h-5 w-5 text-primary" />}
          />
        </TabsContent>

        <TabsContent value="authorization" className="mt-6">
          <ConfigurationSection
            title="Authorization & Access Control"
            items={authorizationConfig}
            icon={<Users className="h-5 w-5 text-primary" />}
          />
        </TabsContent>

        <TabsContent value="monitoring" className="mt-6">
          <ConfigurationSection
            title="Security Monitoring & Audit"
            items={monitoringConfig}
            icon={<Eye className="h-5 w-5 text-primary" />}
          />
        </TabsContent>
      </Tabs>

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Next Steps</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p>1. <strong>Configure Authentication Settings:</strong> Visit the Supabase Auth dashboard to configure OTP expiry and leaked password protection.</p>
            <p>2. <strong>Review Security Logs:</strong> Monitor the Security Dashboard for any suspicious activities.</p>
            <p>3. <strong>Regular Security Audits:</strong> Perform monthly security reviews using the Security Scanner.</p>
            <p>4. <strong>User Training:</strong> Ensure all administrators understand the security policies and procedures.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SecurityConfigurationEnhanced;
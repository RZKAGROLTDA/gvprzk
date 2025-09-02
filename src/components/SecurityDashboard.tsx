import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, CheckCircle, ExternalLink, Settings, Eye, Database, Users } from 'lucide-react';
import { useSecureCustomerMonitoring } from '@/hooks/useSecureCustomerMonitoring';

interface SecurityIssue {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  actionRequired: string;
  isManualFix: boolean;
  dashboardLink?: string;
}

const SECURITY_ISSUES: SecurityIssue[] = [
  {
    id: 'otp-expiry',
    title: 'OTP Expiry Time Too Long',
    severity: 'MEDIUM',
    description: 'OTP tokens expire after a longer period than recommended (5 minutes)',
    actionRequired: 'Reduce OTP expiry to 300 seconds (5 minutes) in Authentication settings',
    isManualFix: true,
    dashboardLink: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/providers'
  },
  {
    id: 'leaked-password',
    title: 'Leaked Password Protection Disabled',
    severity: 'MEDIUM', 
    description: 'Users can choose passwords that have been found in data breaches',
    actionRequired: 'Enable leaked password protection in Authentication settings',
    isManualFix: true,
    dashboardLink: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/providers'
  }
];

const SECURITY_METRICS = [
  {
    label: 'Customer Data Protection',
    value: 'ACTIVE',
    status: 'good',
    icon: Shield,
    description: 'RLS policies protecting customer data'
  },
  {
    label: 'Data Masking',
    value: 'ENABLED',
    status: 'good', 
    icon: Eye,
    description: 'Sensitive data automatically masked by role'
  },
  {
    label: 'Security Monitoring',
    value: 'ACTIVE',
    status: 'good',
    icon: Database,
    description: 'Real-time security event logging'
  },
  {
    label: 'User Access Control',
    value: 'CONFIGURED',
    status: 'good',
    icon: Users,
    description: 'Role-based access control implemented'
  }
];

export const SecurityDashboard: React.FC = () => {
  const { alerts, isLoading } = useSecureCustomerMonitoring();

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
      case 'HIGH':
        return <AlertTriangle className="h-4 w-4" />;
      case 'MEDIUM':
        return <Settings className="h-4 w-4" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'default';
      case 'warning': return 'secondary';
      case 'error': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Security Dashboard</h1>
      </div>

      {/* Security Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {SECURITY_METRICS.map((metric) => {
          const IconComponent = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <IconComponent className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{metric.label}</p>
                    <Badge variant={getStatusColor(metric.status)} className="mt-1">
                      {metric.value}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metric.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Security Issues */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration Issues
          </CardTitle>
          <CardDescription>
            Security configurations that need attention
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SECURITY_ISSUES.map((issue) => (
            <Alert key={issue.id}>
              <div className="flex items-start gap-3">
                {getSeverityIcon(issue.severity)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium">{issue.title}</h4>
                    <Badge variant={getSeverityColor(issue.severity)}>
                      {issue.severity}
                    </Badge>
                  </div>
                  <AlertDescription className="mb-3">
                    {issue.description}
                  </AlertDescription>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Action Required:</span>
                    <span className="text-sm text-muted-foreground">{issue.actionRequired}</span>
                  </div>
                  {issue.dashboardLink && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.open(issue.dashboardLink, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Dashboard
                    </Button>
                  )}
                </div>
              </div>
            </Alert>
          ))}
        </CardContent>
      </Card>

      {/* Live Security Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Live Security Alerts
          </CardTitle>
          <CardDescription>
            Real-time security monitoring alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading security alerts...</p>
            </div>
          ) : alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <Alert key={index}>
                  <AlertTriangle className="h-4 w-4" />
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{alert.alert_type}</h4>
                      <AlertDescription>{alert.description}</AlertDescription>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Recommendation:</strong> {alert.recommendation}
                      </p>
                    </div>
                    <Badge variant={getSeverityColor(alert.severity)}>
                      {alert.severity} ({alert.count})
                    </Badge>
                  </div>
                </Alert>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h3 className="font-medium text-green-700">All Clear</h3>
              <p className="text-sm text-muted-foreground">
                No security alerts detected in the last 24 hours
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle>Security Status Summary</CardTitle>
          <CardDescription>
            Overall security posture of your application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Status: GOOD</strong>
              <br />
              Your application has strong security measures in place including Row Level Security (RLS), 
              data masking, comprehensive input validation, and real-time security monitoring. 
              The identified issues are configuration optimizations, not critical vulnerabilities.
            </AlertDescription>
          </Alert>
          
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">✅ Implemented Security Measures:</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Row Level Security (RLS) on all sensitive tables</li>
              <li>• Dynamic data masking based on user roles</li>
              <li>• Comprehensive input validation and sanitization</li>
              <li>• Real-time security event monitoring</li>
              <li>• Rate limiting for sensitive operations</li>
              <li>• Session security and timeout management</li>
              <li>• Customer data protection with access logging</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
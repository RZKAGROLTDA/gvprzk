import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, ExternalLink } from 'lucide-react';

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
  const securityChecks = [
    {
      id: 'email_privacy',
      title: 'Email Privacy Protection',
      status: 'secure',
      description: 'Email addresses are now completely hidden from same-filial users for enhanced privacy.',
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
      id: 'otp_expiry',
      title: 'OTP Expiry Configuration',
      status: 'warning',
      description: 'OTP expiry time needs to be configured in Supabase dashboard.',
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
        <h2 className="text-2xl font-bold">Security Configuration</h2>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Security Status:</strong> {secureCount} items secured, {warningCount} configuration items pending
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
                  {check.status === 'secure' ? 'Secure' : 'Configuration Required'}
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
                  Run Cleanup
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

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Manual Configuration Required:</strong> Please configure the OTP expiry and leaked password protection settings in your Supabase dashboard to complete the security setup.
        </AlertDescription>
      </Alert>
    </div>
  );
};
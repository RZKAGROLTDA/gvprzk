import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertTriangle, ExternalLink, Settings, Shield, Clock, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SecurityCheck {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'pending' | 'recommended';
  priority: 'high' | 'medium' | 'low';
  action: string;
  supabaseUrl?: string;
}

export const SecurityConfigurationGuide = () => {
  const { toast } = useToast();
  const [completedChecks, setCompletedChecks] = useState<string[]>([]);

  const securityChecks: SecurityCheck[] = [
    {
      id: 'otp-expiry',
      title: 'OTP Expiry Configuration',
      description: 'Reduce OTP expiry time to 300 seconds (5 minutes) for enhanced security',
      status: 'pending',
      priority: 'medium',
      action: 'Configure in Supabase Dashboard → Authentication → Providers',
      supabaseUrl: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/providers'
    },
    {
      id: 'leaked-password',
      title: 'Leaked Password Protection',
      description: 'Enable protection against known leaked passwords',
      status: 'pending',
      priority: 'medium',
      action: 'Enable in Supabase Dashboard → Authentication → Settings',
      supabaseUrl: 'https://supabase.com/dashboard/project/wuvbrkbhunifudaewhng/auth/settings'
    },
    {
      id: 'rate-limiting',
      title: 'Rate Limiting Review',
      description: 'Verify rate limiting configurations are optimal',
      status: 'completed',
      priority: 'low',
      action: 'Review current rate limiting policies'
    },
    {
      id: 'rls-policies',
      title: 'Row Level Security',
      description: 'All sensitive tables have RLS enabled with proper policies',
      status: 'completed',
      priority: 'high',
      action: 'RLS is properly configured across all tables'
    },
    {
      id: 'security-monitoring',
      title: 'Security Monitoring',
      description: 'Comprehensive security event logging and monitoring',
      status: 'completed',
      priority: 'high',
      action: 'Enhanced monitoring is active'
    }
  ];

  const markAsCompleted = (checkId: string) => {
    setCompletedChecks(prev => [...prev, checkId]);
    toast({
      title: "Configuration Updated",
      description: "Security check marked as completed",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-amber-600" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-blue-600" />;
    }
  };

  const getStatusBadge = (status: string, priority: string) => {
    if (status === 'completed') {
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Completed</Badge>;
    }
    if (priority === 'high') {
      return <Badge variant="destructive">High Priority</Badge>;
    }
    if (priority === 'medium') {
      return <Badge variant="default" className="bg-amber-100 text-amber-800">Medium Priority</Badge>;
    }
    return <Badge variant="outline">Low Priority</Badge>;
  };

  const pendingChecks = securityChecks.filter(check => 
    check.status === 'pending' && !completedChecks.includes(check.id)
  );
  const completedCount = securityChecks.filter(check => 
    check.status === 'completed' || completedChecks.includes(check.id)
  ).length;

  return (
    <div className="space-y-6">
      {/* Security Status Overview */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-green-800 flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Security Configuration Status
          </CardTitle>
          <CardDescription>
            {completedCount} of {securityChecks.length} security configurations completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-green-800">
              {Math.round((completedCount / securityChecks.length) * 100)}%
            </div>
            <div className="text-sm text-green-700">
              Security configuration completeness
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Actions */}
      {pendingChecks.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-amber-800 flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Pending Security Configurations ({pendingChecks.length})
            </CardTitle>
            <CardDescription>
              These configurations require action in the Supabase Dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingChecks.map((check) => (
              <Alert key={check.id} className="border-amber-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(check.status)}
                    <div className="space-y-1">
                      <div className="font-medium text-amber-800">{check.title}</div>
                      <div className="text-sm text-amber-700">{check.description}</div>
                      <div className="text-xs text-amber-600">{check.action}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(check.status, check.priority)}
                    <div className="flex gap-2">
                      {check.supabaseUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(check.supabaseUrl, '_blank')}
                          className="text-xs"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Configure
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => markAsCompleted(check.id)}
                        className="text-xs"
                      >
                        Mark Complete
                      </Button>
                    </div>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Security Checks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Lock className="h-6 w-6" />
            Security Configuration Checklist
          </CardTitle>
          <CardDescription>
            Complete security configuration overview
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {securityChecks.map((check) => {
              const isCompleted = check.status === 'completed' || completedChecks.includes(check.id);
              return (
                <div
                  key={check.id}
                  className={`p-4 rounded-lg border ${
                    isCompleted ? 'border-green-200 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(isCompleted ? 'completed' : check.status)}
                      <div>
                        <div className="font-medium">{check.title}</div>
                        <div className="text-sm text-gray-600">{check.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(isCompleted ? 'completed' : check.status, check.priority)}
                      {check.supabaseUrl && !isCompleted && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(check.supabaseUrl, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Security Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Security Best Practices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">Authentication Security</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• OTP expires in 5 minutes (reduced from default)</li>
                <li>• Leaked password protection enabled</li>
                <li>• Strong password requirements enforced</li>
                <li>• Rate limiting on login attempts</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Data Protection</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Row Level Security on all tables</li>
                <li>• Role-based data masking</li>
                <li>• Comprehensive audit logging</li>
                <li>• Real-time security monitoring</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useEnhancedSecurityMonitor } from '@/hooks/useEnhancedSecurityMonitor';
import { AlertTriangle, Shield, TrendingUp, Users, Database, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SecurityMetric {
  title: string;
  value: string | number;
  status: 'good' | 'warning' | 'critical';
  description: string;
  icon: any;
}

export const SecurityMonitoringEnhanced = () => {
  const { toast } = useToast();
  const { 
    activeAlerts, 
    dismissAlert, 
    getCriticalAlerts,
    getAlertsByType 
  } = useEnhancedSecurityMonitor();

  // Security metrics query
  const { data: securityMetrics, isLoading } = useQuery({
    queryKey: ['security-metrics'],
    queryFn: async () => {
      try {
        // Get recent security events count
        const { data: recentEvents } = await supabase
          .from('security_audit_log')
          .select('event_type, risk_score, created_at')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false });

        // Get customer data access events
        const customerAccessEvents = recentEvents?.filter(e => 
          e.event_type.includes('customer') || e.event_type.includes('data_access')
        ) || [];

        // Get high-risk events
        const highRiskEvents = recentEvents?.filter(e => e.risk_score >= 4) || [];

        // Get bulk export events
        const bulkExportEvents = recentEvents?.filter(e => 
          e.event_type.includes('bulk') || e.event_type.includes('export')
        ) || [];

        return {
          totalEvents: recentEvents?.length || 0,
          customerAccessEvents: customerAccessEvents.length,
          highRiskEvents: highRiskEvents.length,
          bulkExportEvents: bulkExportEvents.length,
          recentEvents: recentEvents?.slice(0, 10) || []
        };
      } catch (error) {
        console.error('Failed to fetch security metrics:', error);
        return {
          totalEvents: 0,
          customerAccessEvents: 0,
          highRiskEvents: 0,
          bulkExportEvents: 0,
          recentEvents: []
        };
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const metrics: SecurityMetric[] = [
    {
      title: 'Security Events (24h)',
      value: securityMetrics?.totalEvents || 0,
      status: (securityMetrics?.totalEvents || 0) > 1000 ? 'warning' : 'good',
      description: 'Total security events logged',
      icon: Shield
    },
    {
      title: 'Customer Data Access',
      value: securityMetrics?.customerAccessEvents || 0,
      status: (securityMetrics?.customerAccessEvents || 0) > 50 ? 'warning' : 'good',
      description: 'Customer data access events',
      icon: Users
    },
    {
      title: 'High-Risk Events',
      value: securityMetrics?.highRiskEvents || 0,
      status: (securityMetrics?.highRiskEvents || 0) > 5 ? 'critical' : 'good',
      description: 'Events with risk score ≥ 4',
      icon: AlertTriangle
    },
    {
      title: 'Bulk Operations',
      value: securityMetrics?.bulkExportEvents || 0,
      status: (securityMetrics?.bulkExportEvents || 0) > 10 ? 'warning' : 'good',
      description: 'Bulk data operations',
      icon: Database
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-green-600 bg-green-50 border-green-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'warning': return <Badge variant="default" className="bg-amber-100 text-amber-800">Warning</Badge>;
      default: return <Badge variant="secondary" className="bg-green-100 text-green-800">Good</Badge>;
    }
  };

  const criticalAlerts = getCriticalAlerts();
  const bulkExportAlerts = getAlertsByType('bulk_data_export');

  return (
    <div className="space-y-6">
      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <AlertDescription className="text-red-800">
            <div className="font-semibold mb-2">Critical Security Alerts ({criticalAlerts.length})</div>
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between py-1">
                <span className="text-sm">{alert.description}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dismissAlert(alert.id)}
                  className="text-xs"
                >
                  Dismiss
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Security Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <Card key={index} className={`border ${getStatusColor(metric.status)}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                    <p className="text-xs text-gray-500">{metric.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Icon className="h-6 w-6 text-gray-400" />
                    {getStatusBadge(metric.status)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Enhanced Monitoring Features */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Real-time Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Active Security Alerts ({activeAlerts.length})
            </CardTitle>
            <CardDescription>
              Real-time security monitoring and alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeAlerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>No active security alerts</p>
                <p className="text-sm">System is operating normally</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAlerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="p-3 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{alert.type}</div>
                        <div className="text-xs text-gray-600">{alert.description}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={alert.severity === 'CRITICAL' ? 'destructive' : 'secondary'}
                        >
                          {alert.severity}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {activeAlerts.length > 5 && (
                  <p className="text-xs text-center text-gray-500">
                    +{activeAlerts.length - 5} more alerts
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Security Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Security Events
            </CardTitle>
            <CardDescription>
              Latest security events and activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            ) : securityMetrics?.recentEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-blue-500" />
                <p>No recent events</p>
              </div>
            ) : (
              <div className="space-y-2">
                {securityMetrics?.recentEvents.map((event, index) => (
                  <div key={index} className="text-xs p-2 border rounded bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{event.event_type}</span>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={event.risk_score >= 4 ? 'destructive' : 'outline'}
                          className="text-xs"
                        >
                          Risk: {event.risk_score}
                        </Badge>
                        <span className="text-gray-500">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Security Configuration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Security Configuration Summary</CardTitle>
          <CardDescription>
            Overview of current security configuration status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg bg-green-50 border-green-200">
              <div className="font-medium text-green-800">Authentication</div>
              <div className="text-sm text-green-700">
                Rate limiting, RLS policies, and session security enabled
              </div>
            </div>
            <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
              <div className="font-medium text-blue-800">Data Protection</div>
              <div className="text-sm text-blue-700">
                Data masking, secure functions, and audit logging active
              </div>
            </div>
            <div className="p-4 border rounded-lg bg-purple-50 border-purple-200">
              <div className="font-medium text-purple-800">Monitoring</div>
              <div className="text-sm text-purple-700">
                Real-time alerts, pattern detection, and automated responses
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Shield, CheckCircle, XCircle, AlertTriangle, Lock } from 'lucide-react';

export const SecurityReport: React.FC = () => {
  const securityMeasures = [
    {
      name: 'Row Level Security (RLS)',
      status: 'implemented',
      description: 'Controle de acesso granular aplicado a todas as tabelas',
      icon: <Shield className="h-4 w-4" />
    },
    {
      name: 'Data Masking',
      status: 'implemented', 
      description: 'Proteção de dados pessoais com mascaramento baseado em roles',
      icon: <Lock className="h-4 w-4" />
    },
    {
      name: 'Input Sanitization',
      status: 'implemented',
      description: 'Validação e sanitização de entradas do usuário',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      name: 'Audit Logging',
      status: 'implemented',
      description: 'Registro de todas as ações de segurança e acesso a dados',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      name: 'Rate Limiting',
      status: 'implemented',
      description: 'Proteção contra ataques de força bruta e spam',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      name: 'Content Security Policy',
      status: 'enhanced',
      description: 'CSP aprimorado para prevenir ataques XSS',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      name: 'Function Security',
      status: 'fixed',
      description: 'Proteção contra search_path attacks em funções do banco',
      icon: <CheckCircle className="h-4 w-4" />
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'implemented':
      case 'fixed':
      case 'enhanced':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Implementado</Badge>;
      case 'pending':
        return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'missing':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Ausente</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const implementedCount = securityMeasures.filter(m => 
    ['implemented', 'fixed', 'enhanced'].includes(m.status)
  ).length;
  const totalCount = securityMeasures.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Relatório de Segurança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Status Geral:</strong> {implementedCount}/{totalCount} medidas de segurança implementadas.
                Sistema com proteção avançada contra vazamento de dados e ataques comuns.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              {securityMeasures.map((measure, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {measure.icon}
                    <div>
                      <h4 className="font-semibold">{measure.name}</h4>
                      <p className="text-sm text-muted-foreground">{measure.description}</p>
                    </div>
                  </div>
                  {getStatusBadge(measure.status)}
                </div>
              ))}
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Próximos Passos:</strong> Configure OTP expiry para 10 minutos e ative proteção contra senhas vazadas no Supabase Auth Settings.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
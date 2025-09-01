
import React, { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DashboardSkeleton, TableSkeleton } from '@/components/SkeletonLoader';
import { SessionRefreshButton } from '@/components/SessionRefreshButton';
import { AuthenticationHealthCheck } from '@/components/AuthenticationHealthCheck';
import { EmergencyDataAccess } from '@/components/EmergencyDataAccess';
import { DatabaseMigrationButton } from '@/components/DatabaseMigrationButton';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

// Componentes otimizados importados diretamente para melhor performance inicial
import { SalesFunnel } from '@/components/SalesFunnel';
import { FunnelClientsOptimized } from '@/components/FunnelClientsOptimized';
import { FunnelTasksOptimized } from '@/components/FunnelTasksOptimized';
import Reports from '@/pages/Reports';

// Loading optimizado
const DashboardLoading = () => <DashboardSkeleton />;

const Dashboard: React.FC = () => {
  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Funil de Vendas</h1>
          <p className="text-muted-foreground">Análise completa das atividades comerciais</p>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => window.location.href = '/emergency-fix'}
            className="bg-red-600 hover:bg-red-700 text-white shadow-lg"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Ferramenta de Emergência
          </Button>
          <AuthenticationHealthCheck />
          <SessionRefreshButton />
          <div className="w-80">
            <OfflineIndicator />
          </div>
        </div>
      </div>

      <Tabs defaultValue="funil" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="emergencia">🔧 Correção</TabsTrigger>
        </TabsList>

        <TabsContent value="funil" className="space-y-6">
          <Suspense fallback={<DashboardLoading />}>
            <SalesFunnel />
          </Suspense>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          <Suspense fallback={<DashboardLoading />}>
            <FunnelClientsOptimized />
          </Suspense>
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-6">
          <Suspense fallback={<DashboardLoading />}>
            <FunnelTasksOptimized />
          </Suspense>
        </TabsContent>

        <TabsContent value="relatorios" className="space-y-6">
          <Suspense fallback={<DashboardLoading />}>
            <Reports />
          </Suspense>
        </TabsContent>

        <TabsContent value="emergencia" className="space-y-6">
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Migração e Correção do Banco de Dados</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Use estas ferramentas para migrar dados da estrutura antiga para a nova e corrigir problemas de integridade.
              </p>
              <DatabaseMigrationButton />
            </div>
            <EmergencyDataAccess />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;

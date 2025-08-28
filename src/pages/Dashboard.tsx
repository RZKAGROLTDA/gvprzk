
import React, { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DashboardSkeleton, TableSkeleton } from '@/components/SkeletonLoader';
import { SessionRefreshButton } from '@/components/SessionRefreshButton';
import { AuthenticationHealthCheck } from '@/components/AuthenticationHealthCheck';
import { EmergencyDataAccess } from '@/components/EmergencyDataAccess';

// Componentes otimizados importados diretamente para melhor performance inicial
import { OpportunitiesDashboard } from '@/components/OpportunitiesDashboard';
import { OpportunitiesTable } from '@/components/OpportunitiesTable';
import { SalesFunnelOptimized } from '@/components/SalesFunnelOptimized';
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
          <h1 className="text-3xl font-bold">Dashboard de Oportunidades</h1>
          <p className="text-muted-foreground">Gestão completa do pipeline de vendas</p>
        </div>
        <div className="flex items-center gap-4">
          <AuthenticationHealthCheck />
          <SessionRefreshButton />
          <div className="w-80">
            <OfflineIndicator />
          </div>
        </div>
      </div>

      <Tabs defaultValue="oportunidades" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
          <TabsTrigger value="funil">Funil Antigo</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="emergencia">🔧 Correção</TabsTrigger>
        </TabsList>

        <TabsContent value="oportunidades" className="space-y-6">
          <Suspense fallback={<DashboardLoading />}>
            <OpportunitiesDashboard />
            <OpportunitiesTable />
          </Suspense>
        </TabsContent>

        <TabsContent value="funil" className="space-y-6">
          <Suspense fallback={<DashboardLoading />}>
            <SalesFunnelOptimized />
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
          <EmergencyDataAccess />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;

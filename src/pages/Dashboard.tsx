
import React, { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DashboardSkeleton, TableSkeleton } from '@/components/SkeletonLoader';
import { SessionRefreshButton } from '@/components/SessionRefreshButton';
import { AuthenticationHealthCheck } from '@/components/AuthenticationHealthCheck';

// Componentes otimizados importados diretamente para melhor performance inicial
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
          <h1 className="text-3xl font-bold">Funil de Vendas</h1>
          <p className="text-muted-foreground">Análise completa das atividades comerciais</p>
        </div>
        <div className="flex items-center gap-4">
          <AuthenticationHealthCheck />
          <SessionRefreshButton />
          <div className="w-80">
            <OfflineIndicator />
          </div>
        </div>
      </div>

      <Tabs defaultValue="funil" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  );
};

export default Dashboard;

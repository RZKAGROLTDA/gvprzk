
import React, { Suspense, lazy } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DashboardSkeleton } from '@/components/SkeletonLoader';
import { DashboardDataProvider } from '@/components/DashboardDataProvider';

// Lazy loading para melhor performance
const SalesFunnelOptimized = lazy(() => import('@/components/SalesFunnelOptimized'));
const FunnelClientsOptimized = lazy(() => import('@/components/FunnelClientsOptimized'));
const FunnelTasksOptimized = lazy(() => import('@/components/FunnelTasksOptimized'));

// Loading optimizado
const DashboardLoading = () => <DashboardSkeleton />;

const Dashboard: React.FC = () => {
  return (
    <DashboardDataProvider>
      <div className="p-6">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Funil de Vendas</h1>
            <p className="text-muted-foreground">Análise completa das atividades comerciais</p>
          </div>
          <div className="w-80">
            <OfflineIndicator />
          </div>
        </div>

        <Tabs defaultValue="funil" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          </TabsList>

          <TabsContent value="funil" className="space-y-6">
            <Suspense fallback={<DashboardSkeleton />}>
              <SalesFunnelOptimized />
            </Suspense>
          </TabsContent>

          <TabsContent value="clientes" className="space-y-6">
            <Suspense fallback={<DashboardSkeleton />}>
              <FunnelClientsOptimized />
            </Suspense>
          </TabsContent>

          <TabsContent value="tarefas" className="space-y-6">
            <Suspense fallback={<DashboardSkeleton />}>
              <FunnelTasksOptimized />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardDataProvider>
  );
};

export default Dashboard;

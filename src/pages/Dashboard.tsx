
import React, { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DashboardSkeleton, TableSkeleton } from '@/components/SkeletonLoader';

// Lazy load optimized components for better performance
const SalesFunnel = React.lazy(() => import('@/components/SalesFunnelOptimized').then(module => ({ default: module.SalesFunnelOptimized })));
const FunnelClients = React.lazy(() => import('@/components/FunnelClientsOptimized').then(module => ({ default: module.FunnelClientsOptimized })));
const FunnelTasks = React.lazy(() => import('@/components/FunnelTasksOptimized').then(module => ({ default: module.FunnelTasksOptimized })));

// Enhanced loading components with skeleton UI
const FunnelLoading = () => <DashboardSkeleton />;
const ClientsLoading = () => <TableSkeleton />;
const TasksLoading = () => <TableSkeleton />;

const Dashboard: React.FC = () => {
  return (
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
          <Suspense fallback={<FunnelLoading />}>
            <SalesFunnel />
          </Suspense>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          <Suspense fallback={<ClientsLoading />}>
            <FunnelClients />
          </Suspense>
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-6">
          <Suspense fallback={<TasksLoading />}>
            <FunnelTasks />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;

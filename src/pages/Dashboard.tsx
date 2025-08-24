
import React, { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfflineIndicator } from '@/components/OfflineIndicator';

// Lazy load heavy components to improve initial page load
const SalesFunnel = React.lazy(() => import('@/components/SalesFunnel').then(module => ({ default: module.SalesFunnel })));
const FunnelClients = React.lazy(() => import('@/components/FunnelClients').then(module => ({ default: module.FunnelClients })));
const FunnelTasks = React.lazy(() => import('@/components/FunnelTasks').then(module => ({ default: module.FunnelTasks })));

// Loading component for better UX
const TabLoading = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    <span className="ml-2 text-muted-foreground">Carregando...</span>
  </div>
);

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
          <Suspense fallback={<TabLoading />}>
            <SalesFunnel />
          </Suspense>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          <Suspense fallback={<TabLoading />}>
            <FunnelClients />
          </Suspense>
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-6">
          <Suspense fallback={<TabLoading />}>
            <FunnelTasks />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;

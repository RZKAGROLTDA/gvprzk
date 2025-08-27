import React, { Suspense, lazy } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { OfflineIndicator } from '@/components/OfflineIndicator';

// Lazy loading otimizado com preloading inteligente
const SalesFunnelOptimized = lazy(() => 
  import('@/components/SalesFunnelOptimized').then(module => ({
    default: module.SalesFunnelOptimized
  }))
);

const FunnelClientsOptimized = lazy(() => 
  import('@/components/FunnelClientsOptimized').then(module => ({
    default: module.FunnelClientsOptimized
  }))
);

const FunnelTasksOptimized = lazy(() => 
  import('@/components/FunnelTasksOptimized').then(module => ({
    default: module.FunnelTasksOptimized
  }))
);

// Loading skeleton otimizado para cada componente
const DashboardLoading = ({ component }: { component: 'funnel' | 'clients' | 'tasks' }) => (
  <div className="space-y-6">
    <div className="animate-pulse">
      <div className="h-8 bg-muted rounded w-48 mb-2"></div>
      <div className="h-4 bg-muted rounded w-96"></div>
    </div>
    
    {component === 'funnel' && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted rounded animate-pulse"></div>
        ))}
      </div>
    )}
    
    {component === 'clients' && (
      <div className="space-y-4">
        <div className="h-64 bg-muted rounded animate-pulse"></div>
        <div className="h-96 bg-muted rounded animate-pulse"></div>
      </div>
    )}
    
    {component === 'tasks' && (
      <div className="space-y-4">
        <div className="h-32 bg-muted rounded animate-pulse"></div>
        <div className="h-96 bg-muted rounded animate-pulse"></div>
      </div>
    )}
  </div>
);

export const LazyDashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground">
                Visão geral das atividades e performance comercial
              </p>
            </div>
            <OfflineIndicator />
          </div>

          <Tabs defaultValue="funil" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="funil">Funil</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
            </TabsList>

            <TabsContent value="funil" className="space-y-6">
              <Suspense fallback={<DashboardLoading component="funnel" />}>
                <SalesFunnelOptimized />
              </Suspense>
            </TabsContent>

            <TabsContent value="clientes" className="space-y-6">
              <Suspense fallback={<DashboardLoading component="clients" />}>
                <FunnelClientsOptimized />
              </Suspense>
            </TabsContent>

            <TabsContent value="tarefas" className="space-y-6">
              <Suspense fallback={<DashboardLoading component="tasks" />}>
                <FunnelTasksOptimized />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
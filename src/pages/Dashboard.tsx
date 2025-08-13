import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SalesFunnel } from '@/components/SalesFunnel';
import { FunnelClients } from '@/components/FunnelClients';
import { FunnelTasks } from '@/components/FunnelTasks';

const Dashboard: React.FC = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Funil de Vendas</h1>
        <p className="text-muted-foreground">Análise completa das atividades comerciais</p>
      </div>

      <Tabs defaultValue="funil" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>

        <TabsContent value="funil" className="space-y-6">
          <SalesFunnel />
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          <FunnelClients />
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-6">
          <FunnelTasks />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
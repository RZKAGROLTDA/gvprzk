import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Users, RotateCcw, BarChart3 } from 'lucide-react';
import { WeeklyAgenda } from '@/components/crm/WeeklyAgenda';
import { ClientPortfolio } from '@/components/crm/ClientPortfolio';
import { Returns } from '@/components/crm/Returns';
import { CRMManagement } from '@/components/crm/CRMManagement';
import { useUserRole } from '@/hooks/useUserRole';

const CRM: React.FC = () => {
  const { isManager, isSupervisor } = useUserRole();
  const canManage = isManager || isSupervisor;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>CRM do Vendedor</CardTitle>
          <p className="text-sm text-muted-foreground">
            Agenda, carteira e retornos baseados em follow-ups (independente do módulo de tarefas).
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="agenda" className="w-full">
            <TabsList className={`grid w-full ${canManage ? 'grid-cols-4 max-w-2xl' : 'grid-cols-3 max-w-xl'}`}>
              <TabsTrigger value="agenda" className="gap-2">
                <CalendarDays className="h-4 w-4" /> Agenda Semanal
              </TabsTrigger>
              <TabsTrigger value="carteira" className="gap-2">
                <Users className="h-4 w-4" /> Carteira
              </TabsTrigger>
              <TabsTrigger value="retornos" className="gap-2">
                <RotateCcw className="h-4 w-4" /> Retornos
              </TabsTrigger>
              {canManage && (
                <TabsTrigger value="gerencial" className="gap-2">
                  <BarChart3 className="h-4 w-4" /> Gerencial
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="agenda" className="mt-4">
              <WeeklyAgenda />
            </TabsContent>
            <TabsContent value="carteira" className="mt-4">
              <ClientPortfolio />
            </TabsContent>
            <TabsContent value="retornos" className="mt-4">
              <Returns />
            </TabsContent>
            {canManage && (
              <TabsContent value="gerencial" className="mt-4">
                <CRMManagement />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CRM;

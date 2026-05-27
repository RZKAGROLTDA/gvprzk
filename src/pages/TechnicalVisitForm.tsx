import React, { useState } from 'react';
import {
  TaskHeader,
  SummaryCards,
  NextActionCard,
  OpportunitySummary,
  EquipmentCard,
  MobileStickyFooter,
  type SummaryCardItem,
} from '@/components/task-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Tractor,
  ClipboardList,
  User2,
  Package,
  Coins,
  CalendarCheck2,
  Construction,
} from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import CreateTask from './CreateTask';
import { TaskFormSnapshotProvider } from '@/components/task-form/FieldVisitSnapshotContext';

/**
 * Visita Técnica — base visual (sem backend novo).
 *
 * Reaproveita todos os componentes executivos (TaskHeader, SummaryCards,
 * OpportunityScore, OpportunitySummary, EquipmentCard, NextActionCard,
 * MobileStickyFooter). Ainda não há gravação: este shell serve para
 * validar o layout antes de plugar um motor próprio. Quando o backend
 * existir, basta envolver com TaskFormSnapshotProvider + CreateTask
 * (taskType futuro="technical-visit") seguindo o padrão de FieldVisitForm.
 */
const TechnicalVisitForm: React.FC = () => {
  const { profile } = useProfile();
  const [activeTab, setActiveTab] = useState('cliente');

  const summary: SummaryCardItem[] = [
    {
      icon: Wrench,
      label: 'Serviços técnicos',
      value: '0',
      hint: 'Diagnóstico, garantia, manutenção',
      tone: 'primary',
    },
    {
      icon: Tractor,
      label: 'Equipamentos inspecionados',
      value: '0',
      hint: 'Família · número de série',
    },
    {
      icon: Coins,
      label: 'Valor estimado',
      value: 'R$ 0',
      hint: 'Calculado dos serviços',
    },
    {
      icon: CalendarCheck2,
      label: 'Próxima ação',
      value: 'A definir',
      hint: 'Agende um retorno técnico',
      tone: 'warning',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <TaskHeader
        title="Visita Técnica"
        subtitle="Inspeção técnica, diagnóstico e plano de serviço — em preparação."
        status={{ label: 'Preview', variant: 'outline' }}
        score={0}
        filial={profile?.filial_nome ?? undefined}
        consultant={profile?.name ?? undefined}
        backTo="/create-task"
      />

      <Alert>
        <Construction className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Visita Técnica</strong> — grava como atividade padrão (task_type=<code>technical_visit</code>),
          aparecendo no CRM, Agenda e Gerencial como "Visita Técnica". Use o formulário abaixo para registrar.
        </AlertDescription>
      </Alert>

      <SummaryCards items={summary} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cliente" className="gap-1.5">
            <User2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cliente</span>
          </TabsTrigger>
          <TabsTrigger value="equipamentos" className="gap-1.5">
            <Tractor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Equipamentos</span>
          </TabsTrigger>
          <TabsTrigger value="diagnostico" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Diagnóstico</span>
          </TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Plano</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cliente">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cliente atendido</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Aqui virão os dados do cliente, propriedade e contato técnico responsável.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipamentos">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Equipamentos inspecionados</CardTitle>
              <Badge variant="outline">0</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Listagem reutilizará <code className="text-xs">EquipmentCard</code> com campos
                adicionais (número de série, horímetro, status).
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 opacity-50 pointer-events-none">
                <EquipmentCard
                  item={{ id: 'preview-1', familyProduct: 'Trator (exemplo)', quantity: 1, hectares: 0 }}
                />
                <EquipmentCard
                  item={{ id: 'preview-2', familyProduct: 'Colheitadeira (exemplo)', quantity: 1 }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostico" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Diagnóstico técnico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Sintomas observados, códigos de falha, recomendações. Estrutura prevista:
              </p>
              <ul className="mt-3 list-disc pl-5 text-sm text-foreground/80 space-y-1">
                <li>Sintomas relatados pelo cliente</li>
                <li>Inspeção visual e leituras (horímetro, pressões, folgas)</li>
                <li>Códigos de erro / diagnóstico eletrônico</li>
                <li>Recomendação técnica</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plano" className="space-y-4">
          <OpportunitySummary totalValue={0} partsCount={0} servicesCount={0} />
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" /> Plano de serviço
              </CardTitle>
              <Badge variant="outline" className="font-mono">0</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Mesma separação Peças × Serviços usada em Visita à Fazenda e Ligação.
              </p>
            </CardContent>
          </Card>
          <NextActionCard empty />
        </TabsContent>
      </Tabs>

      <MobileStickyFooter score={0}>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Preview · sem gravação
        </span>
      </MobileStickyFooter>
    </div>
  );
};

export default TechnicalVisitForm;

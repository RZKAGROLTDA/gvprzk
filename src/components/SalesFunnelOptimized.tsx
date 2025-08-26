import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Calendar, TrendingUp, Users, DollarSign, Target, Filter } from 'lucide-react';
import { useTasksOptimized, useConsultants, useFiliais } from '@/hooks/useTasksOptimized';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { mapSalesStatus, resolveFilialName, calculateSalesValue } from '@/lib/taskStandardization';
import { Task } from '@/types/task';

interface SalesFunnelData {
  name: string;
  value: number;
  color: string;
}

interface CoverageData {
  name: string;
  value: number;
  percentage: number;
}

interface ClientDetails {
  client: string;
  filial: string;
  totalVisits: number;
  totalCalls: number;
  totalChecklists: number;
  prospects: number;
  salesValue: number;
  lastActivity: Date;
  responsible: string;
}

export const SalesFunnelOptimized: React.FC = () => {
  const { tasks, loading } = useTasksOptimized();
  const { data: consultants = [], isLoading: consultantsLoading } = useConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();

  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details'>('overview');
  
  // Filtros otimizados
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');

  // Filtrar tarefas - super otimizado
  const filteredTasks = useMemo(() => {
    if (!tasks.length) return [];

    const now = new Date();
    const daysAgo = parseInt(selectedPeriod);
    const periodStart = subDays(now, daysAgo);

    // Um único loop de filtro para máxima performance
    return tasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      
      // Filtros aplicados sequencialmente para sair cedo
      if (taskDate < periodStart) return false;
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) return false;
      }
      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return false;
      if (selectedActivity !== 'all' && task.taskType !== selectedActivity) return false;

      return true;
    });
  }, [tasks, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity, consultants]);

  // Dados do funil - super otimizado com um único loop
  const funnelData = useMemo(() => {
    if (!filteredTasks.length) {
      return {
        contacts: { total: 0, visitas: 0, ligacoes: 0, checklists: 0 },
        prospects: { total: 0, abertas: 0, fechadas: 0, perdidas: 0, totalValue: 0 },
        sales: { confirmadas: 0, parciais: 0, total: 0 }
      };
    }

    // Inicialização de contadores
    let totalVisitas = 0, totalLigacoes = 0, totalChecklists = 0;
    let prospects = 0, openProspects = 0, closedWon = 0, closedLost = 0;
    let totalProspectValue = 0;
    let confirmadas = 0, parciais = 0;

    // Um único loop otimizado
    for (const task of filteredTasks) {
      // Contatos
      switch (task.taskType) {
        case 'prospection': 
          totalVisitas++; 
          break;
        case 'ligacao': 
          totalLigacoes++; 
          break;
        case 'checklist': 
          totalChecklists++; 
          break;
      }

      // Prospecções
      if (task.isProspect) {
        prospects++;
        totalProspectValue += calculateSalesValue(task);
        
        if (task.status === 'pending') {
          openProspects++;
        }
      }

      // Vendas - CORRIGIDO para usar sales_type
      const salesStatus = mapSalesStatus(task);
      if (salesStatus === 'ganho' || salesStatus === 'parcial') {
        closedWon++;
        if (salesStatus === 'ganho') {
          confirmadas++;
        } else if (salesStatus === 'parcial') {
          parciais++;
        }
      } else if (task.isProspect && task.status === 'closed') {
        closedLost++;
      }
    }

    return {
      contacts: {
        total: totalVisitas + totalLigacoes + totalChecklists,
        visitas: totalVisitas,
        ligacoes: totalLigacoes,
        checklists: totalChecklists
      },
      prospects: {
        total: prospects,
        abertas: openProspects,
        fechadas: closedWon,
        perdidas: closedLost,
        totalValue: totalProspectValue
      },
      sales: {
        confirmadas,
        parciais,
        total: confirmadas + parciais
      }
    };
  }, [filteredTasks]);

  // Dados de cobertura - otimizado com Set
  const coverageData = useMemo(() => {
    if (!filteredTasks.length) {
      return [
        { name: 'Clientes com Visitas', value: 0, percentage: 0 },
        { name: 'Clientes com Propostas', value: 0, percentage: 0 },
        { name: 'Clientes com Vendas', value: 0, percentage: 0 }
      ];
    }

    const uniqueClients = new Set<string>();
    const clientsWithVisits = new Set<string>();
    const clientsWithProposals = new Set<string>();
    const clientsWithSales = new Set<string>();

    for (const task of filteredTasks) {
      uniqueClients.add(task.client);
      
      if (task.taskType === 'prospection') {
        clientsWithVisits.add(task.client);
      }
      if (task.isProspect) {
        clientsWithProposals.add(task.client);
      }
      if (task.salesConfirmed) {
        clientsWithSales.add(task.client);
      }
    }

    const totalClients = uniqueClients.size || 1;

    return [
      {
        name: 'Clientes com Visitas',
        value: clientsWithVisits.size,
        percentage: Math.round(clientsWithVisits.size / totalClients * 100)
      },
      {
        name: 'Clientes com Propostas',
        value: clientsWithProposals.size,
        percentage: Math.round(clientsWithProposals.size / totalClients * 100)
      },
      {
        name: 'Clientes com Vendas',
        value: clientsWithSales.size,
        percentage: Math.round(clientsWithSales.size / totalClients * 100)
      }
    ];
  }, [filteredTasks]);

  // Detalhes por cliente - otimizado
  const clientDetails = useMemo(() => {
    if (!filteredTasks.length || activeView !== 'details') return [];

    const clientMap = new Map<string, ClientDetails>();
    
    for (const task of filteredTasks) {
      const key = `${task.client}-${task.filial}`;
      
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          client: task.client,
          filial: resolveFilialName(task.filial),
          totalVisits: 0,
          totalCalls: 0,
          totalChecklists: 0,
          prospects: 0,
          salesValue: 0,
          lastActivity: task.createdAt,
          responsible: task.responsible
        });
      }

      const client = clientMap.get(key)!;
      
      // Incrementar contadores
      switch (task.taskType) {
        case 'prospection': client.totalVisits++; break;
        case 'ligacao': client.totalCalls++; break;
        case 'checklist': client.totalChecklists++; break;
      }
      
      if (task.isProspect) client.prospects++;
      client.salesValue += calculateSalesValue(task);
      
      if (task.createdAt > client.lastActivity) {
        client.lastActivity = task.createdAt;
      }
    }

    return Array.from(clientMap.values())
      .sort((a, b) => b.salesValue - a.salesValue)
      .slice(0, 20); // Limitar para performance
  }, [filteredTasks, activeView]);

  const isLoading = loading || consultantsLoading || filiaisLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Carregando análise...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Análise Gerencial</h1>
          <p className="text-muted-foreground">Performance comercial ({filteredTasks.length} atividades)</p>
        </div>
      </div>

      {/* Filtros compactos */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
              <SelectTrigger>
                <SelectValue placeholder="Consultor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {consultants.slice(0, 10).map(consultant => (
                  <SelectItem key={consultant.id} value={consultant.id}>
                    {consultant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedFilial} onValueChange={setSelectedFilial}>
              <SelectTrigger>
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filiais.slice(0, 10).map(filial => (
                  <SelectItem key={filial.id} value={filial.nome}>
                    {filial.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedActivity} onValueChange={setSelectedActivity}>
              <SelectTrigger>
                <SelectValue placeholder="Atividade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="prospection">Visitas</SelectItem>
                <SelectItem value="ligacao">Ligações</SelectItem>
                <SelectItem value="checklist">Checklists</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: 'overview', icon: Calendar, title: 'Visão Geral' },
          { key: 'funnel', icon: TrendingUp, title: 'Funil' },
          { key: 'coverage', icon: Users, title: 'Cobertura' },
          { key: 'details', icon: DollarSign, title: 'Detalhes' }
        ].map(({ key, icon: Icon, title }) => (
          <Card 
            key={key}
            className={`cursor-pointer transition-all hover:shadow-md ${activeView === key ? 'ring-2 ring-primary' : ''}`} 
            onClick={() => setActiveView(key as any)}
          >
            <CardHeader className="text-center pb-3">
              <Icon className="h-6 w-6 mx-auto text-primary" />
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Content otimizado baseado na view ativa */}
      {activeView === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Contatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{funnelData.contacts.total}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Visitas: {funnelData.contacts.visitas}</div>
                <div>Ligações: {funnelData.contacts.ligacoes}</div>
                <div>Checklists: {funnelData.contacts.checklists}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Prospecções</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{funnelData.prospects.total}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Abertas: {funnelData.prospects.abertas}</div>
                <div>Fechadas: {funnelData.prospects.fechadas}</div>
                <div>Valor: R$ {funnelData.prospects.totalValue.toLocaleString('pt-BR')}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{funnelData.sales.total}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Confirmadas: {funnelData.sales.confirmadas}</div>
                <div>Parciais: {funnelData.sales.parciais}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeView === 'funnel' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Funil de Conversão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-primary/10 rounded">
                  <span>Contatos</span>
                  <Badge variant="secondary">{funnelData.contacts.total}</Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-orange-100 rounded">
                  <span>Prospecções</span>
                  <Badge variant="secondary">{funnelData.prospects.total}</Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-100 rounded">
                  <span>Vendas</span>
                  <Badge variant="secondary">{funnelData.sales.total}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribuição de Atividades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Visitas', value: funnelData.contacts.visitas, fill: '#8884d8' },
                        { name: 'Ligações', value: funnelData.contacts.ligacoes, fill: '#82ca9d' },
                        { name: 'Checklists', value: funnelData.contacts.checklists, fill: '#ffc658' }
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeView === 'coverage' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {coverageData.map((item, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{item.value}</div>
                <div className="text-sm text-muted-foreground">
                  {item.percentage}% da base
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeView === 'details' && (
        <Card>
          <CardHeader>
            <CardTitle>Top 20 Clientes por Valor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Filial</TableHead>
                    <TableHead>Visitas</TableHead>
                    <TableHead>Ligações</TableHead>
                    <TableHead>Prospects</TableHead>
                    <TableHead>Valor (R$)</TableHead>
                    <TableHead>Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientDetails.map((client, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{client.client}</TableCell>
                      <TableCell>{client.filial}</TableCell>
                      <TableCell>{client.totalVisits}</TableCell>
                      <TableCell>{client.totalCalls}</TableCell>
                      <TableCell>{client.prospects}</TableCell>
                      <TableCell className="font-medium">
                        {client.salesValue.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>{client.responsible}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
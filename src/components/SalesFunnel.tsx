import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Calendar, TrendingUp, Users, DollarSign, Target, Filter } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

export const SalesFunnel: React.FC = () => {
  const { tasks, loading } = useTasks();
  const { user } = useAuth();
  const [consultants, setConsultants] = useState<any[]>([]);
  const [filiais, setFiliais] = useState<any[]>([]);
  
  // Filtros
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');

  // Carregar consultores e filiais
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .eq('approval_status', 'approved');
        
        const { data: filiaisData } = await supabase
          .from('filiais')
          .select('*')
          .order('nome');

        setConsultants(profilesData || []);
        setFiliais(filiaisData || []);
      } catch (error) {
        console.error('Erro ao carregar filtros:', error);
      }
    };

    loadFilters();
  }, []);

  // Filtrar tarefas baseado nos filtros selecionados
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      const now = new Date();
      const daysAgo = parseInt(selectedPeriod);
      const periodStart = subDays(now, daysAgo);

      // Filtro de período
      if (taskDate < periodStart) return false;

      // Filtro de consultor
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) return false;
      }

      // Filtro de filial
      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return false;

      // Filtro de tipo de atividade
      if (selectedActivity !== 'all' && task.taskType !== selectedActivity) return false;

      return true;
    });

    return filtered;
  }, [tasks, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity, consultants]);

  // Dados do funil de vendas
  const funnelData = useMemo(() => {
    const totalContacts = filteredTasks.length;
    const prospects = filteredTasks.filter(task => task.isProspect).length;
    const openProspects = filteredTasks.filter(task => task.isProspect && task.status === 'pending').length;
    const closedWon = filteredTasks.filter(task => task.salesConfirmed).length;
    const closedLost = filteredTasks.filter(task => task.isProspect && task.status === 'closed' && !task.salesConfirmed).length;
    const totalSalesValue = filteredTasks.reduce((sum, task) => sum + (task.salesValue || 0), 0);

    return [
      { name: 'Contatos com Clientes', value: totalContacts, color: '#8884d8' },
      { name: 'Prospecções Criadas', value: prospects, color: '#82ca9d' },
      { name: 'Abertas', value: openProspects, color: '#ffc658' },
      { name: 'Fechadas (Ganhas)', value: closedWon, color: '#00ff00' },
      { name: 'Perdidas', value: closedLost, color: '#ff0000' },
    ];
  }, [filteredTasks]);

  // Dados de cobertura de carteira
  const coverageData = useMemo(() => {
    const uniqueClients = new Set(filteredTasks.map(task => task.client));
    const clientsWithVisits = new Set(filteredTasks.filter(task => task.taskType === 'prospection').map(task => task.client));
    const clientsWithProposals = new Set(filteredTasks.filter(task => task.isProspect).map(task => task.client));
    const clientsWithSales = new Set(filteredTasks.filter(task => task.salesConfirmed).map(task => task.client));

    const totalClients = uniqueClients.size || 1; // Evitar divisão por zero

    return [
      {
        name: 'Clientes com Visitas',
        value: clientsWithVisits.size,
        percentage: Math.round((clientsWithVisits.size / totalClients) * 100)
      },
      {
        name: 'Clientes com Propostas',
        value: clientsWithProposals.size,
        percentage: Math.round((clientsWithProposals.size / totalClients) * 100)
      },
      {
        name: 'Clientes com Vendas',
        value: clientsWithSales.size,
        percentage: Math.round((clientsWithSales.size / totalClients) * 100)
      }
    ];
  }, [filteredTasks]);

  // Detalhes por cliente
  const clientDetails = useMemo(() => {
    const clientMap = new Map<string, ClientDetails>();

    filteredTasks.forEach(task => {
      const key = `${task.client}-${task.filial}`;
      
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          client: task.client,
          filial: task.filial || '',
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
      
      if (task.taskType === 'prospection') client.totalVisits++;
      if (task.taskType === 'ligacao') client.totalCalls++;
      if (task.taskType === 'checklist') client.totalChecklists++;
      if (task.isProspect) client.prospects++;
      
      client.salesValue += task.salesValue || 0;
      
      if (task.createdAt > client.lastActivity) {
        client.lastActivity = task.createdAt;
      }
    });

    return Array.from(clientMap.values()).sort((a, b) => b.salesValue - a.salesValue);
  }, [filteredTasks]);

  const totalSalesValue = filteredTasks.reduce((sum, task) => sum + (task.salesValue || 0), 0);
  const conversionRate = funnelData[0]?.value ? Math.round((funnelData[3]?.value / funnelData[0]?.value) * 100) : 0;

  const chartConfig = {
    value: {
      label: "Quantidade",
      color: "hsl(var(--chart-1))",
    },
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Funil de Vendas & Cobertura</h1>
          <p className="text-muted-foreground">Análise de performance comercial e cobertura de carteira</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtros aplicados</span>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Filtros de Análise</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Consultor</label>
              <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os consultores</SelectItem>
                  {consultants.map(consultant => (
                    <SelectItem key={consultant.id} value={consultant.id}>
                      {consultant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Filial</label>
              <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {filiais.map(filial => (
                    <SelectItem key={filial.id} value={filial.nome}>
                      {filial.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Atividade</label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as atividades</SelectItem>
                  <SelectItem value="prospection">Visitas</SelectItem>
                  <SelectItem value="ligacao">Ligações</SelectItem>
                  <SelectItem value="checklist">Checklists</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Indicadores principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Contatos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{funnelData[0]?.value || 0}</div>
            <p className="text-xs text-muted-foreground">Atividades registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">De contatos para vendas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              }).format(totalSalesValue)}
            </div>
            <p className="text-xs text-muted-foreground">Em oportunidades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Únicos</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Set(filteredTasks.map(t => t.client)).size}</div>
            <p className="text-xs text-muted-foreground">No período selecionado</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil de Vendas */}
        <Card>
          <CardHeader>
            <CardTitle>Funil de Vendas</CardTitle>
            <CardDescription>Fluxo de conversão das atividades comerciais</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="min-h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={funnelData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="hsl(var(--chart-1))" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Cobertura de Carteira */}
        <Card>
          <CardHeader>
            <CardTitle>Cobertura de Carteira</CardTitle>
            <CardDescription>Distribuição da cobertura por tipo de interação</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="min-h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={coverageData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {coverageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de detalhes por cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes por Cliente</CardTitle>
          <CardDescription>Breakdown detalhado das atividades por cliente</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Consultor</TableHead>
                <TableHead>Visitas</TableHead>
                <TableHead>Ligações</TableHead>
                <TableHead>Checklists</TableHead>
                <TableHead>Prospects</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Última Atividade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientDetails.slice(0, 10).map((client, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{client.client}</TableCell>
                  <TableCell>{client.filial}</TableCell>
                  <TableCell>{client.responsible}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{client.totalVisits}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{client.totalCalls}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{client.totalChecklists}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.prospects > 0 ? "default" : "outline"}>
                      {client.prospects}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format(client.salesValue)}
                  </TableCell>
                  <TableCell>
                    {format(client.lastActivity, 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {clientDetails.length > 10 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Mostrando 10 de {clientDetails.length} clientes. Use os filtros para refinar a busca.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Download, Search, Filter } from 'lucide-react';
import { useTasksOptimized, useConsultants, useFiliais } from '@/hooks/useTasksOptimized';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { useOpportunities } from '@/hooks/useOpportunities';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientData {
  name: string;
  classification: string;
  city: string;
  filial: string;
  responsible: string;
  lastVisit: Date | null;
  lastOpportunity: Date | null;
  hasActivity: boolean;
}

export const FunnelClientsOptimized: React.FC = () => {
  const { tasks, loading, refetch, forceRefresh } = useTasksOptimized();
  const { data: opportunities = [], isLoading: opportunitiesLoading } = useOpportunities();
  const { data: consultants = [], isLoading: consultantsLoading } = useConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();
  const { invalidateAll } = useSecurityCache();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('365');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [sortField, setSortField] = useState<keyof ClientData>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const clientsData = useMemo(() => {
    if (!tasks.length && !opportunities.length) return [];

    const clientMap = new Map<string, ClientData>();
    const now = new Date();
    const daysAgo = parseInt(selectedPeriod);
    const periodStart = daysAgo >= 9999 ? new Date(0) : subDays(now, daysAgo);
    const searchLower = searchTerm.toLowerCase();

    // Processar tasks
    for (const task of tasks) {
      const taskDate = new Date(task.createdAt);
      
      if (daysAgo < 9999 && taskDate < periodStart) continue;
      
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) continue;
      }

      if (selectedFilial !== 'all' && task.filial !== selectedFilial) continue;

      const clientKey = task.client;
      
      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          name: task.client,
          classification: 'A',
          city: task.property,
          filial: task.filial || '',
          responsible: task.responsible,
          lastVisit: null,
          lastOpportunity: null,
          hasActivity: false
        });
      }

      const client = clientMap.get(clientKey)!;
      client.hasActivity = true;

      if (task.taskType === 'prospection' && (!client.lastVisit || taskDate > client.lastVisit)) {
        client.lastVisit = taskDate;
      }

      if (task.isProspect && (!client.lastOpportunity || taskDate > client.lastOpportunity)) {
        client.lastOpportunity = taskDate;
      }
    }

    // Processar opportunities
    for (const opp of opportunities) {
      const oppDate = new Date(opp.data_criacao);
      
      if (daysAgo < 9999 && oppDate < periodStart) continue;
      if (selectedFilial !== 'all' && opp.filial !== selectedFilial) continue;

      const clientKey = opp.cliente_nome;
      
      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          name: opp.cliente_nome,
          classification: 'A',
          city: '',
          filial: opp.filial || '',
          responsible: '',
          lastVisit: null,
          lastOpportunity: oppDate,
          hasActivity: true
        });
      } else {
        const client = clientMap.get(clientKey)!;
        if (!client.lastOpportunity || oppDate > client.lastOpportunity) {
          client.lastOpportunity = oppDate;
        }
      }
    }

    // Converter para array e aplicar filtros
    let clientsArray = Array.from(clientMap.values());

    // Filtro de busca
    if (searchTerm) {
      clientsArray = clientsArray.filter(client =>
        client.name.toLowerCase().includes(searchLower)
      );
    }

    // Ordenação otimizada
    clientsArray.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortDirection === 'asc' ? 1 : -1;
      if (bValue === null) return sortDirection === 'asc' ? -1 : 1;
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return clientsArray.slice(0, 50); // Limitar para performance
  }, [tasks, opportunities, searchTerm, selectedPeriod, selectedConsultant, selectedFilial, sortField, sortDirection, consultants]);

  const handleSort = (field: keyof ClientData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const totalClients = clientsData.length;
  const clientsWithActivity = clientsData.filter(c => c.hasActivity).length;
  const coveragePercentage = totalClients > 0 ? Math.round((clientsWithActivity / totalClients) * 100) : 0;

  // Auto-refresh when window gains focus to sync changes
  useEffect(() => {
    const handleFocus = () => {
      if (document.hasFocus()) {
        refetch();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  const isLoading = loading || opportunitiesLoading || consultantsLoading || filiaisLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Carregando clientes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground">No período selecionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes com Atividade</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsWithActivity}</div>
            <p className="text-xs text-muted-foreground">Pelo menos 1 atividade</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">% Cobertura da Base</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coveragePercentage}%</div>
            <p className="text-xs text-muted-foreground">Clientes com atividades</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Busca</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar Cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome do cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

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
                  <SelectItem value="9999">Todos os registros</SelectItem>
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
              <label className="text-sm font-medium">Exportar</label>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Excel/PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Clientes */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
          <CardDescription>
            Detalhamento por cliente com histórico de atividades ({totalClients} clientes encontrados)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  Nome do Cliente {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('classification')}>
                  Classificação {sortField === 'classification' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('city')}>
                  Cidade {sortField === 'city' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('filial')}>
                  Filial {sortField === 'filial' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('responsible')}>
                  Consultor Responsável {sortField === 'responsible' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('lastVisit')}>
                  Última Visita {sortField === 'lastVisit' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('lastOpportunity')}>
                  Última Oportunidade {sortField === 'lastOpportunity' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsData.map((client, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{client.classification}</Badge>
                  </TableCell>
                  <TableCell>{client.city}</TableCell>
                  <TableCell>{client.filial}</TableCell>
                  <TableCell>{client.responsible}</TableCell>
                  <TableCell>
                    {client.lastVisit ? format(client.lastVisit, 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                  </TableCell>
                  <TableCell>
                    {client.lastOpportunity ? format(client.lastOpportunity, 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {clientsData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum cliente encontrado com os filtros aplicados.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
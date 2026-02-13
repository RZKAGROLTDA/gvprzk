import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Download, Search, Filter } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
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

export const FunnelClients: React.FC = () => {
  const { tasks } = useTasks();
  const { consultants } = useFilteredConsultants();
  const [filiais, setFiliais] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [sortField, setSortField] = useState<keyof ClientData>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const loadFiliais = async () => {
      try {
        const { data: filiaisData } = await supabase
          .from('filiais')
          .select('*')
          .order('nome');

        setFiliais(filiaisData || []);
      } catch (error) {
        console.error('Erro ao carregar filiais:', error);
      }
    };

    loadFiliais();
  }, []);

  const clientsData = useMemo(() => {
    const clientMap = new Map<string, ClientData>();
    const now = new Date();
    const periodStart = subDays(now, parseInt(selectedPeriod));

    tasks.forEach(task => {
      const taskDate = new Date(task.createdAt);
      if (taskDate < periodStart) return;

      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) return;
      }

      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return;

      const clientKey = task.client;
      
      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          name: task.client,
          classification: 'A', // Classificação padrão - pode ser implementada posteriormente
          city: task.property, // Usando property como cidade por enquanto
          filial: task.filial || '',
          responsible: task.responsible,
          lastVisit: null,
          lastOpportunity: null,
          hasActivity: false
        });
      }

      const client = clientMap.get(clientKey)!;
      client.hasActivity = true;

      if (task.taskType === 'prospection') {
        if (!client.lastVisit || taskDate > client.lastVisit) {
          client.lastVisit = taskDate;
        }
      }

      if (task.isProspect) {
        if (!client.lastOpportunity || taskDate > client.lastOpportunity) {
          client.lastOpportunity = taskDate;
        }
      }
    });

    let clientsArray = Array.from(clientMap.values());

    // Filtro de busca
    if (searchTerm) {
      clientsArray = clientsArray.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Ordenação
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

    return clientsArray;
  }, [tasks, searchTerm, selectedPeriod, selectedConsultant, selectedFilial, sortField, sortDirection, consultants]);

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
          <CardDescription>Detalhamento por cliente com histórico de atividades</CardDescription>
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
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Download, Search, Filter } from 'lucide-react';
import { useFiliais } from '@/hooks/useTasksOptimized';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { useClientsOverviewV2 } from '@/hooks/useClientsOverviewV2';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Tela de Clientes — fonte oficial: `get_clients_overview_v2` (task_followups).
 *
 * Padronização (Fase 3):
 *   - Operacional: task_followups (activity_date, filial_id, responsible_user_id)
 *   - Cliente único: COALESCE(NULLIF(client_code,''), LOWER(TRIM(client_name)))
 *   - Última oportunidade: opportunities.data_criacao via task_id
 *   - Sem corte hardcoded de 90 dias.
 */
export const FunnelClientsOptimized: React.FC = () => {
  const { consultants, isLoading: consultantsLoading } = useFilteredConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');

  const { data, isLoading } = useClientsOverviewV2({
    period: selectedPeriod,
    filial: selectedFilial,
    consultantId: selectedConsultant,
    search: searchTerm,
    limit: 100,
    offset: 0,
  });

  const rows = data?.rows ?? [];
  const totalClients = data?.total ?? 0;
  const clientsWithActivity = rows.filter(r => (r.total_activities || 0) > 0).length;
  const coveragePercentage = rows.length > 0
    ? Math.round((clientsWithActivity / rows.length) * 100)
    : 0;

  const filialNameById = new Map(filiais.map((f: any) => [f.id, f.nome]));
  const consultantNameById = new Map(consultants.map((c: any) => [c.id, c.name]));

  const loading = isLoading || consultantsLoading || filiaisLoading;

  if (loading) {
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
            <CardTitle className="text-sm font-medium">Clientes únicos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground">No período selecionado (task_followups)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Com atividade</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsWithActivity}</div>
            <p className="text-xs text-muted-foreground">Pelo menos 1 atividade no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">% Cobertura</CardTitle>
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
          <CardDescription>
            Fonte: <strong>task_followups</strong> · Filial operacional = filial_id · Vendedor = responsible_user_id
          </CardDescription>
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
              <label className="text-sm font-medium">Período (data da atividade)</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                  <SelectItem value="all">Todos os registros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Consultor</label>
              <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os consultores</SelectItem>
                  {consultants.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Filial operacional</label>
              <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {filiais.map((f: any) => (
                    <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Exportar</label>
              <Button variant="outline" className="w-full" disabled>
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
            Detalhamento por cliente único — chave: COALESCE(client_code, lower(client_name))
            · {totalClients} clientes encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Filial operacional</TableHead>
                <TableHead>Consultor</TableHead>
                <TableHead>Atividades</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead>Última visita</TableHead>
                <TableHead>Última oportunidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.client_key}>
                  <TableCell className="font-medium">{c.client_name}</TableCell>
                  <TableCell>
                    {c.client_code
                      ? <Badge variant="secondary">{c.client_code}</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{filialNameById.get(c.filial_id ?? '') ?? '—'}</TableCell>
                  <TableCell>{consultantNameById.get(c.responsible_user_id ?? '') ?? '—'}</TableCell>
                  <TableCell>{c.total_activities}</TableCell>
                  <TableCell>
                    {c.last_activity_date
                      ? format(new Date(c.last_activity_date), 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {c.last_visit_date
                      ? format(new Date(c.last_visit_date), 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {c.last_opportunity_date
                      ? format(new Date(c.last_opportunity_date), 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {rows.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum cliente encontrado com os filtros aplicados.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Search, Filter } from 'lucide-react';
import { useFiliais } from '@/hooks/useTasksOptimized';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { useReportsDatasetV2, ReportRowV2 } from '@/hooks/useReportsDatasetV2';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Histórico de Atividades — fonte oficial: `get_reports_dataset_v2` (task_followups).
 *
 * Padronização (Fase 3):
 *   - Operacional: task_followups (activity_date, filial_id, responsible_user_id)
 *   - Comercial:   tasks/opportunities (latest snapshot por task_id)
 *   - Sem corte hardcoded de 90 dias.
 */
export const FunnelTasksOptimized: React.FC = () => {
  const { consultants, isLoading: consultantsLoading } = useFilteredConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error } = useReportsDatasetV2({
    period: selectedPeriod,
    filial: selectedFilial,
    consultantId: selectedConsultant,
    limit: 200,
    offset: 0,
  });

  const filialNameById = new Map(filiais.map((f: any) => [f.id, f.nome]));
  const consultantNameById = new Map(consultants.map((c: any) => [c.id, c.name]));

  const filteredRows: ReportRowV2[] = (data?.rows ?? [])
    .filter(r => !searchTerm || r.client_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const da = new Date(a.activity_date).getTime();
      const db = new Date(b.activity_date).getTime();
      return sortDirection === 'asc' ? da - db : db - da;
    });

  const labelType = (t: string) => {
    switch (t) {
      case 'visita':
      case 'prospection': return 'Visita';
      case 'ligacao': return 'Ligação';
      case 'checklist': return 'Checklist';
      default: return t;
    }
  };

  const badgeVariant = (t: string): 'default' | 'secondary' | 'outline' => {
    if (t === 'visita' || t === 'prospection') return 'default';
    if (t === 'ligacao') return 'secondary';
    return 'outline';
  };

  const loading = isLoading || consultantsLoading || filiaisLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Carregando atividades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Busca</span>
          </CardTitle>
          <CardDescription>
            Fonte: <strong>task_followups</strong> · Data exibida = <strong>activity_date</strong>
            {' '}· Filial operacional = filial_id · Vendedor = responsible_user_id
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
              <label className="text-sm font-medium">Ordenação</label>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              >
                Data {sortDirection === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckSquare className="h-5 w-5" />
            <span>Histórico de Atividades</span>
          </CardTitle>
          <CardDescription>
            {filteredRows.length} de {data?.total ?? 0} atividades · 1 linha por followup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data da atividade</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filial operacional</TableHead>
                  <TableHead>Filial atendida</TableHead>
                  <TableHead>Data criação tarefa</TableHead>
                  <TableHead>Data venda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.followup_id}>
                    <TableCell className="font-medium">
                      {format(new Date(r.activity_date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {r.client_name}
                      {r.client_code && (
                        <span className="ml-2 text-xs text-muted-foreground">[{r.client_code}]</span>
                      )}
                    </TableCell>
                    <TableCell>{consultantNameById.get(r.responsible_user_id ?? '') ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(r.activity_type)}>
                        {labelType(r.activity_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.followup_status}</Badge>
                    </TableCell>
                    <TableCell>{filialNameById.get(r.filial_id ?? '') ?? '—'}</TableCell>
                    <TableCell>{r.task_filial_atendida ?? '—'}</TableCell>
                    <TableCell>
                      {r.task_created_at
                        ? format(new Date(r.task_created_at), 'dd/MM/yyyy', { locale: ptBR })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {r.sale_date
                        ? format(new Date(r.sale_date), 'dd/MM/yyyy', { locale: ptBR })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {error
                ? <span className="text-destructive">Erro ao carregar atividades.</span>
                : 'Nenhuma atividade encontrada com os filtros aplicados.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

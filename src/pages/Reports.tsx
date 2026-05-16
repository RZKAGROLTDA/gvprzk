import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, formatDateDisplay, formatDateToLocal } from '@/lib/utils';
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckSquare,
  Download,
  Calendar as CalendarIcon,
  DollarSign,
  Target,
  Activity,
  Building2,
  RefreshCw,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { resolveFilialIdForFilter } from '@/lib/filialResolver';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';

interface FilialOption {
  id: string;
  nome: string;
}

/**
 * Contrato oficial:
 * - RPC V2 (get_funnel_metrics_v2) com filtros 'all'/'' → NULL
 * - Datas via formatDateToLocal (sem .toISOString().slice)
 * - Consultor filtrado por UUID (user_id) via useFilteredConsultants
 * - Sem profiles.role, sem SELECT *
 * - React Query default (staleTime 5m, refetchOnWindowFocus:false em QueryProvider)
 */
const Reports: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [selectedFilial, setSelectedFilial] = useState<string>('all');
  const [selectedFilialAtendida, setSelectedFilialAtendida] = useState<string>('all');

  const { consultants } = useFilteredConsultants();

  // Filiais (catálogo) — staleTime longo, dados estáticos
  const { data: filiais = [] } = useQuery<FilialOption[]>({
    queryKey: ['filiais-options'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const startStr = dateFrom ? formatDateToLocal(dateFrom) : null;
  const endStr = dateTo ? formatDateToLocal(dateTo) : null;
  const responsibleUserId =
    selectedConsultant && selectedConsultant !== 'all' ? selectedConsultant : null;
  const filialFilter =
    selectedFilial && selectedFilial !== 'all' ? selectedFilial : null;

  const {
    data: metrics,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      'reports-funnel-metrics-v2',
      user?.id ?? null,
      startStr,
      endStr,
      filialFilter,
      responsibleUserId,
    ],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Resolver nome/uuid/'all' → uuid|null (filtros normalizados).
      const p_filial_id = await resolveFilialIdForFilter(filialFilter);

      const { data, error } = await supabase.rpc('get_funnel_metrics_v2', {
        p_start_date: startStr,
        p_end_date: endStr,
        p_filial_id,
        p_responsible_user_id: responsibleUserId,
      });
      if (error) throw error;

      const r = (data ?? {}) as Record<string, number>;
      const num = (k: string) => Number(r[k] ?? 0);

      return {
        totalTasks: num('total_activities'),
        totalVisitas: num('visitas'),
        totalChecklist: num('checklists'),
        totalLigacoes: num('ligacoes'),
        totalProspects: num('prospect_open_count'),
        totalProspectsValue: num('prospect_open_value'),
        totalSalesValue: num('sales_total_value') + num('sales_partial_value'),
      };
    },
  });

  const totalTasks = metrics?.totalTasks ?? 0;
  const totalVisitas = metrics?.totalVisitas ?? 0;
  const totalChecklist = metrics?.totalChecklist ?? 0;
  const totalLigacoes = metrics?.totalLigacoes ?? 0;
  const totalProspectsValue = metrics?.totalProspectsValue ?? 0;
  const totalSalesValue = metrics?.totalSalesValue ?? 0;

  const loading = isFetching;

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSelectedConsultant('all');
    setSelectedFilial('all');
    setSelectedFilialAtendida('all');
    toast({
      title: '✨ Filtros limpos',
      description: 'Todos os filtros foram resetados com sucesso',
    });
  };

  const exportReport = (type: 'filial' | 'cep') => {
    if (type === 'filial') {
      toast({
        title: '📊 Relatório por Filial',
        description: 'Exportação em desenvolvimento — dados das filiais com filtros aplicados',
      });
    } else {
      toast({
        title: '📍 Relatório por CEP',
        description: 'Exportação em desenvolvimento — dados dos CEPs com filtros aplicados',
      });
    }
  };

  const hasActiveFilter =
    !!dateFrom ||
    !!dateTo ||
    selectedConsultant !== 'all' ||
    selectedFilial !== 'all' ||
    selectedFilialAtendida !== 'all';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Relatórios</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Análises e métricas de desempenho</p>
        </div>
        <div className="w-full sm:w-80">
          <OfflineIndicator />
        </div>
      </div>

      {/* Botões de Exportação */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <Button variant="gradient" onClick={() => exportReport('filial')} className="gap-2 text-sm">
          <Download className="h-4 w-4" />
          Relatório por Filial
        </Button>

        <Button
          variant="outline"
          onClick={() => exportReport('cep')}
          className="gap-2 text-sm border-green-600 text-green-600 hover:bg-green-50"
        >
          <Download className="h-4 w-4" />
          Relatório por CEP
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Filtros de Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !dateFrom && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? formatDateDisplay(dateFrom) : <span>Selecionar data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data Final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !dateTo && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? formatDateDisplay(dateTo) : <span>Selecionar data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      disabled={(date) => (dateFrom ? date < dateFrom : false)}
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filial</label>
                <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                  <SelectTrigger className={selectedFilial !== 'all' ? 'border-primary' : ''}>
                    <SelectValue placeholder="Todas as filiais" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as filiais</SelectItem>
                    {filiais.map((filial) => (
                      <SelectItem key={filial.id} value={filial.nome}>
                        {filial.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filial Atendida</label>
                <Select value={selectedFilialAtendida} onValueChange={setSelectedFilialAtendida}>
                  <SelectTrigger className={selectedFilialAtendida !== 'all' ? 'border-primary' : ''}>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {filiais.map((filial) => (
                      <SelectItem key={filial.id} value={filial.nome}>
                        {filial.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Consultor</label>
                <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os consultores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os consultores</SelectItem>
                    {consultants.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium opacity-0">Ações</label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={loading}
                    className="flex-1"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Atualizando...' : 'Atualizar'}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Limpar filtros</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja limpar todos os filtros aplicados? Os dados serão atualizados para mostrar informações completas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={clearFilters}>
                          Sim, limpar filtros
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>

            {hasActiveFilter && (
              <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                <p className="text-sm text-muted-foreground">Filtros ativos:</p>
                {dateFrom && (
                  <Badge variant="secondary" className="gap-1">
                    De: {formatDateDisplay(dateFrom)}
                  </Badge>
                )}
                {dateTo && (
                  <Badge variant="secondary" className="gap-1">
                    Até: {formatDateDisplay(dateTo)}
                  </Badge>
                )}
                {selectedFilial !== 'all' && (
                  <Badge variant="secondary" className="gap-1">Filial: {selectedFilial}</Badge>
                )}
                {selectedFilialAtendida !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Filial Atendida: {selectedFilialAtendida}
                  </Badge>
                )}
                {selectedConsultant !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    {consultants.find((c) => c.id === selectedConsultant)?.name ?? 'Consultor'}
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2">
                  Limpar todos
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo Geral */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-primary">
                  {loading ? '...' : totalTasks}
                </p>
                {selectedFilial !== 'all' && !loading && (
                  <p className="text-xs text-muted-foreground">Filial: {selectedFilial}</p>
                )}
              </div>
              <Activity className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-accent/10 to-accent/5 border-accent/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Visitas</p>
                <p className="text-2xl font-bold text-accent">{loading ? '...' : totalVisitas}</p>
              </div>
              <Target className="h-8 w-8 text-accent/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-success/10 to-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Checklist</p>
                <p className="text-2xl font-bold text-success">{loading ? '...' : totalChecklist}</p>
              </div>
              <CheckSquare className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-warning/10 to-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Ligações</p>
                <p className="text-2xl font-bold text-warning">{loading ? '...' : totalLigacoes}</p>
              </div>
              <Users className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-secondary/30 to-secondary/10 border-secondary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Oportunidades</p>
                <p className="text-lg font-bold text-secondary-foreground">
                  {loading ? '...' : `R$ ${totalProspectsValue.toLocaleString('pt-BR')}`}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-secondary-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-primary/15 to-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Vendas Realizadas</p>
                <p className="text-lg font-bold text-primary">
                  {loading ? '...' : `R$ ${totalSalesValue.toLocaleString('pt-BR')}`}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Análises Detalhadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-primary/50"
          onClick={() => navigate('/reports/filial')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Desempenho por Filial</h3>
                  <p className="text-sm text-muted-foreground">
                    Análise detalhada do desempenho de cada filial
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <Button variant="outline" size="sm" className="w-full">
                Ver Análise Completa
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-accent/50"
          onClick={() => navigate('/reports/seller')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <Users className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Performance dos Vendedores</h3>
                  <p className="text-sm text-muted-foreground">
                    Ranking e análise individual dos vendedores
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <Button variant="outline" size="sm" className="w-full">
                Ver Ranking Completo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;

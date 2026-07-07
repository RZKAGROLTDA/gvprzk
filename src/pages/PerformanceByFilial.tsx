import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  RefreshCw,
  DollarSign,
  Target,
  CheckSquare,
  Users,
  TrendingUp,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { PeriodFilter, buildPeriodValue, type PeriodValue } from '@/components/ui/PeriodFilter';

interface FilialStats {
  id: string;
  nome: string;
  visitas: number;
  checklist: number;
  ligacoes: number;
  prospects: number;
  prospectsValue: number;
  salesValue: number;
  conversionRate: number;
}

/**
 * Contrato oficial:
 * - RPC V2 (get_performance_by_filial_v2) com filtros 'all'/'' → NULL
 * - Datas via formatDateToLocal
 * - Filtro de consultor por UUID (user_id) — NUNCA por nome ou profile.id
 * - Consultores via useFilteredConsultants (RLS + filial do supervisor)
 * - React Query default (staleTime 5m, refetchOnWindowFocus:false em QueryProvider)
 */
const PerformanceByFilial: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');

  const { consultants } = useFilteredConsultants();

  const startStr = dateFrom ? formatDateToLocal(dateFrom) : null;
  const endStr = dateTo ? formatDateToLocal(dateTo) : null;
  const responsibleUserId =
    selectedConsultant && selectedConsultant !== 'all' ? selectedConsultant : null;

  const { data: filialStats = [], isFetching, refetch } = useQuery<FilialStats[]>({
    queryKey: ['performance-by-filial-v2', user?.id ?? null, startStr, endStr, responsibleUserId],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_performance_by_filial_v2', {
        p_start_date: startStr,
        p_end_date: endStr,
        p_responsible_user_id: responsibleUserId,
      });
      if (error) throw error;

      return (data ?? []).map((row: any) => {
        const visitas = Number(row.visitas ?? 0);
        const checklist = Number(row.checklists ?? 0);
        const ligacoes = Number(row.ligacoes ?? 0);
        const total = visitas + checklist + ligacoes;
        const salesCount = Number(row.sales_total_count ?? 0) + Number(row.sales_partial_count ?? 0);
        const conversionRate = total > 0 ? (salesCount / total) * 100 : 0;
        return {
          id: row.filial_id,
          nome: row.filial_nome ?? 'Sem filial',
          visitas,
          checklist,
          ligacoes,
          prospects: Number(row.prospections ?? 0),
          prospectsValue: 0,
          salesValue: Number(row.sales_total_value ?? 0) + Number(row.sales_partial_value ?? 0),
          conversionRate: Math.round(conversionRate * 10) / 10,
        };
      });
    },
  });

  const loading = isFetching;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/reports')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Desempenho por Filial</h1>
            <p className="text-muted-foreground">Análise detalhada do desempenho de cada filial</p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
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
                  />
                </PopoverContent>
              </Popover>
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
          </div>
        </CardContent>
      </Card>

      {/* Dados por Filial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Performance das Filiais
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filialStats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">Nenhuma filial encontrada</p>
              <p className="text-sm">Verifique os filtros ou aguarde o carregamento dos dados</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filialStats.map((filial) => (
                <Card key={filial.id} className="border-l-4 border-l-primary/50 hover:shadow-lg transition-all duration-200">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-foreground mb-1">{filial.nome}</h3>
                        <p className="text-sm text-muted-foreground">
                          {filial.visitas + filial.checklist + filial.ligacoes} atividades totais
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={filial.conversionRate > 15 ? 'default' : 'secondary'}
                          className="text-sm px-3 py-1"
                        >
                          {filial.conversionRate}% conversão
                        </Badge>
                        <div className="text-right hidden md:block">
                          <p className="text-lg font-bold text-success">
                            R$ {filial.salesValue.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-xs text-muted-foreground">em vendas</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-primary/5 rounded-lg p-4 text-center">
                        <Target className="h-6 w-6 mx-auto mb-2 text-primary" />
                        <p className="text-2xl font-bold text-primary">{filial.visitas}</p>
                        <p className="text-xs text-muted-foreground">Visitas</p>
                      </div>
                      <div className="bg-success/5 rounded-lg p-4 text-center">
                        <CheckSquare className="h-6 w-6 mx-auto mb-2 text-success" />
                        <p className="text-2xl font-bold text-success">{filial.checklist}</p>
                        <p className="text-xs text-muted-foreground">Checklist</p>
                      </div>
                      <div className="bg-warning/5 rounded-lg p-4 text-center">
                        <Users className="h-6 w-6 mx-auto mb-2 text-warning" />
                        <p className="text-2xl font-bold text-warning">{filial.ligacoes}</p>
                        <p className="text-xs text-muted-foreground">Ligações</p>
                      </div>
                      <div className="bg-accent/5 rounded-lg p-4 text-center">
                        <TrendingUp className="h-6 w-6 mx-auto mb-2 text-accent" />
                        <p className="text-2xl font-bold text-accent">{filial.prospects}</p>
                        <p className="text-xs text-muted-foreground">Prospects</p>
                      </div>
                      <div className="bg-secondary/5 rounded-lg p-4 text-center md:hidden">
                        <DollarSign className="h-6 w-6 mx-auto mb-2 text-success" />
                        <p className="text-lg font-bold text-success">R$ {filial.salesValue.toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-muted-foreground">Vendas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceByFilial;

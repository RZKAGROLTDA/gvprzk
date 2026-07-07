import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatDateToLocal } from '@/lib/utils';
import {
  Users,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { PeriodFilter, buildPeriodValue, type PeriodValue } from '@/components/ui/PeriodFilter';

interface SellerStat {
  name: string;
  role: string;
  user_id: string;
  visits: number;
  prospects: number;
  sales: number;
  conversionRate: number;
  totalActivities: number;
  visitas: number;
  checklist: number;
  ligacoes: number;
}

const roleLabel = (role: string) =>
  role === 'consultant' ? 'Consultor'
  : role === 'manager' ? 'Gerente'
  : role === 'admin' ? 'Admin'
  : role === 'supervisor' ? 'Supervisor'
  : role;

interface UserPerformanceItemProps {
  user: SellerStat;
  index: number;
  dateFrom?: Date;
  dateTo?: Date;
}

const UserPerformanceItem: React.FC<UserPerformanceItemProps> = ({ user, index, dateFrom, dateTo }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const startStr = dateFrom ? formatDateToLocal(dateFrom) : null;
  const endStr = dateTo ? formatDateToLocal(dateTo) : null;

  // Filtro por UUID (user_id) — NUNCA por nome.
  const { data: userTasks = [], isFetching: loadingTasks } = useQuery({
    queryKey: ['seller-tasks', user.user_id, startStr, endStr],
    enabled: isExpanded && !!user.user_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Colunas explícitas + LIMIT (contrato oficial).
      let query = supabase
        .from('tasks')
        .select('id, name, client, property, task_type, is_prospect, sales_value, sales_confirmed, start_date, end_date')
        .eq('created_by', user.user_id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (startStr) query = query.gte('start_date', startStr);
      if (endStr) query = query.lte('end_date', endStr);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-md ${
        index < 3 ? 'ring-1 ring-primary/20 bg-primary/5' : ''
      }`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ${
                index === 0 ? 'bg-yellow-500 text-white' :
                index === 1 ? 'bg-gray-400 text-white' :
                index === 2 ? 'bg-amber-600 text-white' :
                'bg-muted text-muted-foreground'
              }`}>
                {index + 1}
              </div>

              <div>
                <h4 className="font-semibold text-base">{user.name}</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{roleLabel(user.role)}</Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                variant={user.conversionRate > 15 ? 'default' : 'secondary'}
                className="text-xs"
              >
                {user.conversionRate.toFixed(1)}% conversão
              </Badge>
              <div className="text-right">
                <p className="text-sm font-bold text-success">
                  R$ {user.sales.toLocaleString('pt-BR')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 w-6 p-0"
                onClick={() => setIsExpanded((v) => !v)}
                title="Ver tarefas do consultor"
              >
                {isExpanded ? '▼' : '▶'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="font-bold text-foreground">{user.totalActivities}</p>
              <p className="text-xs text-muted-foreground">atividades</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Visitas</p>
              <p className="font-bold text-primary">{user.visitas}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Checklist</p>
              <p className="font-bold text-success">{user.checklist}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Ligações</p>
              <p className="font-bold text-warning">{user.ligacoes}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Prospects</p>
              <p className="font-bold text-accent">{user.prospects}</p>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t pt-4 mt-4">
            {loadingTasks ? (
              <div className="text-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Carregando tarefas...</p>
              </div>
            ) : userTasks.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">Nenhuma tarefa encontrada no período</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <h5 className="font-medium text-sm mb-3">
                  Lista de Tarefas ({userTasks.length})
                </h5>
                {userTasks.map((task: any) => (
                  <div key={task.id} className="bg-muted/50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="font-medium">{task.name || task.client || 'Tarefa sem nome'}</p>
                        <p className="text-muted-foreground text-xs">
                          {task.client} • {task.property}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={
                            task.task_type === 'prospection' ? 'default' :
                            task.task_type === 'checklist' ? 'secondary' :
                            'outline'
                          }
                          className="text-xs"
                        >
                          {task.task_type === 'prospection' ? 'Visita' :
                           task.task_type === 'checklist' ? 'Checklist' : 'Ligação'}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1">Status:</p>
                      <Badge
                        variant={
                          task.sales_confirmed === true ? 'default' :
                          task.is_prospect === true && task.sales_confirmed === null ? 'secondary' :
                          task.sales_confirmed === false ? 'destructive' : 'outline'
                        }
                        className="text-xs"
                      >
                        {task.sales_confirmed === true ? 'Venda Confirmada' :
                         task.is_prospect === true && task.sales_confirmed === null ? 'Prospect' :
                         task.sales_confirmed === false ? 'Venda Perdida' : 'Em Análise'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Contrato oficial:
 * - RPC V2 (get_performance_by_seller_v2) com filtros 'all'/'' → NULL
 * - Datas via formatDateToLocal
 * - Filtro de consultor por UUID (user_id) — NUNCA por nome ou profile.id
 * - useFilteredConsultants respeita filial do supervisor
 * - React Query default (staleTime 5m, refetchOnWindowFocus:false em QueryProvider)
 */
const PerformanceBySeller: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periodValue, setPeriodValue] = useState<PeriodValue>(() => buildPeriodValue('30'));
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');

  const { consultants } = useFilteredConsultants();

  const startStr = periodValue.startStr;
  const endStr = periodValue.endStr;
  const dateFrom = periodValue.startDate ?? undefined;
  const dateTo = periodValue.endDate ?? undefined;
  const responsibleUserId =
    selectedConsultant && selectedConsultant !== 'all' ? selectedConsultant : null;

  const { data: userStats = [], isFetching, refetch } = useQuery<SellerStat[]>({
    queryKey: ['performance-by-seller-v2', user?.id ?? null, startStr, endStr, responsibleUserId],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_performance_by_seller_v2', {
        p_start_date: startStr,
        p_end_date: endStr,
        p_filial_id: null,
        p_responsible_user_id: responsibleUserId,
      });
      if (error) throw error;

      return (data ?? []).map((row: any) => {
        const visitas = Number(row.visitas ?? 0);
        const checklist = Number(row.checklists ?? 0);
        const ligacoes = Number(row.ligacoes ?? 0);
        const totalActivities = visitas + checklist + ligacoes;
        const salesCount = Number(row.sales_total_count ?? 0) + Number(row.sales_partial_count ?? 0);
        const salesValue = Number(row.sales_total_value ?? 0) + Number(row.sales_partial_value ?? 0);
        const conversionRate = totalActivities > 0 ? (salesCount / totalActivities) * 100 : 0;
        return {
          name: row.responsible_name ?? 'Sem nome',
          role: row.role ?? 'consultant',
          user_id: row.responsible_user_id,
          visits: totalActivities,
          prospects: Number(row.prospections ?? 0),
          sales: salesValue,
          conversionRate: Math.round(conversionRate * 10) / 10,
          totalActivities,
          visitas,
          checklist,
          ligacoes,
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
            <h1 className="text-3xl font-bold">Performance dos Vendedores</h1>
            <p className="text-muted-foreground">Análise detalhada da performance individual dos vendedores</p>
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
            <Users className="h-5 w-5" />
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

      {/* Performance por Vendedor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Ranking dos Vendedores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-muted rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-3 bg-muted rounded w-1/4"></div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="h-4 bg-muted rounded w-20"></div>
                    <div className="h-3 bg-muted rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : userStats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">Nenhum colaborador encontrado</p>
              <p className="text-sm">Verifique os filtros ou aguarde o carregamento dos dados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {userStats.map((u, index) => (
                <UserPerformanceItem
                  key={`${u.name}-${u.user_id}`}
                  user={u}
                  index={index}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceBySeller;

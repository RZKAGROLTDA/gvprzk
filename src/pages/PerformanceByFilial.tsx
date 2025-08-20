import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
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
  ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';

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

const PerformanceByFilial: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [filialStats, setFilialStats] = useState<FilialStats[]>([]);
  const [loading, setLoading] = useState(false);

  // Calcular estatísticas agregadas dos dados das filiais
  const totalTasks = filialStats.reduce((sum, f) => sum + f.visitas + f.checklist + f.ligacoes, 0);
  const totalVisitas = filialStats.reduce((sum, f) => sum + f.visitas, 0);
  const totalChecklist = filialStats.reduce((sum, f) => sum + f.checklist, 0);
  const totalLigacoes = filialStats.reduce((sum, f) => sum + f.ligacoes, 0);
  const totalProspects = filialStats.reduce((sum, f) => sum + f.prospects, 0);
  const totalProspectsValue = filialStats.reduce((sum, f) => sum + f.prospectsValue, 0);
  const totalSalesValue = filialStats.reduce((sum, f) => sum + f.salesValue, 0);
  const overallConversionRate = totalProspectsValue > 0 ? (totalSalesValue / totalProspectsValue) * 100 : 0;

  const loadFilialStats = async (silent = false) => {
    if (!user) return;
    
    if (!silent && filialStats.length === 0) setLoading(true);
    try {
      const { data: filiais, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) throw filiaisError;

      const filialStatsPromises = filiais?.map(async (filial) => {
        const { data: profilesFromFilial, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('filial_id', filial.id);

        if (profilesError) {
          return {
            id: filial.id,
            nome: filial.nome,
            visitas: 0,
            checklist: 0,
            ligacoes: 0,
            prospects: 0,
            prospectsValue: 0,
            salesValue: 0,
            conversionRate: 0
          };
        }

        const userIds = profilesFromFilial?.map(p => p.user_id) || [];
        
        if (userIds.length === 0) {
          return {
            id: filial.id,
            nome: filial.nome,
            visitas: 0,
            checklist: 0,
            ligacoes: 0,
            prospects: 0,
            prospectsValue: 0,
            salesValue: 0,
            conversionRate: 0
          };
        }
        
        let query = supabase
          .from('tasks')
          .select('*')
          .in('created_by', userIds);

        if (dateFrom) {
          query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
        }
        if (dateTo) {
          query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
        }

        const { data: tasks, error: tasksError } = await query;

        if (tasksError) {
          return {
            id: filial.id,
            nome: filial.nome,
            visitas: 0,
            checklist: 0,
            ligacoes: 0,
            prospects: 0,
            prospectsValue: 0,
            salesValue: 0,
            conversionRate: 0
          };
        }

        const visitas = tasks?.filter(task => task.task_type === 'prospection').length || 0;
        const checklist = tasks?.filter(task => task.task_type === 'checklist').length || 0;
        const ligacoes = tasks?.filter(task => task.task_type === 'ligacao').length || 0;
        const prospects = tasks?.filter(task => task.is_prospect === true).length || 0;
        const prospectsValue = tasks?.filter(task => task.is_prospect === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        const salesValue = tasks?.filter(task => task.sales_confirmed === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        
        const conversionRate = prospectsValue > 0 ? (salesValue / prospectsValue) * 100 : 0;

        return {
          id: filial.id,
          nome: filial.nome,
          visitas,
          checklist,
          ligacoes,
          prospects,
          prospectsValue,
          salesValue,
          conversionRate
        };
      }) || [];

      const stats = await Promise.all(filialStatsPromises);
      setFilialStats(stats.sort((a, b) => b.salesValue - a.salesValue));
    } catch (error) {
      console.error('Erro ao carregar estatísticas das filiais:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados das filiais",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFilialStats();
  }, [user, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate('/reports')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Desempenho por Filial</h1>
          <p className="text-muted-foreground">Análise de performance das filiais</p>
        </div>
      </div>

      {/* Filtros de Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Filtros de Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">De:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Até:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={() => loadFilialStats()} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Atividades</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <div className="grid grid-cols-3 gap-1 mt-2 text-xs">
              <div>
                <span className="text-primary font-medium">{totalVisitas}</span>
                <p className="text-muted-foreground">Visitas</p>
              </div>
              <div>
                <span className="text-success font-medium">{totalChecklist}</span>
                <p className="text-muted-foreground">Checklist</p>
              </div>
              <div>
                <span className="text-warning font-medium">{totalLigacoes}</span>
                <p className="text-muted-foreground">Ligações</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospects</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProspects}</div>
            <p className="text-xs text-muted-foreground">
              Valor: R$ {totalProspectsValue.toLocaleString('pt-BR')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Realizadas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              R$ {totalSalesValue.toLocaleString('pt-BR')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallConversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Vendas / Prospects
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Filiais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Performance por Filial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filialStats.map((filial, index) => (
              <Card key={filial.id} className={`transition-all duration-200 hover:shadow-md ${
                index < 3 ? 'ring-1 ring-primary/20 bg-primary/5' : ''
              }`}>
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
                          <h4 className="font-semibold text-base">{filial.nome}</h4>
                          <Badge variant="outline" className="text-xs">
                            Filial
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={filial.conversionRate > 15 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {filial.conversionRate.toFixed(1)}% conversão
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-bold text-success">
                            R$ {filial.salesValue.toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Total</p>
                        <p className="font-bold text-foreground">{filial.visitas + filial.checklist + filial.ligacoes}</p>
                        <p className="text-xs text-muted-foreground">atividades</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Visitas</p>
                        <p className="font-bold text-primary">{filial.visitas}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Checklist</p>
                        <p className="font-bold text-success">{filial.checklist}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Ligações</p>
                        <p className="font-bold text-warning">{filial.ligacoes}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Prospects</p>
                        <p className="font-bold text-accent">{filial.prospects}</p>
                        <p className="text-xs text-muted-foreground">
                          R$ {filial.prospectsValue.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceByFilial;
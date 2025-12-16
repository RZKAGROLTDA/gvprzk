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
  Building2,
  RefreshCw,
  Calendar as CalendarIcon,
  DollarSign,
  Target,
  CheckSquare,
  Users,
  TrendingUp,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

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
  const [selectedUser, setSelectedUser] = useState('all');
  const [filialStats, setFilialStats] = useState<FilialStats[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCollaborators = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, role, user_id')
        .order('name');

      if (error) throw error;
      setCollaborators(profiles || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadFilialStats = async () => {
    if (!user) return;
    
    setLoading(true);
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
        
        // OTIMIZAÇÃO Disk IO: Selecionar apenas campos necessários + LIMIT
        let query = supabase
          .from('tasks')
          .select('id, task_type, is_prospect, sales_value, sales_confirmed')
          .in('created_by', userIds)
          .limit(1000);

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
          prospectsValue: Number(prospectsValue),
          salesValue: Number(salesValue),
          conversionRate: Math.round(conversionRate * 10) / 10
        };
      }) || [];

      const results = await Promise.all(filialStatsPromises);
      setFilialStats(results);
    } catch (error) {
      console.error('Erro ao carregar estatísticas por filial:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadFilialStats();
      loadCollaborators();
    }
  }, [user, dateFrom, dateTo, selectedUser]);

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
          onClick={() => loadFilialStats()}
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
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : <span>Selecionar data</span>}
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Data Final</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : <span>Selecionar data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    disabled={(date) => dateFrom ? date < dateFrom : false}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">CEP</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os CEPs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os CEPs</SelectItem>
                  {collaborators.map((collaborator) => (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name} - {
                        collaborator.role === 'consultant' ? 'Consultor' : 
                        collaborator.role === 'manager' ? 'Gerente' : 
                        collaborator.role === 'admin' ? 'Admin' : collaborator.role
                      }
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
                          variant={filial.conversionRate > 15 ? "default" : "secondary"}
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
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {(filial.prospectsValue * (filial.visitas / Math.max(1, filial.visitas + filial.checklist + filial.ligacoes))).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-success/5 rounded-lg p-4 text-center">
                        <CheckSquare className="h-6 w-6 mx-auto mb-2 text-success" />
                        <p className="text-2xl font-bold text-success">{filial.checklist}</p>
                        <p className="text-xs text-muted-foreground">Checklist</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {(filial.prospectsValue * (filial.checklist / Math.max(1, filial.visitas + filial.checklist + filial.ligacoes))).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-warning/5 rounded-lg p-4 text-center">
                        <Users className="h-6 w-6 mx-auto mb-2 text-warning" />
                        <p className="text-2xl font-bold text-warning">{filial.ligacoes}</p>
                        <p className="text-xs text-muted-foreground">Ligações</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {(filial.prospectsValue * (filial.ligacoes / Math.max(1, filial.visitas + filial.checklist + filial.ligacoes))).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-accent/5 rounded-lg p-4 text-center">
                        <TrendingUp className="h-6 w-6 mx-auto mb-2 text-accent" />
                        <p className="text-2xl font-bold text-accent">{filial.prospects}</p>
                        <p className="text-xs text-muted-foreground">Prospects</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {filial.prospectsValue.toLocaleString('pt-BR')}
                        </p>
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
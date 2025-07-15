import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  CheckSquare, 
  Download,
  Calendar,
  DollarSign,
  Target,
  Activity
} from 'lucide-react';
import { TaskStats } from '@/types/task';

const Reports: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedUser, setSelectedUser] = useState('all');

  const stats: TaskStats = {
    totalVisits: 45,
    completedVisits: 32,
    prospects: 12,
    salesValue: 85000,
    conversionRate: 26.7
  };

  const detailedStats = [
    {
      period: 'Janeiro 2024',
      totalVisits: 45,
      completedVisits: 32,
      prospects: 12,
      salesValue: 85000,
      conversionRate: 26.7
    },
    {
      period: 'Dezembro 2023',
      totalVisits: 38,
      completedVisits: 28,
      prospects: 8,
      salesValue: 62000,
      conversionRate: 21.1
    },
    {
      period: 'Novembro 2023',
      totalVisits: 42,
      completedVisits: 35,
      prospects: 15,
      salesValue: 95000,
      conversionRate: 35.7
    }
  ];

  const userStats = [
    {
      name: 'João Silva',
      role: 'RAC',
      visits: 18,
      prospects: 6,
      sales: 35000,
      conversionRate: 33.3
    },
    {
      name: 'Maria Santos',
      role: 'Consultora',
      visits: 14,
      prospects: 4,
      sales: 28000,
      conversionRate: 28.6
    },
    {
      name: 'Pedro Oliveira',
      role: 'RAC',
      visits: 13,
      prospects: 2,
      sales: 22000,
      conversionRate: 15.4
    }
  ];

  const exportReport = () => {
    // Implementar exportação para PDF/Excel
    console.log('Exportando relatório...');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Análises e métricas de desempenho</p>
        </div>
        <Button variant="gradient" onClick={exportReport} className="gap-2">
          <Download className="h-4 w-4" />
          Exportar Relatório
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Esta Semana</SelectItem>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="quarter">Este Trimestre</SelectItem>
                  <SelectItem value="year">Este Ano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Colaborador</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Colaboradores</SelectItem>
                  <SelectItem value="joao">João Silva</SelectItem>
                  <SelectItem value="maria">Maria Santos</SelectItem>
                  <SelectItem value="pedro">Pedro Oliveira</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button variant="outline" className="w-full">
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVisits}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-success" />
              <span>+18% vs mês anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visitas Concluídas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedVisits}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{((stats.completedVisits / stats.totalVisits) * 100).toFixed(1)}% do total</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospects Gerados</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.prospects}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{stats.conversionRate}% de conversão</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Geradas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {stats.salesValue.toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-success" />
              <span>+37% vs mês anterior</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico Mensal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Histórico Mensal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {detailedStats.map((stat, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{stat.period}</h3>
                    <p className="text-sm text-muted-foreground">
                      {stat.completedVisits} de {stat.totalVisits} visitas concluídas
                    </p>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm font-medium">{stat.prospects}</div>
                      <div className="text-xs text-muted-foreground">Prospects</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">R$ {stat.salesValue.toLocaleString('pt-BR')}</div>
                      <div className="text-xs text-muted-foreground">Vendas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">{stat.conversionRate}%</div>
                      <div className="text-xs text-muted-foreground">Conversão</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance por Colaborador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Performance por Colaborador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {userStats.map((user, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{user.name}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{user.role}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {user.visits} visitas realizadas
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm font-medium">{user.prospects}</div>
                      <div className="text-xs text-muted-foreground">Prospects</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">R$ {user.sales.toLocaleString('pt-BR')}</div>
                      <div className="text-xs text-muted-foreground">Vendas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">{user.conversionRate}%</div>
                      <div className="text-xs text-muted-foreground">Conversão</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
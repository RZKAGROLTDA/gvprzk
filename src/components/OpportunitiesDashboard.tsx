import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOpportunities } from '@/hooks/useOpportunities';
import { TrendingUp, TrendingDown, Target, DollarSign, Users, Calendar } from 'lucide-react';

export const OpportunitiesDashboard: React.FC = () => {
  const { data: opportunities = [], isLoading } = useOpportunities();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-24 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Calcular estatísticas
  const stats = {
    totalOportunidades: opportunities.length,
    prospectsAbertos: opportunities.filter(o => o.status === 'Prospect').length,
    fechadasTotal: opportunities.filter(o => o.status === 'Venda Total').length,
    fechadasParcial: opportunities.filter(o => o.status === 'Venda Parcial').length,
    perdidas: opportunities.filter(o => o.status === 'Venda Perdida').length,
    valorTotalOportunidades: opportunities.reduce((sum, o) => sum + o.valor_total_oportunidade, 0),
    valorTotalFechado: opportunities.reduce((sum, o) => sum + o.valor_venda_fechada, 0)
  };

  const fechadasTotais = stats.fechadasTotal + stats.fechadasParcial;
  const conversaoGeral = stats.valorTotalOportunidades > 0 
    ? (stats.valorTotalFechado / stats.valorTotalOportunidades) * 100 
    : 0;
  
  const taxaSucesso = stats.totalOportunidades > 0 
    ? (fechadasTotais / stats.totalOportunidades) * 100 
    : 0;

  const ticketMedio = fechadasTotais > 0 
    ? stats.valorTotalFechado / fechadasTotais 
    : 0;

  // Estatísticas por filial
  const statsByFilial = opportunities.reduce((acc, opp) => {
    if (!acc[opp.filial]) {
      acc[opp.filial] = {
        total: 0,
        prospects: 0,
        fechadas: 0,
        perdidas: 0,
        valorTotal: 0,
        valorFechado: 0
      };
    }

    acc[opp.filial].total++;
    if (opp.status === 'Prospect') acc[opp.filial].prospects++;
    else if (['Venda Total', 'Venda Parcial'].includes(opp.status)) acc[opp.filial].fechadas++;
    else if (opp.status === 'Venda Perdida') acc[opp.filial].perdidas++;
    
    acc[opp.filial].valorTotal += opp.valor_total_oportunidade;
    acc[opp.filial].valorFechado += opp.valor_venda_fechada;

    return acc;
  }, {} as Record<string, any>);

  return (
    <div className="space-y-6">
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospects Abertos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.prospectsAbertos}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalOportunidades > 0 
                ? `${((stats.prospectsAbertos / stats.totalOportunidades) * 100).toFixed(1)}% do total`
                : 'Nenhuma oportunidade'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fechadas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fechadasTotais}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="default" className="text-xs">{stats.fechadasTotal} Total</Badge>
              <Badge variant="outline" className="text-xs">{stats.fechadasParcial} Parcial</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Perdidas</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.perdidas}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalOportunidades > 0 
                ? `${((stats.perdidas / stats.totalOportunidades) * 100).toFixed(1)}% do total`
                : 'Nenhuma perda'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {taxaSucesso.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {fechadasTotais} de {stats.totalOportunidades} oportunidades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Financeiros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total em Oportunidades</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {stats.valorTotalOportunidades.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              Soma de todas as oportunidades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Fechado</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              R$ {stats.valorTotalFechado.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              Vendas confirmadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão Geral</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversaoGeral.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Valor fechado / Valor total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas Adicionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Ticket Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Valor médio por venda fechada
            </p>
            {fechadasTotais > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Vendas Totais:</span>
                  <span className="font-medium">{stats.fechadasTotal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Vendas Parciais:</span>
                  <span className="font-medium">{stats.fechadasParcial}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Performance por Filial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(statsByFilial).map(([filial, stats]) => {
                const conversaoFilial = stats.valorTotal > 0 
                  ? (stats.valorFechado / stats.valorTotal) * 100 
                  : 0;

                return (
                  <div key={filial} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{filial}</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.fechadas}/{stats.total} oportunidades
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant={
                          conversaoFilial >= 70 ? 'default' :
                          conversaoFilial >= 30 ? 'secondary' : 'outline'
                        }
                      >
                        {conversaoFilial.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
              
              {Object.keys(statsByFilial).length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  Nenhuma oportunidade encontrada
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
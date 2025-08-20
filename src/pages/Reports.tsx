import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Download,
  Calendar as CalendarIcon,
  Building2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Reports: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Relatórios de Desempenho</h1>
        <p className="text-muted-foreground">Análise de performance e produtividade</p>
      </div>

      {/* Opções de Relatórios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
          onClick={() => navigate('/reports/filial')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-primary" />
              Desempenho por Filial
            </CardTitle>
            <CardDescription>
              Análise de performance das filiais, incluindo visitas, prospects e vendas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Visualize:</p>
                <ul className="text-sm space-y-1">
                  <li>• Rankings por filial</li>
                  <li>• Taxas de conversão</li>
                  <li>• Volumes de atividades</li>
                  <li>• Vendas realizadas</li>
                </ul>
              </div>
              <div className="text-right">
                <Button variant="outline" size="sm">
                  Acessar →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
          onClick={() => navigate('/reports/seller')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              Desempenho por Vendedor
            </CardTitle>
            <CardDescription>
              Análise individual de performance dos vendedores e consultores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Visualize:</p>
                <ul className="text-sm space-y-1">
                  <li>• Rankings individuais</li>
                  <li>• Detalhes de atividades</li>
                  <li>• Histórico de tarefas</li>
                  <li>• Métricas de conversão</li>
                </ul>
              </div>
              <div className="text-right">
                <Button variant="outline" size="sm">
                  Acessar →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Informações Adicionais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Funcionalidades dos Relatórios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <h4 className="font-medium">Filtros por Período</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Filtre os dados por datas específicas para análise temporal
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-success" />
                <h4 className="font-medium">Exportação de Dados</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Exporte relatórios em diversos formatos para análise externa
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-warning" />
                <h4 className="font-medium">Métricas em Tempo Real</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Acompanhe métricas de performance atualizadas automaticamente
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
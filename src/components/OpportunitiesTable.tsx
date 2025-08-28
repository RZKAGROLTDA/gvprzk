import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Search, Filter } from 'lucide-react';
import { useOpportunities, OpportunityWithTask } from '@/hooks/useOpportunities';
import { OpportunityEditModal } from './OpportunityEditModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const OpportunitiesTable: React.FC = () => {
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityWithTask | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string>('all');

  const { data: opportunities = [], isLoading, error } = useOpportunities();

  // Filtrar oportunidades
  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = 
      opp.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.filial.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || opp.status === statusFilter;
    const matchesTipo = tipoFilter === 'all' || opp.tipo === tipoFilter;

    return matchesSearch && matchesStatus && matchesTipo;
  });

  // Calcular estatísticas
  const stats = {
    total: opportunities.length,
    prospects: opportunities.filter(o => o.status === 'Prospect').length,
    fechadas: opportunities.filter(o => ['Venda Total', 'Venda Parcial'].includes(o.status)).length,
    perdidas: opportunities.filter(o => o.status === 'Venda Perdida').length,
    valorTotal: opportunities.reduce((sum, o) => sum + o.valor_total_oportunidade, 0),
    valorFechado: opportunities.reduce((sum, o) => sum + o.valor_venda_fechada, 0)
  };

  const conversaoGeral = stats.valorTotal > 0 ? (stats.valorFechado / stats.valorTotal) * 100 : 0;

  const handleEditOpportunity = (opportunity: OpportunityWithTask) => {
    setSelectedOpportunity(opportunity);
    setIsEditModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'Prospect': 'secondary',
      'Venda Total': 'default',
      'Venda Parcial': 'outline',
      'Venda Perdida': 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  const getTipoBadge = (tipo: string) => {
    const colors = {
      'Ligação': 'bg-blue-100 text-blue-800',
      'Visita': 'bg-green-100 text-green-800',
      'Checklist': 'bg-purple-100 text-purple-800'
    } as const;

    return (
      <Badge variant="outline" className={colors[tipo as keyof typeof colors]}>
        {tipo}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            Erro ao carregar oportunidades: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total de Oportunidades</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.prospects}</div>
            <p className="text-xs text-muted-foreground">Prospects Abertos</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.fechadas}</div>
            <p className="text-xs text-muted-foreground">Fechadas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.perdidas}</div>
            <p className="text-xs text-muted-foreground">Perdidas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-lg font-bold">R$ {stats.valorFechado.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Valor Fechado</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-lg font-bold">{conversaoGeral.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Conversão Geral</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente ou filial..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="Prospect">Prospect</SelectItem>
                <SelectItem value="Venda Total">Venda Total</SelectItem>
                <SelectItem value="Venda Parcial">Venda Parcial</SelectItem>
                <SelectItem value="Venda Perdida">Venda Perdida</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="Ligação">Ligação</SelectItem>
                <SelectItem value="Visita">Visita</SelectItem>
                <SelectItem value="Checklist">Checklist</SelectItem>
              </SelectContent>
            </Select>

            <div className="text-sm text-muted-foreground flex items-center">
              {filteredOpportunities.length} de {opportunities.length} oportunidades
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Oportunidades</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Valor Fechado</TableHead>
                <TableHead>Conversão</TableHead>
                <TableHead>Data Criação</TableHead>
                <TableHead>Data Fechamento</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOpportunities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Nenhuma oportunidade encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredOpportunities.map((opportunity) => (
                  <TableRow key={opportunity.opportunity_id}>
                    <TableCell className="font-medium">
                      {opportunity.cliente_nome}
                    </TableCell>
                    <TableCell>
                      {getTipoBadge(opportunity.tipo)}
                    </TableCell>
                    <TableCell>{opportunity.filial}</TableCell>
                    <TableCell>
                      {getStatusBadge(opportunity.status)}
                    </TableCell>
                    <TableCell>
                      R$ {opportunity.valor_total_oportunidade.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      R$ {opportunity.valor_venda_fechada.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          opportunity.conversao_pct >= 70 ? 'default' : 
                          opportunity.conversao_pct >= 30 ? 'secondary' : 'outline'
                        }
                      >
                        {opportunity.conversao_pct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(opportunity.data_criacao), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {opportunity.data_fechamento 
                        ? format(new Date(opportunity.data_fechamento), 'dd/MM/yyyy', { locale: ptBR })
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOpportunity(opportunity)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Edição */}
      <OpportunityEditModal
        opportunity={selectedOpportunity}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedOpportunity(null);
        }}
      />
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { BarChart3, Users, UserCheck, Eye, ArrowUpDown, ChevronLeft, ChevronRight, Activity, Target, TrendingUp, DollarSign, Percent, Package } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { useSellerSummary, useClientDetails, useFiliais, useProductAnalysis, type ManagementFilters } from '@/hooks/useManagementData';
import { format } from 'date-fns';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const roleLabel = (role: string) => {
  const map: Record<string, string> = {
    consultant: 'Consultor de Vendas',
    sales_consultant: 'Consultor de Vendas',
    technical_consultant: 'Consultor Técnico',
    rac: 'RAC',
    supervisor: 'Supervisor',
    manager: 'Gerente',
    admin: 'Gerente',
  };
  return map[role?.toLowerCase()] || role;
};

const roleBadgeVariant = (role: string) => {
  const r = role?.toLowerCase();
  if (r === 'rac') return 'warning';
  if (r === 'consultant' || r === 'sales_consultant' || r === 'technical_consultant') return 'default';
  if (r === 'supervisor') return 'secondary';
  if (r === 'manager' || r === 'admin') return 'outline';
  return 'outline';
};

const statusBadge = (status: string) => {
  const map: Record<string, { variant: any; label: string }> = {
    Ganho: { variant: 'success', label: 'Ganho' },
    Perdido: { variant: 'destructive', label: 'Perdido' },
    Prospect: { variant: 'warning', label: 'Prospect' },
    'Sem Oportunidade': { variant: 'outline', label: 'Sem Oportunidade' },
  };
  const s = map[status] || { variant: 'outline', label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

type SortDir = 'asc' | 'desc';

const Management: React.FC = () => {
  const { isManager, isAdmin, isSupervisor, role } = useUserRole();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { consultants } = useFilteredConsultants();
  const { data: filiais = [] } = useFiliais();

  // Determine if user is a seller (consultant or RAC) — simplified view
  const isSeller = !isManager && !isAdmin && !isSupervisor;
  const currentUserId = user?.id || '';

  // Filters
  const [period, setPeriod] = useState('90');
  const [filial, setFilial] = useState('all');
  const [sellerRole, setSellerRole] = useState('all');
  const [sellerId, setSellerId] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [pageSize, setPageSize] = useState(20);

  // Tabs
  const [activeTab, setActiveTab] = useState('vendedores');
  const [selectedSellerForClients, setSelectedSellerForClients] = useState<string | null>(null);

  // Sorting
  const [sellerSort, setSellerSort] = useState<{ key: string; dir: SortDir }>({ key: 'valor_convertido', dir: 'desc' });
  const [clientSort, setClientSort] = useState<{ key: string; dir: SortDir }>({ key: 'valor_convertido', dir: 'desc' });

  // Pagination
  const [sellerPage, setSellerPage] = useState(0);
  const [clientPage, setClientPage] = useState(0);

  // Build filters
  const filters: ManagementFilters = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (period !== 'all') {
      start.setDate(start.getDate() - parseInt(period));
    } else {
      start.setFullYear(start.getFullYear() - 5);
    }

    const taskTypes = taskTypeFilter === 'all' ? undefined :
      taskTypeFilter === 'visita' ? ['prospection', 'visita'] : [taskTypeFilter];

    // Supervisor must always filter by their own filial
    const effectiveFilialValue = isSupervisor && !isManager && !isAdmin
      ? (profile?.filial_nome || '')
      : filial;

    // Seller always filters by own ID
    const effectiveSellerId = isSeller ? currentUserId : sellerId;

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      filial: effectiveFilialValue,
      sellerRole: isSeller ? 'all' : sellerRole,
      sellerId: effectiveSellerId,
      taskTypes: taskTypes,
    };
  }, [period, filial, sellerRole, sellerId, taskTypeFilter, isSupervisor, isManager, isAdmin, isSeller, currentUserId, profile?.filial_nome]);

  // RAC-specific filters
  const racFilters: ManagementFilters = useMemo(() => ({
    ...filters,
    sellerRole: 'rac',
  }), [filters]);

  const { data: sellerData = [], isLoading: sellerLoading } = useSellerSummary(filters);
  const clientFilters = useMemo(() => ({
    ...filters,
    sellerId: selectedSellerForClients || filters.sellerId,
  }), [filters, selectedSellerForClients]);
  const { data: clientData = [], isLoading: clientLoading } = useClientDetails(clientFilters);
  const { data: racData = [], isLoading: racLoading } = useSellerSummary(racFilters);

  const showFilialFilter = isManager || isAdmin;
  const showSellerFilter = !isSeller;
  const showSellerRoleFilter = !isSeller;

  // Seller KPI data (from sellerData which is auto-filtered for sellers)
  const sellerKpi = useMemo(() => {
    if (!isSeller || sellerData.length === 0) return null;
    const s = sellerData[0]; // Single seller
    return {
      total_atividades: Number(s.total_atividades),
      clientes_atendidos: Number(s.clientes_atendidos),
      oportunidade_gerada: Number(s.oportunidade_gerada),
      valor_convertido: Number(s.valor_convertido),
      taxa_conversao: Number(s.taxa_conversao),
    };
  }, [isSeller, sellerData]);

  // Sort helper
  const sortData = <T extends Record<string, any>>(data: T[], sort: { key: string; dir: SortDir }) => {
    return [...data].sort((a, b) => {
      const va = a[sort.key] ?? 0;
      const vb = b[sort.key] ?? 0;
      if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sort.dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  };

  const toggleSort = (key: string, current: { key: string; dir: SortDir }, setter: (v: any) => void) => {
    setter(current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  // Sorted & paginated
  const sortedSellers = sortData(sellerData, sellerSort);
  const pagedSellers = sortedSellers.slice(sellerPage * pageSize, (sellerPage + 1) * pageSize);
  const sellerTotalPages = Math.ceil(sortedSellers.length / pageSize);

  const sortedClients = sortData(clientData, clientSort);
  const pagedClients = sortedClients.slice(clientPage * pageSize, (clientPage + 1) * pageSize);
  const clientTotalPages = Math.ceil(sortedClients.length / pageSize);

  // Role summary (aggregated from seller data)
  const roleSummary = useMemo(() => {
    const map = new Map<string, { count: number; atividades: number; oportunidade: number; convertido: number }>();
    sellerData.forEach(s => {
      const key = s.seller_role;
      const prev = map.get(key) || { count: 0, atividades: 0, oportunidade: 0, convertido: 0 };
      map.set(key, {
        count: prev.count + 1,
        atividades: prev.atividades + Number(s.total_atividades),
        oportunidade: prev.oportunidade + Number(s.oportunidade_gerada),
        convertido: prev.convertido + Number(s.valor_convertido),
      });
    });
    return Array.from(map.entries()).map(([role, v]) => ({
      role,
      ...v,
      taxa: v.oportunidade > 0 ? (v.convertido / v.oportunidade * 100) : 0,
    }));
  }, [sellerData]);

  // RAC sorted
  const sortedRac = sortData(racData, { key: 'valor_convertido', dir: 'desc' });

  const handleViewPortfolio = (sid: string) => {
    setSelectedSellerForClients(sid);
    setActiveTab('clientes');
    setClientPage(0);
  };

  const SortableHeader = ({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: { key: string; dir: SortDir }; onSort: () => void }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={onSort}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sort.key === sortKey ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  );

  const Pagination = ({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) => (
    totalPages > 1 ? (
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">
          {isSeller ? 'Meus Resultados' : 'Análise Gerencial'}
        </h1>
      </div>

      {/* Seller KPI Cards */}
      {isSeller && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Total de Atividades</span>
              </div>
              <p className="text-2xl font-bold">
                {sellerLoading ? '...' : (sellerKpi?.total_atividades ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Clientes Atendidos</span>
              </div>
              <p className="text-2xl font-bold">
                {sellerLoading ? '...' : (sellerKpi?.clientes_atendidos ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Oportunidade Gerada</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                {sellerLoading ? '...' : formatCurrency(sellerKpi?.oportunidade_gerada ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-success" />
                <span className="text-xs font-medium text-muted-foreground">Valor Convertido</span>
              </div>
              <p className="text-2xl font-bold text-success">
                {sellerLoading ? '...' : formatCurrency(sellerKpi?.valor_convertido ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Taxa de Conversão</span>
              </div>
              <p className="text-2xl font-bold">
                {sellerLoading ? '...' : (
                  <Badge variant={(sellerKpi?.taxa_conversao ?? 0) >= 30 ? 'success' : (sellerKpi?.taxa_conversao ?? 0) >= 10 ? 'warning' : 'outline'} className="text-lg px-3 py-1">
                    {(sellerKpi?.taxa_conversao ?? 0).toFixed(1)}%
                  </Badge>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Período */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
              <Select value={period} onValueChange={v => { setPeriod(v); setSellerPage(0); setClientPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="60">Últimos 60 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="180">Últimos 180 dias</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filial - only for managers */}
            {showFilialFilter && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Filial</label>
                <Select value={filial} onValueChange={v => { setFilial(v); setSellerPage(0); setClientPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {filiais.map(f => (
                      <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isSupervisor && !isManager && !isAdmin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Filial</label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm">
                  {profile?.filial_nome || 'Sua filial'}
                </div>
              </div>
            )}

            {/* Tipo de Atividade */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Atividade</label>
              <Select value={taskTypeFilter} onValueChange={v => { setTaskTypeFilter(v); setSellerPage(0); setClientPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="ligacao">Ligação</SelectItem>
                  <SelectItem value="checklist">Checklist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Vendedor - hidden for sellers */}
            {showSellerRoleFilter && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Vendedor</label>
                <Select value={sellerRole} onValueChange={v => { setSellerRole(v); setSellerPage(0); setClientPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="sales_consultant">Consultor de Vendas</SelectItem>
                    <SelectItem value="rac">RAC</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Vendedor - hidden for sellers */}
            {showSellerFilter && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendedor</label>
                <Select value={sellerId} onValueChange={v => { setSellerId(v); setSellerPage(0); setClientPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {consultants.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Page size */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Itens por página</label>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setSellerPage(0); setClientPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setSelectedSellerForClients(null); }}>
        {isSeller ? (
          /* Simplified tabs for seller */
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vendedores">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Meu Resumo
            </TabsTrigger>
            <TabsTrigger value="clientes">
              <UserCheck className="h-4 w-4 mr-1.5" />
              Meus Clientes
            </TabsTrigger>
          </TabsList>
        ) : (
          /* Full tabs for managers */
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="vendedores">
              <Users className="h-4 w-4 mr-1.5" />
              Resumo por Vendedor
            </TabsTrigger>
            <TabsTrigger value="clientes">
              <UserCheck className="h-4 w-4 mr-1.5" />
              Clientes por Vendedor
            </TabsTrigger>
            <TabsTrigger value="cargos">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Resumo por Cargo
            </TabsTrigger>
            <TabsTrigger value="rac">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Resumo RAC
            </TabsTrigger>
          </TabsList>
        )}

        {/* ===== TAB: Resumo por Vendedor / Meu Resumo ===== */}
        <TabsContent value="vendedores" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {isSeller ? 'Meu Resumo de Atividades' : `Resumo por Vendedor (${sortedSellers.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sellerLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
              ) : sortedSellers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para os filtros selecionados.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1200px]">
                      <TableHeader>
                        <TableRow>
                          {!isSeller && <SortableHeader label="Vendedor" sortKey="seller_name" sort={sellerSort} onSort={() => toggleSort('seller_name', sellerSort, setSellerSort)} />}
                          {!isSeller && <TableHead>Tipo</TableHead>}
                          <SortableHeader label="Filial" sortKey="filial" sort={sellerSort} onSort={() => toggleSort('filial', sellerSort, setSellerSort)} />
                          <SortableHeader label="Visitas" sortKey="visitas" sort={sellerSort} onSort={() => toggleSort('visitas', sellerSort, setSellerSort)} />
                          <SortableHeader label="Ligações" sortKey="ligacoes" sort={sellerSort} onSort={() => toggleSort('ligacoes', sellerSort, setSellerSort)} />
                          <SortableHeader label="Checklists" sortKey="checklists" sort={sellerSort} onSort={() => toggleSort('checklists', sellerSort, setSellerSort)} />
                          <SortableHeader label="Total Ativ." sortKey="total_atividades" sort={sellerSort} onSort={() => toggleSort('total_atividades', sellerSort, setSellerSort)} />
                          <SortableHeader label="Clientes" sortKey="clientes_atendidos" sort={sellerSort} onSort={() => toggleSort('clientes_atendidos', sellerSort, setSellerSort)} />
                          <SortableHeader label="Oport. Gerada" sortKey="oportunidade_gerada" sort={sellerSort} onSort={() => toggleSort('oportunidade_gerada', sellerSort, setSellerSort)} />
                          <SortableHeader label="Valor Convertido" sortKey="valor_convertido" sort={sellerSort} onSort={() => toggleSort('valor_convertido', sellerSort, setSellerSort)} />
                          <SortableHeader label="Conversão" sortKey="taxa_conversao" sort={sellerSort} onSort={() => toggleSort('taxa_conversao', sellerSort, setSellerSort)} />
                          <SortableHeader label="Última Ativ." sortKey="ultima_atividade" sort={sellerSort} onSort={() => toggleSort('ultima_atividade', sellerSort, setSellerSort)} />
                          {!isSeller && <TableHead>Ações</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedSellers.map((s, i) => (
                          <TableRow key={`${s.seller_id}-${s.filial}-${i}`}>
                            {!isSeller && <TableCell className="font-medium min-w-[150px]">{s.seller_name}</TableCell>}
                            {!isSeller && <TableCell className="whitespace-nowrap"><Badge variant={roleBadgeVariant(s.seller_role) as any}>{roleLabel(s.seller_role)}</Badge></TableCell>}
                            <TableCell className="whitespace-nowrap">{s.filial || '—'}</TableCell>
                            <TableCell className="text-center">{Number(s.visitas)}</TableCell>
                            <TableCell className="text-center">{Number(s.ligacoes)}</TableCell>
                            <TableCell className="text-center">{Number(s.checklists)}</TableCell>
                            <TableCell className="text-center font-medium">{Number(s.total_atividades)}</TableCell>
                            <TableCell className="text-center">{Number(s.clientes_atendidos)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{formatCurrency(Number(s.oportunidade_gerada))}</TableCell>
                            <TableCell className="text-right font-bold text-success">{formatCurrency(Number(s.valor_convertido))}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={Number(s.taxa_conversao) >= 30 ? 'success' : Number(s.taxa_conversao) >= 10 ? 'warning' : 'outline'}>
                                {Number(s.taxa_conversao).toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {s.ultima_atividade ? format(new Date(s.ultima_atividade), 'dd/MM/yyyy') : '—'}
                            </TableCell>
                            {!isSeller && (
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => handleViewPortfolio(s.seller_id)}>
                                  <Eye className="h-4 w-4 mr-1" /> Ver Carteira
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={sellerPage} totalPages={sellerTotalPages} setPage={setSellerPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Clientes por Vendedor / Meus Clientes ===== */}
        <TabsContent value="clientes" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {isSeller ? `Meus Clientes (${sortedClients.length})` : `Clientes por Vendedor (${sortedClients.length})`}
                  {!isSeller && selectedSellerForClients && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      — Filtrado por vendedor
                    </span>
                  )}
                </CardTitle>
                {!isSeller && selectedSellerForClients && (
                  <Button variant="outline" size="sm" onClick={() => setSelectedSellerForClients(null)}>
                    Limpar filtro de vendedor
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {clientLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
              ) : sortedClients.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1200px]">
                      <TableHeader>
                        <TableRow>
                          <SortableHeader label="Cliente" sortKey="client_name" sort={clientSort} onSort={() => toggleSort('client_name', clientSort, setClientSort)} />
                          {!isSeller && <SortableHeader label="Vendedor" sortKey="seller_name" sort={clientSort} onSort={() => toggleSort('seller_name', clientSort, setClientSort)} />}
                          {!isSeller && <TableHead>Tipo</TableHead>}
                          {!isSeller && <SortableHeader label="Filial" sortKey="filial" sort={clientSort} onSort={() => toggleSort('filial', clientSort, setClientSort)} />}
                          <SortableHeader label="Total Ativ." sortKey="total_atividades" sort={clientSort} onSort={() => toggleSort('total_atividades', clientSort, setClientSort)} />
                          <SortableHeader label="Visitas" sortKey="visitas" sort={clientSort} onSort={() => toggleSort('visitas', clientSort, setClientSort)} />
                          <SortableHeader label="Ligações" sortKey="ligacoes" sort={clientSort} onSort={() => toggleSort('ligacoes', clientSort, setClientSort)} />
                          <SortableHeader label="Checklists" sortKey="checklists" sort={clientSort} onSort={() => toggleSort('checklists', clientSort, setClientSort)} />
                          <SortableHeader label="Oport. Gerada" sortKey="oportunidade_gerada" sort={clientSort} onSort={() => toggleSort('oportunidade_gerada', clientSort, setClientSort)} />
                          <SortableHeader label="Valor Convertido" sortKey="valor_convertido" sort={clientSort} onSort={() => toggleSort('valor_convertido', clientSort, setClientSort)} />
                          <TableHead>Status</TableHead>
                          <SortableHeader label="Última Ativ." sortKey="ultima_atividade" sort={clientSort} onSort={() => toggleSort('ultima_atividade', clientSort, setClientSort)} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedClients.map((c, i) => (
                          <TableRow key={`${c.seller_id}-${c.client_name}-${i}`}>
                            <TableCell className="font-medium min-w-[150px]">{c.client_name}</TableCell>
                            {!isSeller && <TableCell className="min-w-[130px]">{c.seller_name}</TableCell>}
                            {!isSeller && <TableCell className="whitespace-nowrap"><Badge variant={roleBadgeVariant(c.seller_role) as any}>{roleLabel(c.seller_role)}</Badge></TableCell>}
                            {!isSeller && <TableCell className="whitespace-nowrap">{c.filial || '—'}</TableCell>}
                            <TableCell className="text-center font-medium">{Number(c.total_atividades)}</TableCell>
                            <TableCell className="text-center">{Number(c.visitas)}</TableCell>
                            <TableCell className="text-center">{Number(c.ligacoes)}</TableCell>
                            <TableCell className="text-center">{Number(c.checklists)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{formatCurrency(Number(c.oportunidade_gerada))}</TableCell>
                            <TableCell className="text-right font-bold text-success">{formatCurrency(Number(c.valor_convertido))}</TableCell>
                            <TableCell>{statusBadge(c.status_cliente)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.ultima_atividade ? format(new Date(c.ultima_atividade), 'dd/MM/yyyy') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={clientPage} totalPages={clientTotalPages} setPage={setClientPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Resumo por Cargo (managers only) ===== */}
        {!isSeller && (
          <TabsContent value="cargos" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Resumo por Cargo</CardTitle>
              </CardHeader>
              <CardContent>
                {sellerLoading ? (
                  <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                ) : roleSummary.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado.</p>
                ) : (
                  <div className="overflow-x-auto"><Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo de Vendedor</TableHead>
                        <TableHead className="text-center">Qtd. Vendedores</TableHead>
                        <TableHead className="text-center">Total de Atividades</TableHead>
                        <TableHead className="text-right">Oportunidade Gerada</TableHead>
                        <TableHead className="text-right">Valor Convertido</TableHead>
                        <TableHead className="text-center">Taxa de Conversão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roleSummary.map(r => (
                        <TableRow key={r.role}>
                          <TableCell><Badge variant={roleBadgeVariant(r.role) as any}>{roleLabel(r.role)}</Badge></TableCell>
                          <TableCell className="text-center font-medium">{r.count}</TableCell>
                          <TableCell className="text-center">{r.atividades}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{formatCurrency(r.oportunidade)}</TableCell>
                          <TableCell className="text-right font-bold text-success">{formatCurrency(r.convertido)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={r.taxa >= 30 ? 'success' : r.taxa >= 10 ? 'warning' : 'outline'}>
                              {r.taxa.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ===== TAB: Resumo RAC (managers only) ===== */}
        {!isSeller && (
          <TabsContent value="rac" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Resumo RAC ({sortedRac.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {racLoading ? (
                  <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                ) : sortedRac.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum RAC encontrado para os filtros selecionados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1100px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendedor</TableHead>
                          <TableHead>Filial</TableHead>
                          <TableHead className="text-center">Visitas</TableHead>
                          <TableHead className="text-center">Ligações</TableHead>
                          <TableHead className="text-center">Total Ativ.</TableHead>
                          <TableHead className="text-center">Clientes</TableHead>
                          <TableHead className="text-right">Oport. Gerada</TableHead>
                          <TableHead className="text-right">Valor Convertido</TableHead>
                          <TableHead className="text-center">Conversão</TableHead>
                          <TableHead className="text-right">Ticket Médio/Cliente</TableHead>
                          <TableHead className="text-right">Oport./Atividade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRac.map((s, i) => {
                          const ticketMedio = Number(s.clientes_atendidos) > 0 ? Number(s.valor_convertido) / Number(s.clientes_atendidos) : 0;
                          const oportPorAtiv = Number(s.total_atividades) > 0 ? Number(s.oportunidade_gerada) / Number(s.total_atividades) : 0;
                          return (
                            <TableRow key={`${s.seller_id}-${s.filial}-${i}`}>
                              <TableCell className="font-medium min-w-[150px]">{s.seller_name}</TableCell>
                              <TableCell className="whitespace-nowrap">{s.filial || '—'}</TableCell>
                              <TableCell className="text-center">{Number(s.visitas)}</TableCell>
                              <TableCell className="text-center">{Number(s.ligacoes)}</TableCell>
                              <TableCell className="text-center font-medium">{Number(s.total_atividades)}</TableCell>
                              <TableCell className="text-center">{Number(s.clientes_atendidos)}</TableCell>
                              <TableCell className="text-right font-semibold text-primary">{formatCurrency(Number(s.oportunidade_gerada))}</TableCell>
                              <TableCell className="text-right font-bold text-success">{formatCurrency(Number(s.valor_convertido))}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={Number(s.taxa_conversao) >= 30 ? 'success' : Number(s.taxa_conversao) >= 10 ? 'warning' : 'outline'}>
                                  {Number(s.taxa_conversao).toFixed(1)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(ticketMedio)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(oportPorAtiv)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Management;

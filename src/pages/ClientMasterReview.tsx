import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert, Search, CheckCircle2, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

interface ConflictRow {
  id: string;
  client_code: string;
  client_code_norm: string;
  client_name: string;
  client_name_norm: string;
  source: string;
  name_variants: string[];
  name_conflict: boolean;
  updated_at: string;
}

function parseVariants(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

export const ClientMasterReview: React.FC = () => {
  const { isAdmin, isManager, isLoading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const canAccess = isAdmin || isManager;

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ConflictRow | null>(null);
  const [manualName, setManualName] = useState('');
  const [mode, setMode] = useState<'choose' | 'manual'>('choose');

  const debouncedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const conflictsQuery = useQuery({
    queryKey: ['clients-master-conflicts', page, debouncedSearch],
    queryFn: async () => {
      let query = supabase
        .from('clients_master')
        .select('id, client_code, client_code_norm, client_name, client_name_norm, source, name_variants, name_conflict, updated_at', { count: 'exact' })
        .eq('name_conflict', true)
        .order('client_code_norm', { ascending: true });

      if (debouncedSearch) {
        query = query.or(`client_code_norm.ilike.%${debouncedSearch}%,client_name.ilike.%${debouncedSearch}%`);
      }

      const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw new Error(error.message);

      return {
        rows: (data || []).map((row): ConflictRow => ({
          ...row,
          name_variants: parseVariants(row.name_variants),
        })),
        total: count || 0,
      };
    },
    enabled: canAccess,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const statsQuery = useQuery({
    queryKey: ['clients-master-conflicts-stats'],
    queryFn: async () => {
      const { count: totalConflicts, error: err1 } = await supabase
        .from('clients_master')
        .select('*', { count: 'exact', head: true })
        .eq('name_conflict', true);

      const { count: totalBase, error: err2 } = await supabase
        .from('clients_master')
        .select('*', { count: 'exact', head: true });

      if (err1) throw new Error(err1.message);
      if (err2) throw new Error(err2.message);

      return {
        conflicts: totalConflicts || 0,
        total: totalBase || 0,
      };
    },
    enabled: canAccess,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, newName, type }: { id: string; newName: string; type: 'choose' | 'manual' }) => {
      const { data, error } = await supabase.rpc('resolve_client_name_conflict', {
        p_id: id,
        p_new_name: newName,
        p_resolution_type: type,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success('Conflito resolvido com sucesso');
      queryClient.invalidateQueries({ queryKey: ['clients-master-conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['clients-master-conflicts-stats'] });
      setSelected(null);
      setManualName('');
      setMode('choose');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Erro ao resolver conflito');
    },
  });

  const totalPages = Math.ceil((conflictsQuery.data?.total || 0) / PAGE_SIZE);

  const openResolve = (row: ConflictRow, initialMode: 'choose' | 'manual' = 'choose') => {
    setSelected(row);
    setMode(initialMode);
    setManualName(initialMode === 'manual' ? row.client_name : '');
  };

  const handleMarkReviewed = (row: ConflictRow) => {
    resolveMutation.mutate({ id: row.id, newName: row.client_name, type: 'choose' });
  };

  const handleResolve = () => {
    if (!selected) return;
    const newName = mode === 'manual' ? manualName.trim() : selected.client_name;
    if (!newName) {
      toast.error('Informe um nome válido');
      return;
    }
    resolveMutation.mutate({ id: selected.id, newName, type: mode });
  };

  if (roleLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader className="items-center text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta tela é exclusiva para administradores e gerentes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revisão de Conflitos de Nome</h1>
          <p className="text-sm text-muted-foreground">
            Base mestre de clientes · Escolha o nome oficial ou edite manualmente.
          </p>
        </div>
        <Button variant="outline" onClick={() => { conflictsQuery.refetch(); statsQuery.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Conflitos pendentes</p>
            <p className="mt-1 text-2xl font-semibold text-destructive">
              {statsQuery.isLoading ? '-' : new Intl.NumberFormat('pt-BR').format(statsQuery.data?.conflicts || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Base mestre total</p>
            <p className="mt-1 text-2xl font-semibold">
              {statsQuery.isLoading ? '-' : new Intl.NumberFormat('pt-BR').format(statsQuery.data?.total || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Progresso da revisão</p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {statsQuery.isLoading || !statsQuery.data?.total
                ? '-'
                : `${((1 - (statsQuery.data.conflicts / statsQuery.data.total)) * 100).toFixed(2)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Página {page + 1} de {totalPages || 1} · {conflictsQuery.data?.total || 0} registros
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Nome atual</TableHead>
                  <TableHead>Variantes</TableHead>
                  <TableHead className="w-32">Origem</TableHead>
                  <TableHead className="w-48">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflictsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Carregando conflitos...
                    </TableCell>
                  </TableRow>
                ) : conflictsQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-destructive">
                      Erro ao carregar: {(conflictsQuery.error as Error).message}
                    </TableCell>
                  </TableRow>
                ) : conflictsQuery.data?.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                        <span>Nenhum conflito pendente.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  conflictsQuery.data?.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{row.client_code_norm}</TableCell>
                      <TableCell className="font-medium">{row.client_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.name_variants.slice(0, 4).map((variant, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs font-normal">
                              {variant}
                            </Badge>
                          ))}
                          {row.name_variants.length > 4 && (
                            <Badge variant="outline" className="text-xs">+{row.name_variants.length - 4}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.source === 'erp_import' ? 'default' : 'outline'} className="text-xs">
                          {row.source === 'erp_import' ? 'ERP' : 'Legado'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => openResolve(row, 'choose')}>
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Escolher
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openResolve(row, 'manual')}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => handleMarkReviewed(row)}
                            disabled={resolveMutation.isPending}
                          >
                            Revisado
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || conflictsQuery.isLoading}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || conflictsQuery.isLoading}
              >
                Próxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setManualName(''); setMode('choose'); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Resolver conflito de nome
            </DialogTitle>
            <DialogDescription>
              Código <span className="font-mono font-medium">{selected?.client_code_norm}</span> · {selected?.name_variants.length} variantes encontradas
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Nome atual</p>
                <p className="mt-1 font-medium">{selected.client_name}</p>
              </div>

              {mode === 'choose' ? (
                <div className="space-y-2">
                  <Label>Escolha o nome oficial entre as variantes</Label>
                  <div className="grid gap-2">
                    {selected.name_variants.map((variant, idx) => (
                      <Button
                        key={idx}
                        type="button"
                        variant={selected.client_name === variant ? 'default' : 'outline'}
                        className="justify-start h-auto py-2 px-3 text-left"
                        onClick={() => setSelected({ ...selected, client_name: variant })}
                      >
                        {variant}
                        {selected.client_name === variant && (
                          <CheckCircle2 className="ml-auto h-4 w-4" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="manual-name">Editar nome manualmente</Label>
                  <Textarea
                    id="manual-name"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Digite o nome correto do cliente..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    O nome será normalizado (maiúsculas, sem acentos) e adicionado às variantes caso ainda não exista.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={mode === 'choose' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('choose')}
                >
                  Escolher das variantes
                </Button>
                <Button
                  type="button"
                  variant={mode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('manual')}
                >
                  Editar manualmente
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => { setSelected(null); setManualName(''); setMode('choose'); }}
              disabled={resolveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResolve}
              disabled={resolveMutation.isPending || (mode === 'manual' && !manualName.trim())}
            >
              {resolveMutation.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar resolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientMasterReview;

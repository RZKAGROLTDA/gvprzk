import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, Search, RefreshCw, ChevronDown, ChevronUp, Pencil, Tractor, Star,
} from 'lucide-react';
import { EquipmentEditDialog } from './EquipmentEditDialog';
import {
  machineStatusLabel, statusBadgeVariant, VALIDATION_PRIORITY_LABEL,
} from './equipmentConstants';
import {
  useEquipmentByClient, type ClientEquipment,
} from '@/hooks/useClientEquipment';
import { cn } from '@/lib/utils';

interface Props {
  clientCode?: string;
  clientName?: string;
  /** Quando true, mostra checkbox para seleção de equipamentos da visita */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

/**
 * Bloco "Parque de Máquinas" — resumo + lista compacta colapsável.
 * Mostra um resumo (total, ativas, paradas, sem atualização) e, ao expandir,
 * exibe uma tabela compacta com checkbox de seleção, modelo, série, horas,
 * ano, status e PUK. Edição abre dialog lateral (não expande linha).
 */
export const EquipmentParkBlock: React.FC<Props> = ({
  clientCode,
  clientName,
  selectable,
  selectedIds = [],
  onSelectionChange,
}) => {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<ClientEquipment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data: equipments = [], isLoading, refetch, isFetching } =
    useEquipmentByClient(clientCode, clientName);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return equipments;
    return equipments.filter((e) =>
      e.model?.toLowerCase().includes(term) ||
      e.serial_chassis?.toLowerCase().includes(term) ||
      e.machine_type?.toLowerCase().includes(term)
    );
  }, [equipments, filter]);

  const summary = useMemo(() => {
    const total = equipments.length;
    const ativas = equipments.filter((e) => e.machine_status === 'ativa').length;
    const paradas = equipments.filter((e) =>
      ['inativa', 'sucateada'].includes(e.machine_status ?? ''),
    ).length;
    const semAtualizacao = equipments.filter((e) => !e.last_validation_at).length;
    const prioridade = equipments.filter((e) => e.validation_priority).length;
    return { total, ativas, paradas, semAtualizacao, prioridade };
  }, [equipments]);

  const selectedEquipments = useMemo(
    () => equipments.filter((e) => selectedIds.includes(e.id)),
    [equipments, selectedIds],
  );

  const toggleSelect = (id: string, next: boolean) => {
    if (!onSelectionChange) return;
    const set = new Set(selectedIds);
    if (next) set.add(id);
    else set.delete(id);
    onSelectionChange(Array.from(set));
  };

  const selectAll = () => onSelectionChange?.(filtered.map((e) => e.id));
  const clearSelection = () => onSelectionChange?.([]);

  const handleEdit = (eq: ClientEquipment) => {
    setEditing(eq);
    setDialogOpen(true);
  };

  const hasClient = !!(clientCode?.trim() || clientName?.trim());

  return (
    <div className="space-y-3">
      {/* Resumo + ações */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <Tractor className="h-4 w-4 text-muted-foreground" />
              <span>{summary.total} máquina{summary.total === 1 ? '' : 's'}</span>
            </div>
            <Badge variant="default" className="text-[10px]">
              {summary.ativas} ativas
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {summary.paradas} paradas
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {summary.semAtualizacao} sem atualização
            </Badge>
            {summary.prioridade > 0 && (
              <Badge variant="warning" className="text-[10px] gap-1">
                <Star className="h-3 w-3 fill-current" />
                {summary.prioridade} prioridade validação
              </Badge>
            )}
            {selectable && selectedIds.length > 0 && (
              <Badge variant="default" className="text-[10px] bg-primary">
                {selectedIds.length} selecionada{selectedIds.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button" size="sm" variant="ghost"
              onClick={() => refetch()} disabled={!hasClient || isFetching}
              title="Atualizar"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => setExpanded((v) => !v)}
              disabled={!hasClient || equipments.length === 0}
            >
              {expanded ? (
                <><ChevronUp className="h-4 w-4 mr-1.5" /> Ocultar Equipamentos</>
              ) : (
                <><ChevronDown className="h-4 w-4 mr-1.5" /> Mostrar Equipamentos</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {!hasClient && (
        <p className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-4 text-center">
          Informe o código ou nome do cliente para carregar o parque de máquinas.
        </p>
      )}

      {hasClient && isLoading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipamentos...
        </div>
      )}

      {hasClient && !isLoading && equipments.length === 0 && (
        <p className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-4 text-center">
          Nenhum equipamento cadastrado para este cliente ainda.
        </p>
      )}

      {/* Selecionadas para esta visita (sempre visível quando há seleção) */}
      {selectable && selectedEquipments.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5">
          <div className="px-3 py-2 border-b border-primary/20 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Selecionados para esta visita ({selectedEquipments.length})
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={clearSelection}
              className="h-7 text-xs">
              Limpar
            </Button>
          </div>
          <CompactList
            equipments={selectedEquipments}
            selectable={selectable}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onEdit={handleEdit}
            maxHeightClass="max-h-56"
          />
        </div>
      )}

      {/* Parque completo (colapsável) */}
      {expanded && equipments.length > 0 && (
        <div className="rounded-lg border border-border/60">
          <div className="px-3 py-2 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por modelo, chassi ou tipo..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {filtered.length}{filter && ` de ${equipments.length}`}
              </span>
              {selectable && (
                selectedIds.length > 0 ? (
                  <Button type="button" size="sm" variant="ghost"
                    onClick={clearSelection} className="h-7 text-xs">
                    Limpar
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="ghost"
                    onClick={selectAll} className="h-7 text-xs">
                    Selecionar todos
                  </Button>
                )
              )}
            </div>
          </div>
          <CompactList
            equipments={filtered}
            selectable={selectable}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onEdit={handleEdit}
            maxHeightClass="max-h-[480px]"
          />
        </div>
      )}

      <EquipmentEditDialog
        equipment={editing}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
      />
    </div>
  );
};

/* ----------------------------- Lista compacta ----------------------------- */

interface CompactListProps {
  equipments: ClientEquipment[];
  selectable?: boolean;
  selectedIds: string[];
  onToggle: (id: string, next: boolean) => void;
  onEdit: (eq: ClientEquipment) => void;
  maxHeightClass?: string;
}

const CompactList: React.FC<CompactListProps> = ({
  equipments, selectable, selectedIds, onToggle, onEdit, maxHeightClass = 'max-h-96',
}) => {
  if (equipments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhum equipamento encontrado.
      </p>
    );
  }
  return (
    <>
      {/* Desktop: tabela */}
      <div className={cn('hidden md:block overflow-auto', maxHeightClass)}>
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left text-muted-foreground">
              {selectable && <th className="w-8 px-2 py-2"></th>}
              <th className="px-2 py-2 font-medium">Modelo</th>
              <th className="px-2 py-2 font-medium">Série/Chassi</th>
              <th className="px-2 py-2 font-medium text-right">Horas</th>
              <th className="px-2 py-2 font-medium text-right">Ano</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Validado em</th>
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {equipments.map((eq) => {
              const checked = selectedIds.includes(eq.id);
              const priority = !!eq.validation_priority;
              return (
                <tr
                  key={eq.id}
                  className={cn(
                    'border-t border-border/40 hover:bg-muted/30',
                    checked && 'bg-primary/5',
                    priority && 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500',
                  )}
                >
                  {selectable && (
                    <td className="px-2 py-1.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => onToggle(eq.id, !!v)}
                        aria-label="Selecionar"
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5 font-medium truncate max-w-[220px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {priority && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                      <span className="truncate">{eq.model || '—'}</span>
                      {eq.machine_type && (
                        <span className="text-[10px] text-muted-foreground uppercase">
                          · {eq.machine_type}
                        </span>
                      )}
                      {priority && (
                        <Badge variant="warning" className="text-[9px] px-1.5 py-0">
                          {VALIDATION_PRIORITY_LABEL}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] truncate max-w-[140px]">
                    {eq.serial_chassis || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {eq.hours != null ? eq.hours : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {eq.year || '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[10px]">
                      {machineStatusLabel(eq.machine_status)}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                    {eq.last_validation_at
                      ? new Date(eq.last_validation_at).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => onEdit(eq)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: linhas condensadas */}
      <div className={cn('md:hidden overflow-auto divide-y divide-border/40', maxHeightClass)}>
        {equipments.map((eq) => {
          const checked = selectedIds.includes(eq.id);
          const priority = !!eq.validation_priority;
          return (
            <div
              key={eq.id}
              className={cn(
                'flex items-start gap-2 px-3 py-2',
                checked && 'bg-primary/5',
                priority && 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500',
              )}
            >
              {selectable && (
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => onToggle(eq.id, !!v)}
                  className="mt-1"
                  aria-label="Selecionar"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {priority && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  <p className="text-sm font-medium truncate">{eq.model || '—'}</p>
                  <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[9px]">
                    {machineStatusLabel(eq.machine_status)}
                  </Badge>
                  {priority && (
                    <Badge variant="warning" className="text-[9px]">
                      {VALIDATION_PRIORITY_LABEL}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {eq.serial_chassis || '—'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {eq.hours != null ? `${eq.hours} h` : '— h'} · {eq.year || '—'}
                  {eq.last_validation_at && (
                    <> · val. {new Date(eq.last_validation_at).toLocaleDateString('pt-BR')}</>
                  )}
                </p>
              </div>
              <Button
                type="button" size="sm" variant="ghost"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => onEdit(eq)}
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
};

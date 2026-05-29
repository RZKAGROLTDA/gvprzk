import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RefreshCw } from 'lucide-react';
import { EquipmentCard } from './EquipmentCard';
import { EquipmentEditDialog } from './EquipmentEditDialog';
import {
  useEquipmentByClient, type ClientEquipment,
} from '@/hooks/useClientEquipment';

interface Props {
  clientCode?: string;
  clientName?: string;
  /** Quando true, mostra checkbox para seleção de equipamentos da visita */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

/**
 * Bloco reutilizável "Parque de Máquinas" — busca por código/nome/chassi,
 * lista em cards, permite editar/validar e (opcionalmente) selecionar
 * equipamentos para vincular à visita atual.
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

  const { data: equipments = [], isLoading, refetch, isFetching } =
    useEquipmentByClient(clientCode, clientName);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return equipments;
    return equipments.filter((e) => {
      return (
        e.model?.toLowerCase().includes(term) ||
        e.serial_chassis?.toLowerCase().includes(term) ||
        e.machine_type?.toLowerCase().includes(term)
      );
    });
  }, [equipments, filter]);

  const toggleSelect = (id: string, next: boolean) => {
    if (!onSelectionChange) return;
    const set = new Set(selectedIds);
    if (next) set.add(id);
    else set.delete(id);
    onSelectionChange(Array.from(set));
  };

  const selectAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(filtered.map((e) => e.id));
  };

  const clearSelection = () => onSelectionChange?.([]);

  const handleEdit = (eq: ClientEquipment) => {
    setEditing(eq);
    setDialogOpen(true);
  };

  const hasClient = !!(clientCode?.trim() || clientName?.trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por modelo, chassi ou tipo..."
            className="pl-8"
            disabled={!hasClient || equipments.length === 0}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => refetch()} disabled={!hasClient || isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {selectable && filtered.length > 0 && (
            selectedIds.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                Limpar ({selectedIds.length})
              </Button>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={selectAll}>
                Selecionar todos
              </Button>
            )
          )}
        </div>
      </div>

      {!hasClient && (
        <p className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-4 text-center">
          Informe o código ou nome do cliente para carregar o parque de máquinas.
        </p>
      )}

      {hasClient && isLoading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipamentos...
        </div>
      )}

      {hasClient && !isLoading && equipments.length === 0 && (
        <p className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-4 text-center">
          Nenhum equipamento cadastrado para este cliente ainda.
        </p>
      )}

      {filtered.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filtered.length} equipamento{filtered.length === 1 ? '' : 's'}
              {filter && ` (filtrado de ${equipments.length})`}
            </span>
            {selectable && selectedIds.length > 0 && (
              <Badge variant="default">{selectedIds.length} selecionado(s)</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((eq) => (
              <EquipmentCard
                key={eq.id}
                equipment={eq}
                selectable={selectable}
                selected={selectedIds.includes(eq.id)}
                onToggleSelect={toggleSelect}
                onEdit={handleEdit}
              />
            ))}
          </div>
        </>
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

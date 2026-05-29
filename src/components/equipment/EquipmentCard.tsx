import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Tractor } from 'lucide-react';
import {
  machineStatusLabel,
  pukLabel,
  statusBadgeVariant,
} from './equipmentConstants';
import type { ClientEquipment } from '@/hooks/useClientEquipment';

interface Props {
  equipment: ClientEquipment;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
  onEdit?: (eq: ClientEquipment) => void;
  showClient?: boolean;
}

export const EquipmentCard: React.FC<Props> = ({
  equipment: eq,
  selectable,
  selected,
  onToggleSelect,
  onEdit,
  showClient = false,
}) => {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={(v) => onToggleSelect?.(eq.id, !!v)}
              className="mt-1"
              aria-label="Selecionar equipamento"
            />
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">
            <Tractor className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium truncate">{eq.model || 'Modelo não informado'}</p>
              {eq.machine_type && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {eq.machine_type}
                </Badge>
              )}
              <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[10px]">
                {machineStatusLabel(eq.machine_status)}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {pukLabel(eq.puk_status)}
              </Badge>
            </div>
            {showClient && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {eq.client_code ? `${eq.client_code} · ` : ''}
                {eq.client_name}
              </p>
            )}
          </div>
          {onEdit && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onEdit(eq)}
              aria-label="Editar equipamento"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs">
          <Field label="Chassi/Série" value={eq.serial_chassis || '—'} />
          <Field label="Ano" value={eq.year ? String(eq.year) : '—'} />
          <Field label="Horas" value={eq.hours != null ? String(eq.hours) : '—'} />
          <Field
            label="Validado em"
            value={
              eq.last_validation_at
                ? new Date(eq.last_validation_at).toLocaleDateString('pt-BR')
                : '—'
            }
          />
        </div>

        {eq.observation && (
          <p className="text-xs text-muted-foreground line-clamp-2 border-t border-border/40 pt-2">
            {eq.observation}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-muted-foreground">{label}</p>
    <p className="font-medium truncate">{value}</p>
  </div>
);

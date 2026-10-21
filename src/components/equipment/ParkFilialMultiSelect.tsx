import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface Props {
  options: { id: string; nome: string }[];
  selected: string[];
  semFilial: boolean;
  canSemFilial: boolean;
  onChange: (ids: string[], semFilial: boolean) => void;
  disabled?: boolean;
}

/** Filtro "Filiais" (filial cadastrada da máquina) — só nos painéis de Validação. */
export const ParkFilialMultiSelect: React.FC<Props> = ({ options, selected, semFilial, canSemFilial, onChange, disabled = false }) => {
  const sel = new Set(selected);
  const count = selected.length + (canSemFilial && semFilial ? 1 : 0);
  const totalOpts = options.length + (canSemFilial ? 1 : 0);
  const label =
    count === 0 ? 'Nenhuma selecionada'
    : count === totalOpts ? 'Todas'
    : count === 1 && selected.length === 1 ? options.find((o) => o.id === selected[0])?.nome ?? '1 filial'
    : count === 1 ? 'Sem filial'
    : `${count} selecionadas`;

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next), semFilial);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button disabled={disabled} variant="outline" className="w-full justify-between font-normal" aria-label="Filiais">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex gap-2 mb-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
            onClick={() => onChange(options.map((o) => o.id), canSemFilial)}>
            Selecionar todas
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange([], false)}>
            Limpar seleção
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-muted cursor-pointer">
              <Checkbox checked={sel.has(o.id)} onCheckedChange={() => toggle(o.id)} />
              <span className="truncate">{o.nome}</span>
            </label>
          ))}
          {canSemFilial && (
            <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-muted cursor-pointer border-t border-border/40 mt-1 pt-2">
              <Checkbox checked={semFilial} onCheckedChange={() => onChange(selected, !semFilial)} />
              <span>Sem filial</span>
            </label>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { PopsPlatformFilter } from '@/hooks/usePops';

export type PortfolioFilters = {
  client: string;
  serial: string;
  model: string;
  platform: PopsPlatformFilter;
};

type Props = {
  value: PortfolioFilters;
  onChange: (next: PortfolioFilters) => void;
};

const PlatformSelect: React.FC<Props> = ({ value, onChange }) => (
  <Select
    value={value.platform}
    onValueChange={(v) => onChange({ ...value, platform: v as PopsPlatformFilter })}
  >
    <SelectTrigger className="w-full sm:w-36">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todas</SelectItem>
      <SelectItem value="Large">Large</SelectItem>
      <SelectItem value="Small">Small</SelectItem>
    </SelectContent>
  </Select>
);

export const PopsPortfolioFilters: React.FC<Props> = ({ value, onChange }) => {
  const extraActive =
    (value.model.trim() ? 1 : 0) + (value.platform !== 'all' ? 1 : 0);
  const anyActive =
    !!value.client.trim() || !!value.serial.trim() || extraActive > 0;

  const clearAll = () => onChange({ client: '', serial: '', model: '', platform: 'all' });

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.client}
            onChange={(e) => onChange({ ...value, client: e.target.value })}
            placeholder="Buscar cliente"
            className="pl-9"
            aria-label="Buscar cliente"
          />
        </div>
        <div className="relative flex-1 sm:max-w-[13rem]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.serial}
            onChange={(e) => onChange({ ...value, serial: e.target.value })}
            placeholder="Chassi / Série"
            className="pl-9 font-mono"
            aria-label="Buscar chassi ou série"
          />
        </div>

        {/* Desktop: filtros inline */}
        <div className="hidden sm:flex items-center gap-2">
          <Input
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            placeholder="Máquina / Modelo"
            className="w-40"
            aria-label="Buscar máquina ou modelo"
          />
          <PlatformSelect value={value} onChange={onChange} />
        </div>

        {/* Mobile: bloco compacto */}
        <div className="flex items-center gap-2 sm:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filtros
                {extraActive > 0 && (
                  <Badge variant="secondary" className="ml-2">{extraActive}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Máquina / Modelo</Label>
                <Input
                  value={value.model}
                  onChange={(e) => onChange({ ...value, model: e.target.value })}
                  placeholder="Ex.: 8R"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Plataforma</Label>
                <PlatformSelect value={value} onChange={onChange} />
              </div>
            </PopoverContent>
          </Popover>
          {anyActive && (
            <Button variant="ghost" size="icon" onClick={clearAll} aria-label="Limpar filtros">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {anyActive && (
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={clearAll}>
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        )}
      </div>
    </div>
  );
};

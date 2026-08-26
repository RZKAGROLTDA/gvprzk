import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getRoleLabel } from '@/lib/roles';
import { TEAM_MEMBER_ROLES, type MyDayTeamFilters, type MyDayTeamRow } from '@/lib/myDay';

interface TeamFiltersProps {
  /** Supervisor não escolhe filial (escopo fixo no banco). */
  showFilialFilter: boolean;
  filiais: { id: string; nome: string }[];
  filters: MyDayTeamFilters;
  onChange: (next: MyDayTeamFilters) => void;
  /** Colaboradores da consulta atual, usados para o seletor de nome. */
  rows: MyDayTeamRow[];
  search: string;
  onSearchChange: (value: string) => void;
}

const ALL = 'all';

export const TeamFilters: React.FC<TeamFiltersProps> = ({
  showFilialFilter,
  filiais,
  filters,
  onChange,
  rows,
  search,
  onSearchChange,
}) => {
  const colaboradores = React.useMemo(
    () =>
      [...rows]
        .map((r) => ({ id: r.user_id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [rows],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {showFilialFilter && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Filial</Label>
          <Select
            value={filters.filialId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, filialId: v === ALL ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas as filiais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as filiais</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Cargo</Label>
        <Select
          value={filters.role ?? ALL}
          onValueChange={(v) => onChange({ ...filters, role: v === ALL ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todos os cargos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os cargos</SelectItem>
            {TEAM_MEMBER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {getRoleLabel(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Colaborador</Label>
        <Select
          value={filters.userId ?? ALL}
          onValueChange={(v) => onChange({ ...filters, userId: v === ALL ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todos os colaboradores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os colaboradores</SelectItem>
            {colaboradores.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Buscar por nome</Label>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Digite o nome"
        />
      </div>
    </div>
  );
};

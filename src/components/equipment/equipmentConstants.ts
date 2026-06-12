// Tipos canônicos de máquina (alinhados com a importação)
export const MACHINE_TYPES = [
  'TRATOR',
  'COLHEITADEIRA',
  'PLATAFORMA',
  'PLANTADEIRA',
  'PULVERIZADOR',
  'JARDIM',
  'COTTON',
  'UTILITARIO',
  'FORRAGEIRA',
  'ENFARDADEIRA',
  'SEGADEIRA',
  'OUTROS',
] as const;

export const MACHINE_STATUSES = [
  { value: 'ativa', label: 'Ativa' },
  { value: 'inativa', label: 'Inativa' },
  { value: 'vendida', label: 'Vendida' },
  { value: 'sucateada', label: 'Sucateada' },
] as const;

export const PUK_STATUSES = [
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
  { value: 'unknown', label: 'Desconhecido' },
] as const;

export const statusBadgeVariant = (
  status?: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'ativa':
      return 'default';
    case 'inativa':
      return 'secondary';
    case 'vendida':
      return 'outline';
    case 'sucateada':
      return 'destructive';
    default:
      return 'outline';
  }
};

export const pukLabel = (s?: string | null) => {
  if (s === 'yes') return 'PUK';
  if (s === 'no') return 'Sem PUK';
  return 'PUK ?';
};

export const machineStatusLabel = (s?: string | null) =>
  MACHINE_STATUSES.find((x) => x.value === s)?.label ?? s ?? '—';

export const VALIDATION_PRIORITY_LABEL = 'Prioridade Validação';
export const VALIDATION_PRIORITY_DEFAULT_SOURCE = 'TAKE RATE DOC';
export const VALIDATION_PRIORITY_DEFAULT_REASON =
  'Máquina marcada como VALIDAÇÃO na base importada';


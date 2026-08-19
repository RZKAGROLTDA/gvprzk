/**
 * Fonte única de verdade para cargos (app_role) no frontend.
 *
 * IMPORTANTE: CPA e CSA são cargos DISTINTOS para identificação, filtros,
 * relatórios e badges — mas possuem PARIDADE TOTAL de permissões com RAC.
 * Nunca tratar cpa/csa como "cargo desconhecido" nem cair em consultant.
 */

export type AppRole =
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'rac'
  | 'cpa'
  | 'csa'
  | 'consultant'
  | 'sales_consultant'
  | 'technical_consultant';

/** Rótulos oficiais exibidos na interface. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  supervisor: 'Supervisor',
  rac: 'RAC',
  cpa: 'CPA',
  csa: 'CSA',
  consultant: 'Consultor',
  sales_consultant: 'Consultor de Vendas',
  technical_consultant: 'Consultor Técnico',
};

/** Cargos que podem ser atribuídos no cadastro/edição de usuários. */
export const ASSIGNABLE_ROLES: { value: AppRole; label: string }[] = [
  { value: 'manager', label: ROLE_LABELS.manager },
  { value: 'supervisor', label: ROLE_LABELS.supervisor },
  { value: 'sales_consultant', label: ROLE_LABELS.sales_consultant },
  { value: 'consultant', label: ROLE_LABELS.consultant },
  { value: 'rac', label: ROLE_LABELS.rac },
  { value: 'cpa', label: ROLE_LABELS.cpa },
  { value: 'csa', label: ROLE_LABELS.csa },
  { value: 'technical_consultant', label: ROLE_LABELS.technical_consultant },
];

/** Cargos que podem ser escolhidos no autocadastro (sem gerente/supervisor). */
export const SELF_REGISTRATION_ROLES: { value: AppRole; label: string }[] = [
  { value: 'sales_consultant', label: ROLE_LABELS.sales_consultant },
  { value: 'technical_consultant', label: ROLE_LABELS.technical_consultant },
  { value: 'rac', label: ROLE_LABELS.rac },
  { value: 'cpa', label: ROLE_LABELS.cpa },
  { value: 'csa', label: ROLE_LABELS.csa },
];

/** Perfis comerciais individuais (escopo do próprio usuário / filial). */
export const COMMERCIAL_INDIVIDUAL_ROLES: AppRole[] = [
  'rac',
  'cpa',
  'csa',
  'consultant',
  'sales_consultant',
  'technical_consultant',
];

/** Cargos com permissões idênticas às do RAC. */
export const RAC_EQUIVALENT_ROLES: AppRole[] = ['rac', 'cpa', 'csa'];

/** true quando o cargo tem paridade de permissões com RAC. */
export const isRacEquivalentRole = (role?: string | null): boolean =>
  !!role && (RAC_EQUIVALENT_ROLES as string[]).includes(role.toLowerCase());

/** Rótulo do cargo. Sem fallback silencioso: cargo desconhecido é sinalizado. */
export const getRoleLabel = (role?: string | null): string => {
  if (!role) return '—';
  const key = role.toLowerCase();
  return ROLE_LABELS[key] ?? role;
};

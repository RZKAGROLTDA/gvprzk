/**
 * Divisionais do CRM (MT, GO, PA, C&F), derivadas do nome oficial da filial.
 * Usado só para agrupar as filiais que o usuário JÁ pode ver; nunca amplia escopo.
 */
export type CrmDivisional = 'MT' | 'GO' | 'PA' | 'C&F';
export const CRM_DIVISIONAIS: CrmDivisional[] = ['MT', 'GO', 'PA', 'C&F'];

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const MAP: Record<Exclude<CrmDivisional, 'C&F'>, string[]> = {
  MT: ['querencia', 'canarana', 'porto alegre do norte', 'gaucha do norte', 'espigao do leste', 'agua boa', 'vila rica', 'sao jose do xingu'],
  GO: ['mineiros', 'alto taquari', 'caiaponia', 'planalto verde', 'barra do garcas'],
  PA: ['paragominas', 'redencao', 'maraba', 'ananindeua', 'santarem', 'santana', 'tailandia', 'dom eliseu'],
};

export const divisionalOfFilial = (nome: string | null | undefined): CrmDivisional | null => {
  if (!nome) return null;
  const n = norm(nome);
  if (n.startsWith('c&f') || n.startsWith('c & f')) return 'C&F';
  if (n.includes('tele vendas') || n.includes('televendas')) return null;
  for (const d of ['MT', 'GO', 'PA'] as const) if (MAP[d].includes(n)) return d;
  return null;
};

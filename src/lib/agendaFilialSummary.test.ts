import { describe, it, expect } from 'vitest';
import { summarize } from './agendaFilialSummary';

const acts = [
  { id: '1', filial_id: 'A', responsible_user_id: 'u1', activity_type: 'visita', client_code: 'C1' },
  { id: '2', filial_id: 'A', responsible_user_id: 'u1', activity_type: 'ligacao', client_code: ' c1 ' },
  { id: '2', filial_id: 'A', responsible_user_id: 'u1', activity_type: 'ligacao', client_code: 'C1' },
  { id: '3', filial_id: 'B', responsible_user_id: 'u1', activity_type: 'checklist', client_name: 'X' },
];

describe('summarize', () => {
  it('conta cliente único sem duplicidade dentro da filial', () => {
    const a = summarize(acts, (x) => x.filial_id).find((r) => r.key === 'A')!;
    expect(a.clientes).toBe(1);
  });
  it('não duplica atividade repetida nem de usuário em várias filiais', () => {
    const rows = summarize(acts, (x) => x.filial_id);
    expect(rows.find((r) => r.key === 'A')!.total).toBe(2);
    expect(rows.find((r) => r.key === 'B')!.total).toBe(1);
  });
  it('mantém filiais autorizadas sem atividades com zero', () => {
    const rows = summarize(acts, (x) => x.filial_id, [{ key: 'Z', label: 'Z' }]);
    expect(rows.find((r) => r.key === 'Z')!.total).toBe(0);
  });
});

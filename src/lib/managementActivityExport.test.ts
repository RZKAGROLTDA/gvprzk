import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
import { buildActivitySheets } from './managementActivityExport';

describe('Chassi da Máquina no Excel de Checklists', () => {
  it('usa exatamente a ficha da atividade, sem substituir por máquina do Parque', () => {
    const rows = [
      { task_id: 'a', filial: 'Água Boa', checklist_machine: { chassi_serie: '1BM6210JCMD001034' }, park_machines: [{ serial_chassis: 'OUTRO' }] },
      { task_id: 'b', filial: 'Querência', checklist_machine: { chassi_serie: '1bm8400rtrs102137' } },
    ];
    const sheets = buildActivitySheets('checklist', rows);
    expect(sheets.Checklists.map(r => [r['ID Atividade'], r['Chassi da Máquina']])).toEqual([
      ['a', '1BM6210JCMD001034'], ['b', '1bm8400rtrs102137'],
    ]);
    expect(sheets['Checklist - Máquina'].map(r => r['Chassi/Série'])).toEqual(['1BM6210JCMD001034', '1bm8400rtrs102137']);
  });

  it('deixa vazio sem ficha ou sem chassi, mesmo havendo dados do Parque', () => {
    const sheets = buildActivitySheets('checklist', [
      { task_id: 'a', checklist_machine: null, park_machines: [{ serial_chassis: 'NAO_USAR' }] },
      { task_id: 'b', checklist_machine: {} },
      { task_id: 'c', checklist_machine: { chassi_serie: null } },
    ]);
    expect(sheets.Checklists.map(r => r['Chassi da Máquina'])).toEqual(['', '', '']);
  });

  it('preserva os demais dados comerciais e não adiciona o campo a Ligações ou Visitas', () => {
    const row = { task_id: 'a', task_type: 'checklist', client: 'Cliente', sales_value: 123.45, filial: 'Mineiros', checklist_machine: { chassi_serie: '001234' } };
    const checklist = buildActivitySheets('checklist', [row]).Checklists[0];
    const activity = buildActivitySheets('ligacao', [row])['Ligações'][0];
    const { 'Chassi da Máquina': chassis, 'Situação JD': jd, ...existing } = checklist;
    expect(chassis).toBe('001234');
    expect(jd).toBe('');
    expect(existing).toEqual(activity);
    expect(checklist['Valor Venda']).toBe(123.45);
    expect(buildActivitySheets('visita', [row]).Visitas[0]).not.toHaveProperty('Chassi da Máquina');
  });

  it('gera Excel legível sem perder zeros iniciais ou alterar maiúsculas/minúsculas', () => {
    const rows = [{ task_id: 'a', checklist_machine: { chassi_serie: '001234' } }, { task_id: 'b', checklist_machine: { chassi_serie: '1bm8400rtrs102137' } }, { task_id: 'c', checklist_machine: null }];
    const workbook = XLSX.utils.book_new();
    for (const [name, data] of Object.entries(buildActivitySheets('checklist', rows))) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), name);
    }
    const reopened = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    const result = XLSX.utils.sheet_to_json<Record<string, unknown>>(reopened.Sheets.Checklists, { defval: '' });
    expect(result.map(r => [r['ID Atividade'], r['Chassi da Máquina']])).toEqual([['a', '001234'], ['b', '1bm8400rtrs102137'], ['c', '']]);
  });

  it('preenche Situação JD com a classificação da base, inclusive sem chassi', () => {
    const classified = new Map<string, 'enviado' | 'disponivel'>([['1HGBH41JXMN109186', 'enviado']]);
    const sheets = buildActivitySheets('checklist', [
      { task_id: 'a', checklist_machine: { chassi_serie: '1hgbh41jx mn109186' } },
      { task_id: 'b', checklist_machine: { chassi_serie: '9BWZZZ377VT004251' } },
      { task_id: 'c', checklist_machine: null },
    ], classified);
    expect(sheets.Checklists.map(r => r['Situação JD'])).toEqual([
      'Já enviado à JD', 'Disponível', 'Sem chassi',
    ]);
  });
});
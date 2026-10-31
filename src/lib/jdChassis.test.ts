import { describe, it, expect } from 'vitest';
import {
  normalizeChassis,
  isValidChassis,
  jdLabel,
  pickAuditSheet,
  extractJdAuditRows,
  previewJdFile,
} from './jdChassis';

describe('Auditoria JD — normalização de chassis', () => {
  it('ignora maiúsculas/minúsculas e espaços', () => {
    expect(normalizeChassis(' 1hgbh41jx mn109186 ')).toBe('1HGBH41JXMN109186');
    expect(normalizeChassis('1HGBH41JXMN109186')).toBe('1HGBH41JXMN109186');
    expect(normalizeChassis('abc 123 def')).toBe('ABC123DEF');
  });

  it('trata nulo e vazio como vazio', () => {
    expect(normalizeChassis(null)).toBe('');
    expect(normalizeChassis(undefined)).toBe('');
    expect(normalizeChassis('   ')).toBe('');
  });

  it('valida apenas alfanuméricos de 5 a 30 caracteres', () => {
    expect(isValidChassis('1HGBH41JXMN109186')).toBe(true);
    expect(isValidChassis('ABC12')).toBe(true);
    expect(isValidChassis('ABC1')).toBe(false);
    expect(isValidChassis('')).toBe(false);
    expect(isValidChassis('ABC-12345')).toBe(false);
    expect(isValidChassis('A'.repeat(31))).toBe(false);
  });
});

describe('Auditoria JD v2 — rótulos e aba', () => {
  it('rótulos dos quatro estados; desconhecido = Não auditado', () => {
    expect(jdLabel('ok')).toBe('OK — Primeiro registro');
    expect(jdLabel('duplicado')).toBe('Duplicado');
    expect(jdLabel('sem_chassi')).toBe('Sem chassi');
    expect(jdLabel(undefined)).toBe('Não auditado');
  });
  it('escolhe a aba Checklist - Máquina', () => {
    expect(pickAuditSheet(['Checklists', 'Checklist - Máquina'])).toBe('Checklist - Máquina');
    expect(pickAuditSheet(['Checklists'])).toBeNull();
  });
  it('lê ID Atividade + Chassi/Série com número real da linha e aponta IDs repetidos/vazios', () => {
    const id1 = '11111111-1111-1111-1111-111111111111';
    const id2 = '22222222-2222-2222-2222-222222222222';
    const r = extractJdAuditRows([
      ['ID Atividade', 'Data', 'Cliente', 'Chassi/Série'],
      [id1, '', 'A', '1CQ2122AKG0110160'],
      [id2, '', 'B', ''],
      [id1, '', 'C', 'X'],
      ['', '', 'D', 'Y'],
    ]);
    expect(r.rows.map(x => x.row)).toEqual([2, 3, 4]);
    expect(r.semChassi).toBe(1);
    expect(r.idsDuplicados).toEqual([id1]);
    expect(r.idsVazios).toEqual([5]);
  });
  it('bloqueia aba sem as colunas exigidas', () => {
    expect(() => extractJdAuditRows([['Cliente', 'Chassi da Máquina'], ['A', 'X1']])).toThrow(/ID Atividade/);
  });
});

describe('Auditoria JD — prévia do arquivo de importação', () => {
  it('conta válidos, inválidos e duplicados dentro do arquivo', () => {
    const preview = previewJdFile([
      '1HGBH41JXMN109186',
      '1hgbh41jx mn109186', // duplicado (caixa/espaços)
      '9BWZZZ377VT004251',
      '??',                 // inválido
      '',                   // inválido
      '9BWZZZ377VT004251',  // duplicado
    ]);
    expect(preview.total).toBe(6);
    expect(preview.validos).toBe(2);
    expect(preview.duplicadosArquivo).toBe(2);
    expect(preview.invalidos).toBe(2);
  });

  it('arquivo vazio não produz válidos', () => {
    const preview = previewJdFile([]);
    expect(preview.total).toBe(0);
    expect(preview.validos).toBe(0);
  });
});

import { extractJdChassisFromRows } from './jdChassis';

describe('extractJdChassisFromRows (coluna pelo cabeçalho)', () => {
  it('usa a coluna Chassi mesmo com nome do cliente na primeira coluna', () => {
    const rows = [
      ['Cliente', 'Filial', 'Chassi da Máquina'],
      ['PAULO HENRIQUE CARLOS DE OLIVEIRA', 'X', '1CQ2122AKG0110160'],
      ['IVO CANDIOTTO', 'Y', '1cq2122akg 0110160'],
      ['DIEGO GIONGO', 'Z', '1BZ6155MCPA123456'],
    ];
    const r = extractJdChassisFromRows(rows);
    expect(r.column).toBe('Chassi da Máquina');
    expect(r.values).toEqual(['1CQ2122AKG0110160', '1cq2122akg 0110160', '1BZ6155MCPA123456']);
  });

  it('bloqueia arquivo sem cabeçalho de chassi', () => {
    expect(() => extractJdChassisFromRows([['Cliente'], ['IVO CANDIOTTO']])).toThrow(/não identificada/);
  });

  it('bloqueia coluna de chassi com nomes de clientes', () => {
    const rows = [['Chassi'], ['IVO CANDIOTTO'], ['DIEGO GIONGO'], ['1CQ2122AKG0110160']];
    expect(() => extractJdChassisFromRows(rows)).toThrow(/não parece conter chassis/);
  });
});

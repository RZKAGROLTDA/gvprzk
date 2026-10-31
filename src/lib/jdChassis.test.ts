import { describe, it, expect } from 'vitest';
import {
  normalizeChassis,
  isValidChassis,
  jdStatusFor,
  previewJdFile,
  JD_STATUS_LABEL,
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

describe('Auditoria JD — classificação', () => {
  const classified = new Map<string, 'enviado' | 'disponivel'>([['1HGBH41JXMN109186', 'enviado']]);

  it('marca como enviado quando consta na base JD, independente de caixa/espaços', () => {
    expect(jdStatusFor('1hgbh41jx mn109186', classified)).toBe('enviado');
    expect(jdStatusFor('1HGBH41JXMN109186', classified)).toBe('enviado');
  });

  it('marca como disponível quando não consta na base', () => {
    expect(jdStatusFor('9BWZZZ377VT004251', classified)).toBe('disponivel');
  });

  it('marca como sem chassi quando a ficha não tem chassi', () => {
    expect(jdStatusFor('', classified)).toBe('sem_chassi');
    expect(jdStatusFor(null, classified)).toBe('sem_chassi');
    expect(jdStatusFor('   ', classified)).toBe('sem_chassi');
  });

  it('possui rótulos para os três estados', () => {
    expect(JD_STATUS_LABEL.enviado).toBe('Já enviado à JD');
    expect(JD_STATUS_LABEL.disponivel).toBe('Disponível');
    expect(JD_STATUS_LABEL.sem_chassi).toBe('Sem chassi');
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

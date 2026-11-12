import { describe, expect, it } from 'vitest';
import { numericFormatter } from 'react-number-format';
import { parseProjectionMoney } from './projectionMoney';

const format = (value: string) => numericFormatter(value, { prefix: 'R$ ', thousandSeparator: '.', decimalSeparator: ',', decimalScale: 2 });

describe('Valores de Lançar semana', () => {
  it('formata 1500000 como R$ 1.500.000 sem mudar sua escala', () => {
    expect(format('1500000')).toBe('R$ 1.500.000');
    expect(parseProjectionMoney('1500000')).toBe(1500000);
  });
  it('preserva centavos com vírgula e converte para número', () => {
    expect(format('1500000.25')).toBe('R$ 1.500.000,25');
    expect(parseProjectionMoney('1500000.25')).toBe(1500000.25);
    expect(format('0.05')).toBe('R$ 0,05');
    expect(parseProjectionMoney('0.05')).toBe(0.05);
  });
  it('permite vazio durante edição, mas não o converte em zero ao salvar', () => {
    expect(format('')).toBe('');
    expect(parseProjectionMoney('')).toBeNull();
    expect(parseProjectionMoney('0')).toBe(0);
  });
  it('rejeita conversão inválida, negativos, precisão excessiva e números inseguros', () => {
    for (const value of ['NaN', 'Infinity', '-1', '1.2.3', '1,25', 'R$ 1.000', '1.234', '9007199254740991']) {
      expect(parseProjectionMoney(value)).toBeNull();
    }
  });
});
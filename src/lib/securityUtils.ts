// Security utility functions for handling masked customer data

export const isMaskedValue = (value: any): boolean => {
  return typeof value === 'string' && (
    value === '***' || 
    value.includes('***') || 
    value.includes('k-') || 
    value.startsWith('>') ||
    value.startsWith('<')
  );
};

export const getSalesValueAsNumber = (salesValue?: number | string): number => {
  if (typeof salesValue === 'number') {
    return salesValue;
  }
  
  if (typeof salesValue === 'string') {
    // Handle masked values by returning 0 for calculations
    if (isMaskedValue(salesValue)) {
      return 0;
    }
    
    // Try to parse as number
    const parsed = parseFloat(salesValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
};

export const formatSalesValue = (salesValue?: number | string): string => {
  if (typeof salesValue === 'string') {
    // If it's already a masked string, return as is
    if (isMaskedValue(salesValue)) {
      return salesValue;
    }
    
    // Try to parse and format
    const parsed = parseFloat(salesValue);
    if (!isNaN(parsed)) {
      return parsed.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      });
    }
    
    return salesValue;
  }
  
  if (typeof salesValue === 'number') {
    return salesValue.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    });
  }
  
  return 'R$ 0,00';
};

export const canPerformNumericOperation = (salesValue?: number | string): boolean => {
  return typeof salesValue === 'number' || 
    (typeof salesValue === 'string' && !isMaskedValue(salesValue) && !isNaN(parseFloat(salesValue)));
};
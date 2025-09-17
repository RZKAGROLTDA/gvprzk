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

export const sanitizeCustomerEmail = (email: string, userRole: string): string => {
  if (!email || email.trim() === '') return '';
  
  // Admin/Manager can see full email
  if (userRole === 'manager' || userRole === 'admin') {
    return email;
  }
  
  // Others see masked email
  const [localPart, domain] = email.split('@');
  if (!domain) return 'protected@***';
  
  const maskedLocal = localPart.length > 2 ? 
    localPart.charAt(0) + '***' + localPart.charAt(localPart.length - 1) : 
    '***';
    
  return `${maskedLocal}@${domain}`;
};

export const sanitizeCustomerPhone = (phone: string, userRole: string): string => {
  if (!phone || phone.trim() === '') return '';
  
  // Admin/Manager can see full phone
  if (userRole === 'manager' || userRole === 'admin') {
    return phone;
  }
  
  // Others see masked phone
  if (phone.length > 4) {
    return '***-***-' + phone.slice(-4);
  }
  
  return '***-***-****';
};

export const validateSensitiveDataAccess = (userRole: string, dataType: 'customer_email' | 'customer_phone' | 'high_value_sales'): boolean => {
  const allowedRoles: Record<string, string[]> = {
    'customer_email': ['manager', 'admin'], // Stricter: removed supervisor
    'customer_phone': ['manager', 'admin'], // Stricter: removed supervisor  
    'high_value_sales': ['manager', 'admin']
  };
  
  return allowedRoles[dataType]?.includes(userRole) || false;
};

// Enhanced security thresholds (lowered for better protection)
export const SECURITY_THRESHOLDS = {
  HIGH_VALUE_SALES: 10000, // Lowered from 15000
  BULK_ACCESS_LIMIT: 50,   // Lowered from 100
  SUSPICIOUS_ACTIVITY_THRESHOLD: 20, // Lowered from 30
  SESSION_TIMEOUT_MINUTES: 60, // Added session timeout
  MAX_CONCURRENT_SESSIONS: 3   // Added concurrent session limit
} as const;

export const logSensitiveAccess = (accessType: string, metadata: Record<string, any> = {}) => {
  // This would typically integrate with your security monitoring system
  console.warn(`[SECURITY] Sensitive data access: ${accessType}`, {
    timestamp: new Date().toISOString(),
    ...metadata
  });
};
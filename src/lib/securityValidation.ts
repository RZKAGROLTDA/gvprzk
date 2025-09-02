import { useSecurityMonitor } from '@/hooks/useSecurityMonitor';
import { sanitizeCustomerEmail, sanitizeCustomerPhone, validateSensitiveDataAccess } from '@/lib/securityUtils';

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
  sanitizedValue?: string;
  requiresLogging?: boolean;
}

export interface SecurityContext {
  userRole: string;
  userId: string;
  operation: 'view' | 'edit' | 'create' | 'delete' | 'export';
  resourceType: 'customer_data' | 'sales_data' | 'user_data' | 'system_config';
}

class SecurityValidator {
  private static instance: SecurityValidator;
  
  public static getInstance(): SecurityValidator {
    if (!SecurityValidator.instance) {
      SecurityValidator.instance = new SecurityValidator();
    }
    return SecurityValidator.instance;
  }

  /**
   * Validates access to customer email data
   */
  validateCustomerEmailAccess(email: string, context: SecurityContext): ValidationResult {
    if (!email || email.trim() === '') {
      return { isValid: true, sanitizedValue: '' };
    }

    // Check if user has permission to access customer emails
    const hasAccess = validateSensitiveDataAccess(context.userRole, 'customer_email');
    
    if (context.operation === 'export' && !hasAccess) {
      return {
        isValid: false,
        errorMessage: 'Insufficient permissions to export customer email data'
      };
    }

    const sanitizedEmail = sanitizeCustomerEmail(email, context.userRole);
    
    return {
      isValid: true,
      sanitizedValue: sanitizedEmail,
      requiresLogging: !hasAccess || context.operation === 'export'
    };
  }

  /**
   * Validates access to customer phone data
   */
  validateCustomerPhoneAccess(phone: string, context: SecurityContext): ValidationResult {
    if (!phone || phone.trim() === '') {
      return { isValid: true, sanitizedValue: '' };
    }

    const hasAccess = validateSensitiveDataAccess(context.userRole, 'customer_phone');
    
    if (context.operation === 'export' && !hasAccess) {
      return {
        isValid: false,
        errorMessage: 'Insufficient permissions to export customer phone data'
      };
    }

    const sanitizedPhone = sanitizeCustomerPhone(phone, context.userRole);
    
    return {
      isValid: true,
      sanitizedValue: sanitizedPhone,
      requiresLogging: !hasAccess || context.operation === 'export'
    };
  }

  /**
   * Validates access to high-value sales data
   */
  validateHighValueSalesAccess(salesValue: number, context: SecurityContext): ValidationResult {
    const HIGH_VALUE_THRESHOLD = 25000;
    
    if (salesValue <= HIGH_VALUE_THRESHOLD) {
      return { isValid: true, sanitizedValue: salesValue.toString() };
    }

    const hasAccess = validateSensitiveDataAccess(context.userRole, 'high_value_sales');
    
    if (!hasAccess) {
      if (context.operation === 'view') {
        return {
          isValid: true,
          sanitizedValue: '>R$ 25.000',
          requiresLogging: true
        };
      } else {
        return {
          isValid: false,
          errorMessage: 'Insufficient permissions to access high-value sales data'
        };
      }
    }

    return {
      isValid: true,
      sanitizedValue: salesValue.toString(),
      requiresLogging: true
    };
  }

  /**
   * Validates bulk data operations
   */
  validateBulkOperation(recordCount: number, context: SecurityContext): ValidationResult {
    const BULK_THRESHOLD = 50;
    const EXPORT_LIMIT = 100;

    if (recordCount <= BULK_THRESHOLD) {
      return { isValid: true };
    }

    // Only managers can perform bulk operations
    if (context.userRole !== 'manager' && context.userRole !== 'admin') {
      return {
        isValid: false,
        errorMessage: `Bulk operations on ${recordCount} records require manager approval`
      };
    }

    if (context.operation === 'export' && recordCount > EXPORT_LIMIT) {
      return {
        isValid: false,
        errorMessage: `Export limit exceeded. Maximum ${EXPORT_LIMIT} records per export.`
      };
    }

    return {
      isValid: true,
      requiresLogging: true
    };
  }

  /**
   * Validates rate limits for sensitive operations
   */
  validateRateLimit(operation: string, userHistory: any[]): ValidationResult {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    const recentOperations = userHistory.filter(
      op => now - new Date(op.timestamp).getTime() < oneHour
    );

    const limits: Record<string, number> = {
      'customer_data_export': 10,
      'high_value_access': 50,
      'bulk_view': 20,
      'sensitive_field_access': 100
    };

    const limit = limits[operation] || 30;
    
    if (recentOperations.length >= limit) {
      return {
        isValid: false,
        errorMessage: `Rate limit exceeded for ${operation}. Try again in an hour.`
      };
    }

    return { isValid: true };
  }
}

export const securityValidator = SecurityValidator.getInstance();

/**
 * Custom hook for secure data validation in React components
 */
export const useSecureValidation = () => {
  const { monitorSensitiveFieldAccess, monitorCustomerDataAccess, monitorBulkDataExport } = useSecurityMonitor();

  const validateAndSanitize = async (
    value: string,
    fieldType: 'email' | 'phone' | 'sales_value',
    context: SecurityContext
  ): Promise<ValidationResult> => {
    let result: ValidationResult;

    switch (fieldType) {
      case 'email':
        result = securityValidator.validateCustomerEmailAccess(value, context);
        break;
      case 'phone':
        result = securityValidator.validateCustomerPhoneAccess(value, context);
        break;
      case 'sales_value':
        const numValue = parseFloat(value);
        result = securityValidator.validateHighValueSalesAccess(numValue, context);
        break;
      default:
        result = { isValid: true, sanitizedValue: value };
    }

    // Log sensitive access if required
    if (result.requiresLogging && result.isValid) {
      const validOperation = context.operation === 'create' || context.operation === 'delete' ? 'edit' : context.operation;
      monitorSensitiveFieldAccess(fieldType, `${validOperation}_${context.resourceType}`);
    }

    return result;
  };

  const validateBulkAccess = async (
    recordCount: number,
    context: SecurityContext,
    includesSensitiveData: boolean = false
  ): Promise<ValidationResult> => {
    const result = securityValidator.validateBulkOperation(recordCount, context);

    if (result.isValid && result.requiresLogging) {
      if (context.operation === 'export') {
        monitorBulkDataExport(context.resourceType, recordCount, includesSensitiveData);
      } else {
        monitorCustomerDataAccess(context.operation, recordCount);
      }
    }

    return result;
  };

  return {
    validateAndSanitize,
    validateBulkAccess,
    securityValidator
  };
};
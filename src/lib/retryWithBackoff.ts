/**
 * Executes an async function with exponential backoff retry logic
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay in milliseconds (default: 30000)
 * @returns The result of the function or throws after all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Check if an error should not be retried
 */
function isNonRetryableError(error: any): boolean {
  // Authentication errors should not be retried
  if (error.status === 401 || error.status === 403) {
    return true;
  }

  // Validation errors should not be retried
  if (error.status === 400 || error.status === 422) {
    return true;
  }

  // Not found errors should not be retried
  if (error.status === 404) {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is a connection/network error
 */
export function isConnectionError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toString() || '';

  return (
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound') ||
    errorCode === '544' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ETIMEDOUT' ||
    error.name === 'AbortError'
  );
}

/**
 * Get a user-friendly error message for connection errors
 */
export function getConnectionErrorMessage(error: any): string {
  if (isConnectionError(error)) {
    return 'Serviço temporariamente indisponível. Por favor, tente novamente em alguns instantes.';
  }

  if (error?.message?.includes('Invalid login credentials')) {
    return 'Credenciais inválidas. Verifique seu email e senha.';
  }

  if (error?.message?.includes('Email not confirmed')) {
    return 'Email não confirmado. Verifique sua caixa de entrada.';
  }

  if (error?.message?.includes('User not found')) {
    return 'Usuário não encontrado. Verifique o email ou cadastre-se.';
  }

  return error?.message || 'Erro desconhecido. Tente novamente.';
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wuvbrkbhunifudaewhng.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1dmJya2JodW5pZnVkYWV3aG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzODY5MTksImV4cCI6MjA2ODk2MjkxOX0.e8E9SJYB0KQ7CXgo0RTRCZ-NaEfiJgrKZUSyraOrYoI';

// Configuração otimizada para reduzir conexões simultâneas
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: 'supabase.auth.token',
    flowType: 'pkce'
  },
  global: {
    headers: {
      'x-client-info': 'gvp-app/1.0'
    }
  },
  // Configurações de realtime otimizadas
  realtime: {
    params: {
      eventsPerSecond: 2 // Limitar eventos para reduzir carga
    }
  }
});

// Cache de sessão para evitar múltiplas chamadas getSession()
let sessionCache: { session: any; timestamp: number } | null = null;
const SESSION_CACHE_TTL = 30000; // 30 segundos

export const getCachedSession = async () => {
  const now = Date.now();
  
  // Retornar cache se ainda válido
  if (sessionCache && (now - sessionCache.timestamp) < SESSION_CACHE_TTL) {
    return sessionCache.session;
  }
  
  // Buscar nova sessão
  try {
    const { data: { session } } = await supabase.auth.getSession();
    sessionCache = { session, timestamp: now };
    return session;
  } catch (error) {
    console.error('Erro ao obter sessão:', error);
    return sessionCache?.session || null;
  }
};

// Invalidar cache quando sessão mudar
supabase.auth.onAuthStateChange((event, session) => {
  sessionCache = { session, timestamp: Date.now() };
});

// Request queue para evitar requests simultâneos idênticos
const pendingRequests = new Map<string, Promise<any>>();

export const deduplicatedQuery = async <T>(
  key: string,
  queryFn: () => Promise<T>
): Promise<T> => {
  // Se já existe uma request pendente com essa chave, retornar a mesma Promise
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }
  
  // Criar nova request
  const promise = queryFn().finally(() => {
    pendingRequests.delete(key);
  });
  
  pendingRequests.set(key, promise);
  return promise;
};

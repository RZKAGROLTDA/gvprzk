import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { supabase, getCachedSession } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, userData?: any) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthProvider = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);

  // Função para verificar se perfil já existe (não cria automaticamente)
  // O perfil deve ser criado pelos formulários de registro com filial obrigatória
  const checkUserProfile = async (authUser: User) => {
    try {
      console.log('🔄 Verificando perfil do usuário...');
      
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, approval_status')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (checkError && !checkError.message.includes('No rows')) {
        console.error('❌ Erro ao verificar perfil:', checkError);
        return;
      }

      if (existingProfile) {
        console.log('✅ Perfil existe com status:', existingProfile.approval_status);
      } else {
        console.log('⚠️ Usuário sem perfil - deve se cadastrar pelo formulário de registro');
      }
    } catch (error) {
      console.error('❌ Erro crítico na verificação do perfil:', error);
    }
  };

  useEffect(() => {
    // Evitar inicialização dupla
    if (initRef.current) return;
    initRef.current = true;
    
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);

          // Verificar perfil quando usuário faz login
          if (session?.user && event === 'SIGNED_IN') {
            setTimeout(() => {
              checkUserProfile(session.user);
            }, 0);
          }
        }
      }
    );

    // THEN check for existing session usando cache
    const getInitialSession = async () => {
      try {
        // Usar sessão em cache primeiro para resposta mais rápida
        const cachedSession = await getCachedSession();
        
        if (mounted) {
          setSession(cachedSession);
          setUser(cachedSession?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        if (mounted) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      }
    };

    getInitialSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      
      // Se login bem-sucedido, forçar renovação da sessão
      if (!result.error && result.data.session) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
      
      return result;
    } catch (error) {
      return { error };
    }
  };

  const signUp = async (email: string, password: string, userData?: any) => {
    const redirectUrl = `${window.location.origin}/`;
    
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
        emailRedirectTo: redirectUrl
      }
    });
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      // Limpar cache local e recarregar
      localStorage.clear();
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    } catch (error) {
      console.error('Erro no logout:', error);
    }
  };

  return {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };
};
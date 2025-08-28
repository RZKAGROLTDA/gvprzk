import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  // Função para criar perfil automaticamente
  const createUserProfile = async (authUser: User) => {
    try {
      console.log('🔄 Criando perfil automático para usuário...');
      
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (checkError && !checkError.message.includes('No rows')) {
        console.error('❌ Erro ao verificar perfil:', checkError);
        return;
      }

      if (existingProfile) {
        console.log('✅ Perfil já existe');
        return;
      }

      // Buscar filial padrão
      const { data: defaultFilial } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome')
        .limit(1)
        .single();

      const profileData = {
        user_id: authUser.id,
        name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuário',
        email: authUser.email || '',
        role: 'consultant', // Role padrão seguro
        filial_id: defaultFilial?.id || null,
        approval_status: 'approved' // Auto-aprovar para resolver acesso imediato
      };

      const { error: insertError } = await supabase
        .from('profiles')
        .insert(profileData);

      if (insertError) {
        console.error('❌ Erro ao criar perfil:', insertError);
      } else {
        console.log('✅ Perfil criado automaticamente:', profileData);
      }
    } catch (error) {
      console.error('❌ Erro crítico na criação do perfil:', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);

          // Criar perfil automaticamente quando usuário faz login
          if (session?.user && event === 'SIGNED_IN') {
            setTimeout(() => {
              createUserProfile(session.user);
            }, 0);
          }
        }
      }
    );

    // THEN check for existing session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
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
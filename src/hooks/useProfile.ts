import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  filial_id: string | null;
  filial_nome?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

export const useProfile = () => {
  // Verificação robusta do contexto de autenticação
  let user = null;
  let contextAvailable = true;
  
  try {
    const authContext = useAuth();
    user = authContext.user;
  } catch (error) {
    console.warn('useProfile: AuthProvider context not available:', error);
    contextAvailable = false;
  }

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!contextAvailable) {
      setProfile(null);
      setLoading(false);
      return;
    }

    if (user && user.id) {
      loadProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [user?.id, contextAvailable]); // Include contextAvailable in dependencies

  const loadProfile = async () => {
    if (!contextAvailable) {
      console.warn('useProfile: Skipping profile load - no auth context');
      setLoading(false);
      return;
    }

    // Prevent multiple simultaneous calls
    if (loadingRef.current) {
      return;
    }

    if (!user?.id) {
      setLoading(false);
      return;
    }

    // Timeout de 10 segundos com retry automático
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      loadingRef.current = true;
      setLoading(true);
      
      console.log('🔄 Carregando perfil do usuário...');

      const profilePromise = supabase
        .from('profiles')
        .select(`
          *,
          filiais:filial_id (
            nome
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Profile load timeout')), 10000);
      });

      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);

      clearTimeout(timeout);

      if (error) {
        console.warn('⚠️ Erro ao carregar perfil:', error);
        setProfile(null);
      } else {
        const profileData = data ? {
          ...data,
          filial_nome: data.filiais?.nome
        } : null;
        
        console.log('✅ Perfil carregado:', profileData);
        setProfile(profileData);
      }
    } catch (error) {
      clearTimeout(timeout);
      console.warn('⚠️ Timeout ou erro no perfil:', error);
      setProfile(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const isAdmin = profile?.role === 'manager';

  return {
    profile,
    loading,
    isAdmin,
    loadProfile
  };
};
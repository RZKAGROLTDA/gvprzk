import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  filial_id: string | null;
  filial_nome?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

const PROFILE_TIMEOUT_MS = 5000;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível carregar os dados do usuário.';

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
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!contextAvailable) {
      setProfile(null);
      setError(null);
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

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
      
      console.log('🔄 Carregando perfil do usuário...');

      // As duas leituras independentes começam juntas; a filial é associada em memória.
      const [profileResult, filiaisResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, user_id, name, email, role, filial_id, approval_status')
          .eq('user_id', user.id)
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase
          .from('filiais')
          .select('id, nome')
          .abortSignal(controller.signal),
      ]);

      window.clearTimeout(timeoutId);
      const { data: profileData, error: profileError } = profileResult;

      if (profileError) {
        console.warn('⚠️ Erro ao carregar perfil:', profileError);
        setProfile(null);
        setError(profileError.message || 'Não foi possível carregar o perfil.');
        return;
      }

      if (profileData) {
        if (filiaisResult.error) {
          setProfile(null);
          setError(filiaisResult.error.message || 'Não foi possível carregar a filial.');
          return;
        }

        const filialNome = profileData.filial_id
          ? filiaisResult.data?.find((filial) => filial.id === profileData.filial_id)?.nome ?? null
          : null;

        // Combinar os dados sem JOIN complexo
        const completeProfile = {
          ...profileData,
          filial_nome: filialNome || null
        };

        console.log('✅ Perfil carregado:', completeProfile);
        setProfile(completeProfile as any);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.warn('⚠️ Erro no perfil:', error);
      setProfile(null);
      setError(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'O carregamento do perfil excedeu 5 segundos.'
          : getErrorMessage(error),
      );
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const isAdmin = profile?.role === 'manager';

  return {
    profile,
    loading,
    error,
    isAdmin,
    loadProfile
  };
};
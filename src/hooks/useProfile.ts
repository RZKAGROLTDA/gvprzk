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

    try {
      loadingRef.current = true;
      setLoading(true);
      
      console.log('🔄 Carregando perfil do usuário...');

      // Consulta simples para profile sem JOIN para evitar recursão RLS
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        console.warn('⚠️ Erro ao carregar perfil:', profileError);
        setProfile(null);
        return;
      }

      if (profileData) {
        // Consulta separada para filial se existir
        let filialNome = null;
        if (profileData.filial_id) {
          try {
            const { data: filial, error: filialError } = await supabase
              .from('filiais')
              .select('nome')
              .eq('id', profileData.filial_id)
              .maybeSingle();
            
            if (!filialError && filial) {
              filialNome = filial.nome;
            }
          } catch (error) {
            console.warn('⚠️ Erro ao carregar filial:', error);
          }
        }

        // Combinar os dados sem JOIN complexo
        const completeProfile = {
          ...profileData,
          filial_nome: filialNome || null
        };

        console.log('✅ Perfil carregado:', completeProfile);
        setProfile(completeProfile);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.warn('⚠️ Erro no perfil:', error);
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
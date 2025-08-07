import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  filial_id: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  filial?: {
    nome: string;
  };
}

export const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (user && user.id) {
      loadProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [user?.id]); // Only depend on user.id to avoid unnecessary re-renders

  const loadProfile = async () => {
    // Prevent multiple simultaneous calls
    if (loadingRef.current) {
      console.log('DEBUG: Carregamento já em andamento, ignorando...');
      return;
    }

    if (!user?.id) {
      console.log('DEBUG: Sem user ID, não é possível carregar perfil');
      setLoading(false);
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      console.log('DEBUG: Carregando perfil para user:', user.id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          filial:filials(nome)
        `)
        .eq('user_id', user.id)
        .maybeSingle(); // Use maybeSingle instead of single to handle no results

      console.log('DEBUG: Dados do perfil:', data);
      console.log('DEBUG: Erro:', error);

      if (error) {
        console.error('Erro ao carregar perfil:', error);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Erro inesperado ao carregar perfil:', error);
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
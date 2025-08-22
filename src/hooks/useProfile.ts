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
      return;
    }

    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          filiais:filial_id (
            nome
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        setProfile(null);
      } else {
        const profileData = data ? {
          ...data,
          filial_nome: data.filiais?.nome
        } : null;
        setProfile(profileData);
      }
    } catch (error) {
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
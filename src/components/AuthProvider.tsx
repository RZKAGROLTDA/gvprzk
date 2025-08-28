import React, { useState, useEffect } from 'react';
import { AuthContext, useAuthProvider } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { ProfileAutoCreator } from './ProfileAutoCreator';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const auth = useAuthProvider();
  const { profile, loading: profileLoading } = useProfile();
  const [showProfileCreator, setShowProfileCreator] = useState(false);

  useEffect(() => {
    if (auth.user && !auth.loading && !profileLoading) {
      // Se usuário está logado mas não tem perfil, mostrar criador
      if (!profile) {
        setShowProfileCreator(true);
      } else {
        setShowProfileCreator(false);
      }
    } else {
      setShowProfileCreator(false);
    }
  }, [auth.user, auth.loading, profile, profileLoading]);

  const handleProfileCreated = () => {
    setShowProfileCreator(false);
    // Forçar reload para atualizar todos os dados
    window.location.reload();
  };

  if (showProfileCreator) {
    return (
      <AuthContext.Provider value={auth}>
        <ProfileAutoCreator onProfileCreated={handleProfileCreated} />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};
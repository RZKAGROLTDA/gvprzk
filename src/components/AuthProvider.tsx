import React from 'react';
import { AuthContext, useAuthProvider } from '@/hooks/useAuth';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const auth = useAuthProvider();

  // Nenhum gate extra aqui: o contexto está sempre disponível a partir do 1º render.
  // Quem decide o que mostrar durante o loading é o consumidor (AuthAwareWrapper).
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};

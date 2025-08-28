import React from 'react';
import { AuthContext, useAuthProvider } from '@/hooks/useAuth';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [contextReady, setContextReady] = React.useState(false);
  const auth = useAuthProvider();

  // Garantir que o contexto está pronto antes de renderizar children
  React.useEffect(() => {
    if (auth) {
      setContextReady(true);
    }
  }, [auth]);

  if (!contextReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};
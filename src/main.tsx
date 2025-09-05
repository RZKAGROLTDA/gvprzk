import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { QueryProvider } from '@/components/QueryProvider'
import { useGlobalCacheInvalidation } from '@/hooks/useGlobalCacheInvalidation'
import App from './App.tsx'
import './index.css'

// Componente para inicializar o sistema de invalidação global
const AppWithGlobalCache = () => {
  useGlobalCacheInvalidation(); // Ativa o listener global
  return <App />;
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <HelmetProvider>
        <AppWithGlobalCache />
      </HelmetProvider>
    </QueryProvider>
  </StrictMode>
);

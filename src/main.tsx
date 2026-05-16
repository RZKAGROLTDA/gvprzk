import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { QueryProvider } from '@/components/QueryProvider'
import App from './App.tsx'
import './index.css'

// Desregistra service workers e limpa caches em ambientes de Preview/iframe
// para evitar que bundle antigo do PWA continue sendo servido.
(() => {
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const host = window.location.hostname;
  const isPreviewHost =
    host.includes('id-preview--') ||
    host.includes('lovableproject.com') ||
    host.includes('lovable.app') && host.includes('preview');

  if (isPreviewHost || isInIframe) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        if (regs.length === 0) return;
        Promise.all(regs.map((r) => r.unregister())).then(() => {
          if ('caches' in window) {
            caches.keys().then((names) =>
              Promise.all(names.map((n) => caches.delete(n)))
            ).then(() => {
              const url = new URL(window.location.href);
              if (!url.searchParams.has('_swcleanup')) {
                url.searchParams.set('_swcleanup', Date.now().toString());
                window.location.replace(url.toString());
              }
            });
          }
        });
      }).catch(() => {});
    }
  }
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </QueryProvider>
  </StrictMode>
);

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Generate version info at build time
  const packageJson = require('./package.json');
  const buildTime = new Date().toISOString();
  const buildHash = process.env.COMMIT_HASH || Math.random().toString(36).substring(2, 10);

  // Versão mínima obrigatória (configurável sem tocar em regra de negócio).
  // Arquivo malformado/ausente NUNCA quebra o build nem bloqueia o app.
  let minBuildTime = '';
  let minBuildHash = '';
  let minBuildReason = '';
  try {
    const min = require('./minimum-build.json');
    if (min && typeof min.minBuildTime === 'string' && !Number.isNaN(Date.parse(min.minBuildTime))) {
      minBuildTime = min.minBuildTime;
      minBuildHash = typeof min.minBuildHash === 'string' ? min.minBuildHash : '';
      minBuildReason = typeof min.reason === 'string' ? min.reason : '';
    } else {
      console.warn('[minimum-build] minBuildTime ausente ou inválido — gate obrigatório desativado');
    }
  } catch {
    console.warn('[minimum-build] minimum-build.json não encontrado — gate obrigatório desativado');
  }

  return {
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    ((): any => ({
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        (this as any).emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({
            version: packageJson.version,
            buildTime,
            buildHash,
            minBuildTime,
            minBuildHash,
            minBuildReason,
          }),
        });
      },
    }))(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: false, // Usamos manifest.webmanifest manual
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/~oauth/, /version\.json$/],
        runtimeCaching: [
          // ⚠️ Removido cache NetworkFirst do Supabase API:
          // ele segurava requisições antigas por até 24h (inclusive bundles antigos
          // já invalidados que continuavam fazendo upsert direto em tabelas).
          // Chamadas REST/RPC do Supabase devem ir SEMPRE direto à rede.
          {
            // Cache para imagens do Storage — SOMENTE respostas HTTP 200.
            // Status 0 (resposta opaca) foi removido: respostas opacas ou com
            // corpo vazio quebravam a geração do PDF (blob.size = 0).
            urlPattern: /^https:\/\/wuvbrkbhunifudaewhng\.supabase\.co\/storage/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-images-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },

          {
            // Cache para fontes do Google
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Desabilitar em dev para evitar problemas
      },
    }),
  ].filter(Boolean),
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_HASH__: JSON.stringify(buildHash),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    'import.meta.env.VITE_BUILD_HASH': JSON.stringify(buildHash),
    'import.meta.env.VITE_MIN_BUILD_TIME': JSON.stringify(minBuildTime),
    'import.meta.env.VITE_MIN_BUILD_HASH': JSON.stringify(minBuildHash),
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Preload CSS to prevent render blocking
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
    // Enable CSS code splitting for better loading performance
    cssCodeSplit: true,
  },
}});

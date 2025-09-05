import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Generate version info at build time
  const packageJson = require('./package.json');
  const buildTime = new Date().toISOString();
  const buildHash = process.env.COMMIT_HASH || Math.random().toString(36).substring(2, 10);

  return {
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_HASH__: JSON.stringify(buildHash),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    'import.meta.env.VITE_BUILD_HASH': JSON.stringify(buildHash),
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

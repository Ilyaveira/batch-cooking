/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base relative ('./') : l'app fonctionne quel que soit le sous-chemin
// (GitHub Pages sert le site sous /<nom-du-depot>/). Le routage se fait par hash (#/...).
export default defineConfig({
  base: './',
  build: {
    // ~520 ko (160 ko gzip) : React DOM, React Router, Dexie et Zod. Téléchargé une fois puis
    // servi depuis le cache hors ligne : seuil relevé en connaissance de cause.
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Batch cooking',
        short_name: 'Batch',
        description: 'Plan mensuel de batch cooking : menus, courses, sessions du dimanche.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fffaf3',
        theme_color: '#2f5d50',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout le nécessaire est pré-caché : l'app fonctionne en mode avion.
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});

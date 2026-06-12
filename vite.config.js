import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/regjistri-im/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon-32x32.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Regjistri im — Kujdestari & Vizita',
        short_name: 'Regjistri im',
        description: 'Regjistër për kujdestaritë, vizitat dhe të ardhurat mujore.',
        lang: 'sq',
        dir: 'ltr',
        theme_color: '#07101E',
        background_color: '#07101E',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['medical', 'productivity', 'finance'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // SPA fallback so deep links / reloads work offline.
        navigateFallback: 'index.html',
        // Never let the SW try to serve Google APIs from cache.
        navigateFallbackDenylist: [/^https:\/\/www\.googleapis\.com/],
      },
    }),
  ],
})

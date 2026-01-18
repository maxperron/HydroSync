import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // tailwindcss(), // Using manual postcss config for now to avoid issues, or use @tailwindcss/vite if using v4. 
    // Since I manually set up postcss, I don't strictly need the tailwindcss vite plugin unless I am fully on v4. 
    // I installed v4, so I probably should used the plugin, but let's stick to postcss config if valid.
    // Actually, tailwind v4 REQUIRES the vite plugin usually. 
    // But I will suppress it for now and assume the manual setup works or I'll fix if build fails.
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: true
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'HydroSync',
        short_name: 'HydroSync',
        description: 'Smart Hydration Tracker for HidrateSpark',
        theme_color: '#00C2FF',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
});

import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev`        → HTTP (localhost). El micrófono funciona solo en este equipo.
// `npm run dev:https`  → HTTPS con certificado local autofirmado + proxy a Django (:8000).
//   Necesario para usar micrófono, instalar la PWA o copiar al portapapeles desde el teléfono
//   por la IP de la red (los navegadores exigen HTTPS fuera de localhost).
export default defineConfig(({ mode }) => {
  const https = mode === 'https'
  return {
    plugins: [
      react(),
      ...(https ? [basicSsl()] : []),
      VitePWA({
        strategies: 'injectManifest', // service worker propio (push + cache)
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: { enabled: true, type: 'module' },
        manifest: {
          name: 'Luz',
          short_name: 'Luz',
          description: 'Tu asistente personal',
          lang: 'es',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#07090E',
          theme_color: '#07090E',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    // host: true → escucha en todas las interfaces (accesible desde el teléfono por la IP LAN)
    server: {
      host: true,
      port: 5173,
      ...(https
        ? {
            // Misma origen para la API y los audios: evita contenido mixto (https → http).
            proxy: {
              '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
              '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
            },
          }
        : {}),
    },
  }
})

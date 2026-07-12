import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Using relative paths to avoid Node types in TS config

export default defineConfig(({ mode }) => {
  // Load env from the frontend folder (since root is set to 'frontend')
  const env = loadEnv(mode, 'frontend', '')
  const backend = env.VITE_BACKEND_URL || env.VITE_API_BASE_URL || 'http://localhost:3001'
  return {
    plugins: [react()],
    root: 'frontend',
    publicDir: 'frontend/public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('/xlsx/')) return 'excel'
            if (id.includes('/jspdf/') || id.includes('/pdf-lib/') || id.includes('/pdfmake/') || id.includes('/html2canvas/')) return 'pdf'
            if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts'
            if (id.includes('/sweetalert2/')) return 'alerts'
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/redux')) return 'react-vendor'
            if (id.includes('/@radix-ui/')) return 'ui-vendor'
            return 'vendor'
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
        '/uploads': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
  }
})

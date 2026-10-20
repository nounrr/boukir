import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const buildId = new Date().toISOString()

// https://vite.dev/config/
// Using relative paths to avoid Node types in TS config

export default defineConfig(({ mode }) => {
  // Load env from the frontend folder (since root is set to 'frontend')
  const env = loadEnv(mode, 'frontend', '')
  const backend = env.VITE_BACKEND_URL || env.VITE_API_BASE_URL || 'http://localhost:3001'
  return {
    plugins: [
      react(),
      {
        name: 'app-version',
        apply: 'build' as const,
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ version: buildId }),
          })
        },
      },
    ],
    define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
    root: 'frontend',
    // `root` already points to frontend, so this resolves to frontend/public.
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
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

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
    },
    server: {
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
<<<<<<< HEAD
=======
        '/uploads': {
          target: backend,
          changeOrigin: true,
        },
>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79
      },
    },
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Domínio próprio (arsencapital.com) serve a partir da raiz, então a base
// é sempre '/' — não precisa mais do caminho '/bussola/' de project page.
export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 600,
  }
})

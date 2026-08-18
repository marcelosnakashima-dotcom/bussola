import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
    import { resolve } from 'path'
      
export default defineConfig({
    base: process.env.GITHUB_PAGES === 'true' ? '/bussola/' : '/',
    plugins: [react()],
    resolve: {
          alias: { '@': resolve(__dirname, './src') },
    },
    build: {
          chunkSizeWarningLimit: 600,
    }
})

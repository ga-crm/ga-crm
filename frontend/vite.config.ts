import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rolldownOptions: {
      output: {
        // Highcharts registers its series types as its modules load, each one building on the one
        // before (scatter extends line). Split into chunks, they ran out of order in the built
        // app only, and the home page failed with "Class extends value undefined". This keeps the
        // order of the source across chunks.
        strictExecutionOrder: true,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same origin as the app, so the session cookie and CSRF origin check work without CORS
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:4200',
      // Section 9: the API's WebSocket, on the same origin so the session cookie goes with it
      '/socket.io': { target: process.env.API_TARGET ?? 'http://localhost:4200', ws: true },
    },
  },
})

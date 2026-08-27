import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  define: {
    // Legacy client checks only. Never expose the real Gemini secret to the browser.
    'process.env.API_KEY': JSON.stringify('server-managed'),
    'process.env.GEMINI_API_KEY': JSON.stringify('server-managed'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));

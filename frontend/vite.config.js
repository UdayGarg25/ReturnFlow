import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The API address is baked into the bundle at build time. If it is missing, the app silently falls back to
  // http://localhost:5000 (see src/services/authApi.js) and every call fails for real visitors, so a production build
  // refuses to continue without a proper https address.
  if (mode === 'production') {
    const api = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '').VITE_API_URL?.trim()
    if (!api) throw new Error('VITE_API_URL is not set. Set it (for example on Vercel) to the public https address of the backend before building.')
    if (!/^https:\/\//i.test(api) || /\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(api)) throw new Error('VITE_API_URL must be the public https address of the backend, not http or localhost.')
  }
  return { plugins: [react(), tailwindcss()] }
})

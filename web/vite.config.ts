import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // HTTPS=1 serves a self-signed certificate, for phones that can't port-forward to localhost (iPhone).
  plugins: [react(), process.env.HTTPS ? basicSsl() : null],
})

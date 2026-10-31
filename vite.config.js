import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/v1/public/r5': {
        target: 'http://127.0.0.1:8790',
        changeOrigin: false,
        xfwd: false,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const codespace = process.env.CODESPACE_NAME
            const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
            const publicOrigin = `https://${codespace}-5174.${domain}`
            const publicHost = `${codespace}-5174.${domain}`
            const tunnelOrigin =
              req.headers.origin === 'http://localhost:5174' ||
              req.headers.origin === 'https://localhost:5174'

            if (
              process.env.CODESPACES === 'true' &&
              codespace &&
              domain === 'app.github.dev' &&
              req.method === 'POST' &&
              req.url?.split('?')[0]?.startsWith('/v1/public/r5/') &&
              [publicHost, 'localhost:5174', '127.0.0.1:5174'].includes(req.headers.host) &&
              typeof req.headers.referer === 'string' &&
              req.headers.referer.startsWith(`${publicOrigin}/`) &&
              tunnelOrigin
            ) {
              proxyReq.setHeader('origin', publicOrigin)
            }

            for (const header of [
              'forwarded',
              'x-forwarded-for',
              'x-real-ip',
              'cf-connecting-ip',
            ]) proxyReq.removeHeader(header)
          })
        },
      },
      '/v1/public/orders': {
        target: process.env.PDC_V5C41_PROXY === 'sandbox'
          ? 'http://127.0.0.1:8789'
          : 'http://127.0.0.1:8788',
        changeOrigin: false,
        xfwd: false,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Codespaces DEV : correction strictement limitée
            // à la réécriture de l'origine par le tunnel GitHub.
            const codespace = process.env.CODESPACE_NAME
            const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
            const publicHost = `${codespace}-5174.${domain}`
            const publicOrigin = `https://${publicHost}`

            const tunnelOrigin =
              req.headers.origin === 'http://localhost:5174' ||
              req.headers.origin === 'https://localhost:5174'

            if (
              process.env.CODESPACES === 'true' &&
              codespace &&
              domain === 'app.github.dev' &&
              req.method === 'POST' &&
              req.url?.split('?')[0] === '/v1/public/orders' &&
              [
                publicHost,
                'localhost:5174',
                '127.0.0.1:5174'
              ].includes(req.headers.host) &&
              typeof req.headers.referer === 'string' &&
              req.headers.referer.startsWith(`${publicOrigin}/`) &&
              tunnelOrigin
            ) {
              proxyReq.setHeader('origin', publicOrigin)
            }

            for (const header of [
              'forwarded',
              'x-forwarded-for',
              'x-real-ip',
              'cf-connecting-ip',
            ]) proxyReq.removeHeader(header)
          })
        },
      },
    },
  },
})
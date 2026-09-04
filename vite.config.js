import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/* Serve the api/ folder during `npm run dev`.

   In production Vercel runs api/*.js as serverless functions on its own. Vite
   knows nothing about them, so without this plugin `npm run dev` would 404 on
   /api/reconcile and you would need `vercel dev` (and a Vercel login) just to
   work on the thing locally. This mounts the same handlers on the dev server
   and shims the two response helpers Vercel provides, so one handler file runs
   unchanged in both places. */
function apiRoutes(env) {
  return {
    name: 'ledger-api-dev',
    configureServer(server) {
      /* handlers read process.env, which Vite does not populate for us */
      for (const k of ['ANTHROPIC_API_KEY', 'LEDGER_MODEL', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
        if (env[k] && !process.env[k]) process.env[k] = env[k]
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()

        const route = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '')
        if (!/^[a-z0-9-]+$/i.test(route)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${route}.js`)

          const chunks = []
          for await (const c of req) chunks.push(c)
          const raw = Buffer.concat(chunks).toString()
          try {
            req.body = raw ? JSON.parse(raw) : undefined
          } catch {
            req.body = undefined
          }

          res.status = (code) => {
            res.statusCode = code
            return res
          }
          res.json = (obj) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(obj))
            return res
          }

          await mod.default(req, res)
        } catch (err) {
          if (err && err.message && /Failed to load url/.test(err.message)) return next()
          server.config.logger.error(`[api] ${route}: ${err?.stack || err}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'dev_handler_threw', detail: String(err?.message || err) }))
          }
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), apiRoutes(env)] }
})

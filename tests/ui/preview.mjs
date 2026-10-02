import { createServer } from 'vite'

const vite = await createServer({
  configFile: false, appType: 'custom', server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
})
await vite.ssrLoadModule('/tests/ui/preview-server.ts')

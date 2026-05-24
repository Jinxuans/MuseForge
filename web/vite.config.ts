import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendProxyPaths = ['/api', '/images', '/v1', '/files', '/health']

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

export default defineConfig(({ command, mode }) => {
  const webEnv = loadEnv(mode, process.cwd(), '')
  const rootEnv = loadEnv(mode, projectRoot, '')
  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null
  const backendTarget = backendURL(webEnv, rootEnv)
  const backendProxy = Object.fromEntries(
    backendProxyPaths.map((item) => [
      item,
      {
        target: backendTarget,
        changeOrigin: true,
      },
    ]),
  )

  return {
    plugins: [react()],
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('streamdown') || id.includes('react-markdown') || id.includes('remark-gfm')) {
              return 'markdown'
            }
            if (id.includes('mermaid')) return 'mermaid'
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
              return 'react-vendor'
            }
            if (id.includes('/core-js/')) return 'polyfills'
            if (id.includes('/@fal-ai/')) return 'fal-vendor'
            return 'vendor'
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5171,
      proxy: {
        ...backendProxy,
        ...(devProxyConfig?.enabled
          ? {
              [devProxyConfig.prefix]: {
                target: devProxyConfig.target,
                changeOrigin: devProxyConfig.changeOrigin,
                secure: devProxyConfig.secure,
                rewrite: (requestPath) =>
                  requestPath.replace(
                    new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
                    '',
                  ),
              },
            }
          : {}),
      },
    },
  }
})

function backendURL(webEnv: Record<string, string>, rootEnv: Record<string, string>) {
  const explicit = webEnv.VITE_BACKEND_URL || rootEnv.VITE_BACKEND_URL || webEnv.BACKEND_URL || rootEnv.BACKEND_URL
  if (explicit) return explicit

  const addr = webEnv.ADDR || rootEnv.ADDR || ':5000'
  if (addr.startsWith(':')) return `http://127.0.0.1${addr}`
  if (/^https?:\/\//i.test(addr)) return addr
  return `http://${addr}`
}

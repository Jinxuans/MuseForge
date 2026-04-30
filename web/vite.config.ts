import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const proxiedBackendPaths = ['/api', '/images', '/files', '/health'];
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const webEnv = loadEnv(mode, process.cwd(), '');
  const rootEnv = loadEnv(mode, projectRoot, '');
  const backendTarget = backendURL(webEnv, rootEnv);

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5171,
      proxy: Object.fromEntries(
        proxiedBackendPaths.map((path) => [
          path,
          {
            target: backendTarget,
            changeOrigin: true
          }
        ])
      )
    }
  };
});

function backendURL(webEnv: Record<string, string>, rootEnv: Record<string, string>) {
  const explicit = webEnv.VITE_BACKEND_URL || rootEnv.VITE_BACKEND_URL || webEnv.BACKEND_URL || rootEnv.BACKEND_URL;
  if (explicit) return explicit;

  const addr = webEnv.ADDR || rootEnv.ADDR || ':5000';
  if (addr.startsWith(':')) return `http://127.0.0.1${addr}`;
  if (/^https?:\/\//i.test(addr)) return addr;
  return `http://${addr}`;
}

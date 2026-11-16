import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function readAppVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'public/version.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version) {
      return String(parsed.version).replace(/^v/i, '').trim();
    }
  } catch {
    // Fallback if version.json is temporarily unreadable
  }
  return '1.0.0';
}

function versionJsonSingleSourcePlugin(isServe: boolean): Plugin {
  return {
    name: 'version-json-single-source',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0].endsWith('/version.json')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
        next();
      });
    },
    transformIndexHtml(html) {
      if (!isServe) return html;
      const ver = readAppVersion();
      return html.replace(
        '<head>',
        `<head><script>window.__DEV_APP_VERSION__=${JSON.stringify(ver)};</script>`
      );
    },
  };
}

export default defineConfig(({command}) => {
  const initialVersion = readAppVersion();
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(initialVersion),
    },
    plugins: [react(), tailwindcss(), versionJsonSingleSourcePlugin(command === 'serve')],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

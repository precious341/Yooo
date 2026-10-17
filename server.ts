import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createApp } from './server/src/app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Development mode: attach Vite dev server middleware and bind WebSocket server
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });

    // Neutralize unhandled WebSocket rejection in @vite/client per AI Studio environment constraints ("HMR: Disabled. Ignore WebSocket errors")
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result && result.code) {
          const patchedCode = result.code
            .replace(
              /reject\(\/\* @__PURE__ \*\/ new Error\("WebSocket closed without opened\."\)\)/g,
              'resolve()'
            )
            .replace(
              /reject\(new Error\("WebSocket closed without opened\."\)\)/g,
              'resolve()'
            )
            .replace(
              /throw e;\s*},\s*async disconnect/g,
              'return; }, async disconnect'
            )
            .replace(
              /console\.error\(`\[vite\] failed to connect to websocket[^`]*`\);\s*throw e;/g,
              'return;'
            );

          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(patchedCode);
          return;
        }
      } catch (err) {
        console.warn('Failed to transform @vite/client, using default middleware:', err);
      }
      next();
    });

    app.use(vite.middlewares);
    console.log('⚡ Vite dev server middleware integrated with Express');
  } else {
    // Production mode: serve built static files from dist
    const express = (await import('express')).default;
    const fs = await import('fs');

    // Robust multi-path resolution across Render (/opt/render/project/src/dist), Linux, and containers
    const candidatePaths = [
      path.resolve(__dirname, 'dist'),
      path.resolve(process.cwd(), 'dist'),
      path.resolve(__dirname, '../dist'),
    ];

    let distPath = candidatePaths.find(p => fs.existsSync(path.resolve(p, 'index.html')));

    // If dist/index.html is missing (e.g. Render build command ran only 'npm install' or omitted 'npm run build'),
    // automatically trigger Vite build on startup so the frontend is generated cleanly.
    if (!distPath) {
      console.warn('⚠️ [Production] dist/index.html not found. Triggering automated Vite build on startup...');
      try {
        const { build: viteBuild } = await import('vite');
        await viteBuild({
          configFile: path.resolve(__dirname, 'vite.config.ts'),
        });
        console.log('✅ Automated production Vite build completed.');
        distPath = path.resolve(__dirname, 'dist');
      } catch (buildErr: any) {
        console.error('❌ Automatic Vite build failed:', buildErr?.message || buildErr);
        distPath = path.resolve(__dirname, 'dist');
      }
    }

    console.log(`📁 Serving production static files from: ${distPath}`);
    app.use(express.static(distPath));

    app.get('*', (req, res, next) => {
      // Don't intercept API routes
      if (req.path.startsWith('/api')) {
        return next();
      }

      const indexPath = path.resolve(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send(`
          <!doctype html>
          <html>
            <head><title>Build Required</title></head>
            <body style="font-family: -apple-system, sans-serif; background: #090d16; color: #f1f5f9; padding: 3rem;">
              <h2>Frontend Build Missing</h2>
              <p>The production server could not find <code>${indexPath}</code>.</p>
              <p>Please ensure your Render Build Command is set to: <code>npm run build</code></p>
            </body>
          </html>
        `);
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DocuMind AI Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

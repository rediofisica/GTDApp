import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: 'api-serverless-dev',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/')) return next();

            const urlPath = req.url.split('?')[0];
            let handlerModule;
            try {
              if (urlPath === '/api/gemini-voice') {
                handlerModule = await import('./api/gemini-voice.js');
              } else if (urlPath === '/api/gemini-tasks') {
                handlerModule = await import('./api/gemini-tasks.js');
              } else {
                return next();
              }
            } catch (err) {
              console.error('Error loading API handler:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }

            // Read request body
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
              try {
                const rawBody = Buffer.concat(chunks).toString();
                if (req.headers['content-type']?.includes('application/json') && rawBody) {
                  try {
                    req.body = JSON.parse(rawBody);
                  } catch {
                    req.body = rawBody;
                  }
                } else {
                  req.body = rawBody;
                }

                // Parse query params
                const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                req.query = Object.fromEntries(parsedUrl.searchParams);

                // Add res.status().json() helpers
                res.status = function (code) {
                  this.statusCode = code;
                  return this;
                };
                res.json = function (data) {
                  this.setHeader('Content-Type', 'application/json');
                  return this.end(JSON.stringify(data));
                };

                const handler = handlerModule.default || handlerModule;
                await handler(req, res);
              } catch (err) {
                console.error('API handler error:', err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message }));
                }
              }
            });
          });
        }
      }
    ]
  };
});

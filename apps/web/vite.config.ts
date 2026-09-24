import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import obfuscator from 'vite-plugin-javascript-obfuscator';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

function localDevSiteUrl(): string {
  return (process.env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function localDevApiUrl(siteUrl: string): string {
  return (process.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');
}

function loadRobotsTemplate(): string {
  const templatePath = path.resolve('seo', 'robots.txt.template');
  return fs.readFileSync(templatePath, 'utf8');
}

function seoBuildPlugin(env: Record<string, string>): Plugin {
  const resolveSiteUrl = () =>
    (env.VITE_SITE_URL || process.env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  const resolveApiUrl = (siteUrl: string) =>
    (env.VITE_API_URL || process.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');
  const robotsTemplate = loadRobotsTemplate();

  const patchSeoFiles = (contents: string, siteUrl: string) =>
    contents.replace(/__HIN_SITE_URL__/g, siteUrl);

  return {
    name: 'hin-seo-build',
    transformIndexHtml(html) {
      const siteUrl = resolveSiteUrl();
      let out = patchSeoFiles(html, siteUrl);
      const googleVerification = env.VITE_GOOGLE_SITE_VERIFICATION || process.env.VITE_GOOGLE_SITE_VERIFICATION || '';
      if (googleVerification) {
        out = out.replace(
          '<!-- google-site-verification: set VITE_GOOGLE_SITE_VERIFICATION at build time -->',
          `<meta name="google-site-verification" content="${googleVerification}" />`,
        );
      }
      return out;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/robots.txt') {
          const robots = patchSeoFiles(robotsTemplate, resolveSiteUrl());
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(robots);
          return;
        }
        next();
      });
    },
    closeBundle() {
      const siteUrl = resolveSiteUrl();
      const apiUrl = resolveApiUrl(siteUrl);
      const workerPath = path.resolve('dist', '_worker.js');
      if (fs.existsSync(workerPath)) {
        const worker = patchSeoFiles(fs.readFileSync(workerPath, 'utf8'), siteUrl)
          .replace(/__HIN_API_URL__/g, apiUrl);
        fs.writeFileSync(workerPath, worker);
      }

      const robotsPath = path.resolve('dist', 'robots.txt');
      fs.writeFileSync(robotsPath, patchSeoFiles(robotsTemplate, siteUrl));
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const plugins = [wasm(), topLevelAwait(), react(), tailwindcss(), seoBuildPlugin(env)];

  if (command === 'build') {
    plugins.push(
      obfuscator({
        options: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          renameGlobals: false,
          rotateStringArray: true,
          selfDefending: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.75,
        },
        exclude: [/wasm\/chat/, /hin_chat_wasm/],
      })
    );
  }

  const apiProxyTarget = (process.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');

  return {
    plugins,
    build: {
      rollupOptions: {
        input: {
          main: path.resolve('index.html'),
          welcome: path.resolve('welcome.html'),
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: apiProxyTarget,
          ws: true,
          changeOrigin: true,
        },
        '/sitemap.xml': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
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

function seoBuildPlugin(): Plugin {
  const siteUrl = localDevSiteUrl();
  const apiUrl = localDevApiUrl(siteUrl);
  const googleVerification = process.env.VITE_GOOGLE_SITE_VERIFICATION || '';
  const robotsTemplate = loadRobotsTemplate();

  const patchSeoFiles = (contents: string) =>
    contents.replace(/__HIN_SITE_URL__/g, siteUrl);

  return {
    name: 'hin-seo-build',
    transformIndexHtml(html) {
      let out = patchSeoFiles(html);
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
          const robots = patchSeoFiles(robotsTemplate);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(robots);
          return;
        }
        next();
      });
    },
    closeBundle() {
      const workerPath = path.resolve('dist', '_worker.js');
      if (fs.existsSync(workerPath)) {
        const worker = patchSeoFiles(fs.readFileSync(workerPath, 'utf8'))
          .replace(/__HIN_API_URL__/g, apiUrl);
        fs.writeFileSync(workerPath, worker);
      }

      const robotsPath = path.resolve('dist', 'robots.txt');
      fs.writeFileSync(robotsPath, patchSeoFiles(robotsTemplate));
    },
  };
}

export default defineConfig(({ command }) => {
  const plugins = [wasm(), topLevelAwait(), react(), tailwindcss(), seoBuildPlugin()];

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
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/sitemap.xml': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

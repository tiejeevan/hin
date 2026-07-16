import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ command }) => {
  const plugins = [react(), tailwindcss()];

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
      })
    );
  }

  return {
    plugins,
    server: {
      host: true,
      port: 5173,
    },
  };
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import disableDevtool from 'disable-devtool';
import { installGlobalFetchLoading } from './lib/globalLoading';
import { GlobalLoadingOverlay } from './components/ui/GlobalLoadingOverlay';
import { installSeoHeadSync } from './lib/seoHead';

installGlobalFetchLoading();
installSeoHeadSync();

// Register PWA service worker (push handlers live in public/sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=2').catch(() => {
      /* ignore registration failures in unsupported contexts */
    });
  });
}

// Disable developer tools in production and reload page on detection
if (import.meta.env.PROD) {
  disableDevtool({
    url: 'about:blank',
    disableMenu: false,
    clearLog: true,
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <GlobalLoadingOverlay />
  </React.StrictMode>,
);

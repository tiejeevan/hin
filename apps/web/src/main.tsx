import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import disableDevtool from 'disable-devtool';

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
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import disableDevtool from 'disable-devtool';

// Disable developer tools in production and reload page on detection
if (import.meta.env.PROD) {
  disableDevtool({
    disableMenu: false, // Enable standard right-click context menu
    ondevtoolopen() {
      window.location.reload();
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

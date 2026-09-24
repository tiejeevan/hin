import React from 'react';
import ReactDOM from 'react-dom/client';
import { WelcomePage } from './pages/WelcomePage';
import './index.css';

/**
 * Standalone entry for the /welcome landing page.
 *
 * Built as a separate page (welcome.html) so the main app entry is not loaded
 * for /welcome. Do not merge this into main.tsx.
 *
 * Local dev: http://localhost:5173/welcome.html — production: /welcome via Pages.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WelcomePage />
  </React.StrictMode>,
);

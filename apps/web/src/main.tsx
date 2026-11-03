import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { registerSW } from 'virtual:pwa-register';

import { App } from './App';
import { applyPrefs } from './hooks';
import { startApp } from './sync/store';
import './styles.css';

applyPrefs();
void startApp();

// The service worker caches the app itself, so it opens with no connection.
// New versions install in the background and apply on the next start.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

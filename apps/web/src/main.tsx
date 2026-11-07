import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { applyPrefs } from './hooks';
import { startApp } from './sync/store';
import { startUpdates } from './update';
import './styles.css';

applyPrefs();
void startApp();

// The service worker caches the app itself, so it opens with no connection.
// New versions download in the background; see update.ts for when they apply.
startUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

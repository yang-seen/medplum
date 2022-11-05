import { MedplumClient } from '@medplum/core';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AppRoutes } from './AppRoutes';
import { getConfig } from './config';

import './index.css';

if ('serviceWorker' in navigator) {
  // Clear all server workers
  // Once upon a time, we used a service worker to cache static assets.
  // We don't do that anymore, but the old service worker is still there.
  // This code removes it.
  // Someday we can remove this code.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch((regError) => console.error('SW registration failed: ', regError));
  });
}

export async function initApp(): Promise<void> {
  const config = getConfig();

  const medplum = new MedplumClient({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    cacheTime: 60000,
    autoBatchTime: 100,
    onUnauthenticated: () => {
      if (window.location.pathname !== '/signin' && window.location.pathname !== '/oauth') {
        window.location.href = '/signin?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      }
    },
  });

  const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }]);

  const navigate = (path: string): Promise<void> => router.navigate(path);

  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(<App medplum={medplum} router={router} navigate={navigate} />);
}

if (process.env.NODE_ENV !== 'test') {
  initApp().catch(console.error);
}

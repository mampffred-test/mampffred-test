import React from 'react';
import { createRoot } from 'react-dom/client';
import MampffredApp from '@/components/mampffred-app';
import '@/app/globals.css';

const root = document.getElementById('root')!;

if (window.self !== window.top) {
  const warning = document.createElement('p');
  warning.className = 'embedding-warning';
  warning.textContent =
    'Mampffred kann aus Sicherheitsgründen nicht in eine andere Seite eingebettet werden.';
  root.replaceChildren(warning);
} else {
  createRoot(root).render(
    <React.StrictMode>
      <MampffredApp />
    </React.StrictMode>,
  );
}

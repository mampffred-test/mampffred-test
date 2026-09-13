import React from 'react';
import { createRoot } from 'react-dom/client';
import MampffredApp from '@/components/mampffred-app';
import '@/app/globals.css';

const root = document.getElementById('root')!;

function isLocalMobilePreview() {
  if (!import.meta.env.DEV) return false;
  try {
    return (
      ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname) &&
      window.parent === window.top &&
      window.parent.location.origin === window.location.origin &&
      window.parent.location.pathname === '/mobile-preview.html'
    );
  } catch {
    return false;
  }
}

if (window.self !== window.top && !isLocalMobilePreview()) {
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

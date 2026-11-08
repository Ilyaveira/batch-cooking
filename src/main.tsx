import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles.css';

// Service worker : met l'app en cache pour le hors-ligne et se met à jour seul.
registerSW({ immediate: true });

// Demande au navigateur de ne pas effacer les données locales sous pression d'espace.
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

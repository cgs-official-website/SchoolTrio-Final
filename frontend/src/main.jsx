import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Catch lazy loading errors globally (e.g., stale chunk on new deployment) and reload once safely
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error (likely stale chunk).', event);
  try {
    const now = Date.now();
    const lastReload = parseInt(sessionStorage.getItem('vite_preload_reload_ts') || '0', 10);
    // Throttle automatic reloads to once per 10 seconds to prevent infinite reload loops
    if (now - lastReload > 10000) {
      sessionStorage.setItem('vite_preload_reload_ts', String(now));
      console.warn('Reloading page to fetch latest application bundle...');
      window.location.reload();
    } else {
      console.error('Repeated Vite preload error detected. Suppressed reload loop to preserve session.');
    }
  } catch {
    // Fallback if sessionStorage is inaccessible
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

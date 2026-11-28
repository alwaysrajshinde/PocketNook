import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import { markAppBundleReady } from './services/appUpdateService'

// Service Worker: Enable on Web/PWA ONLY; disable inside Capacitor Android APK
// so SW cache never conflicts with native OTA bundle updates.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  } else if (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.log('[PWA] Service Worker registration failed:', err);
        });
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Signal CapacitorUpdater that initial JS boot succeeded (enables auto-rollback if future bundle crashes)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    markAppBundleReady().catch(() => {});
  }, 400);
}

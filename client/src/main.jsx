import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import { activatePendingUpdateOnColdLaunch, markAppBundleReady } from './services/appUpdateService'

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

function renderPocketNookApp() {
  // Notify native CapacitorUpdater immediately at startup BEFORE any network requests or async effects run
  if (Capacitor.isNativePlatform()) {
    markAppBundleReady().catch(() => {});
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (Capacitor.isNativePlatform()) {
  // Activate staged OTA updates strictly at cold startup before React/forms mount (local IPC only, no network calls)
  activatePendingUpdateOnColdLaunch()
    .catch(() => {})
    .finally(() => {
      renderPocketNookApp();
    });
} else {
  renderPocketNookApp();
}

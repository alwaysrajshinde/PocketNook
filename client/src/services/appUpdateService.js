/**
 * appUpdateService.js
 * Zero-Cost Cryptographically Verified Live Update Manager for PocketNook Android (Capacitor)
 *
 * Uses @capgo/capacitor-updater in self-hosted manual mode:
 * - Zero paid cloud dependencies (autoUpdate: false, statsUrl: "")
 * - Manifest hosted on GitHub Pages HTTPS (configurable via VITE_UPDATE_MANIFEST_URL)
 * - Compatible web-layer ZIP bundles hosted on GitHub Releases
 * - Verifies: HTTPS trusted origin -> ECDSA P-256 signature -> minNativeVersionCode -> SHA-256 ZIP integrity
 * - Auto-rollback if notifyAppReady() fails after switching bundle
 */

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { APP_VERSION } from '../constants/version.js';

export const DEFAULT_MANIFEST_URL = 'https://alwaysrajshinde.github.io/PocketNook/update-manifest.json';

// Embedded ECDSA P-256 PUBLIC key (safe to ship inside Android binary & web bundle; NEVER contains private key).
// Can be rotated/overridden at CI build time via GitHub Variable `VITE_UPDATE_PUBLIC_KEY_JWK`.
export const DEFAULT_PUBLIC_KEY_JWK = {
  kty: 'EC',
  x: 'sE1CDy7tpuUkPHvZ8CvULYxKFeYN1kRJvSk0hoaQ4HQ',
  y: 'k7Ga87wmIR_4UODXQIkCqJWxmPVgduz_Nfzsqkj1D8k',
  crv: 'P-256'
};

export const EMBEDDED_PUBLIC_KEY_JWK = (() => {
  try {
    const raw = import.meta.env?.VITE_UPDATE_PUBLIC_KEY_JWK;
    return raw ? JSON.parse(raw) : DEFAULT_PUBLIC_KEY_JWK;
  } catch {
    return DEFAULT_PUBLIC_KEY_JWK;
  }
})();

export const TRUSTED_UPDATE_ORIGINS = [
  'https://alwaysrajshinde.github.io/',
  'https://github.com/alwaysrajshinde/PocketNook/',
  'https://objects.githubusercontent.com/',
  'https://release-assets.githubusercontent.com/'
];

const UPDATE_STATE_KEY = 'pocketnook_ota_update_state';

export function normalizeSemver(v = '0.0.0') {
  return String(v || '0.0.0').trim().replace(/^v/i, '').split('-')[0];
}

export function compareSemver(a = '0.0.0', b = '0.0.0') {
  const pa = normalizeSemver(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeSemver(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function isTrustedHttpsUrl(url, extraAllowedPrefixes = []) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const allowed = [...TRUSTED_UPDATE_ORIGINS, ...extraAllowedPrefixes];
    return allowed.some((prefix) => url.startsWith(prefix));
  } catch {
    return false;
  }
}

export function buildCanonicalManifestPayload(manifest = {}) {
  return [
    normalizeSemver(manifest.webVersion),
    String(Number(manifest.minNativeVersionCode || 1)),
    String(Number(manifest.nativeVersionCode || manifest.minNativeVersionCode || 1)),
    String(manifest.sha256 || '').toLowerCase(),
    String(manifest.bundleUrl || '')
  ].join('|');
}

function base64ToUint8Array(b64) {
  const clean = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verifies ECDSA P-256 signature over the canonical manifest payload using WebCrypto.
 */
export async function verifyManifestSignature(manifest, publicKeyJwk = EMBEDDED_PUBLIC_KEY_JWK) {
  if (!publicKeyJwk || publicKeyJwk.kty !== 'EC' || !publicKeyJwk.x || !publicKeyJwk.y) {
    return { valid: false, reason: 'Update verification public key missing or invalid.' };
  }
  if (!manifest?.signature || typeof manifest.signature !== 'string') {
    return { valid: false, reason: 'Manifest signature is missing.' };
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return { valid: false, reason: 'WebCrypto unavailable on this runtime.' };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const dataBytes = new TextEncoder().encode(buildCanonicalManifestPayload(manifest));
    const sigBytes = base64ToUint8Array(manifest.signature);
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      sigBytes,
      dataBytes
    );
    return verified
      ? { valid: true, mode: 'ecdsa_p256_verified' }
      : { valid: false, reason: 'Manifest cryptographic signature mismatch.' };
  } catch (err) {
    return { valid: false, reason: err?.message || 'Manifest signature verification failed.' };
  }
}

export function readPersistedUpdateState() {
  try {
    const raw = localStorage.getItem(UPDATE_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePersistedUpdateState(patch) {
  try {
    const next = { ...readPersistedUpdateState(), ...patch };
    localStorage.setItem(UPDATE_STATE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return patch;
  }
}

/**
 * Signals native CapacitorUpdater that the loaded bundle booted successfully.
 * Must run after React + auth/storage mount so broken bundles trigger automatic native rollback.
 */
export async function markAppBundleReady() {
  if (!Capacitor.isNativePlatform()) return { native: false };
  try {
    await CapacitorUpdater.notifyAppReady();
    const current = await CapacitorUpdater.current().catch(() => null);
    writePersistedUpdateState({
      lastBootStatus: 'ready',
      lastBootTimestamp: new Date().toISOString(),
      activeBundleId: current?.bundle?.id || 'builtin',
      activeBundleVersion: current?.bundle?.version || normalizeSemver(APP_VERSION)
    });
    return { native: true, bundle: current?.bundle || null };
  } catch (err) {
    console.warn('[AppUpdate] notifyAppReady error:', err);
    return { native: true, error: err?.message };
  }
}

/**
 * Resolves installed native versionCode and active OTA web version.
 */
export async function getInstalledVersionInfo() {
  const webVersion = normalizeSemver(APP_VERSION);
  if (!Capacitor.isNativePlatform()) {
    return {
      isNative: false,
      webVersion,
      nativeVersionName: webVersion,
      nativeVersionCode: 1,
      activeBundleId: 'web'
    };
  }

  let nativeVersionName = webVersion;
  let nativeVersionCode = 1;
  let activeBundleId = 'builtin';
  let currentWebVersion = webVersion;

  try {
    const appInfo = await CapacitorApp.getInfo();
    nativeVersionName = appInfo.version || webVersion;
    nativeVersionCode = parseInt(appInfo.build, 10) || 1;
  } catch {}

  try {
    const curr = await CapacitorUpdater.current();
    if (curr?.bundle?.id) activeBundleId = curr.bundle.id;
    if (curr?.bundle?.version && curr.bundle.version !== 'builtin') {
      currentWebVersion = normalizeSemver(curr.bundle.version);
    }
  } catch {}

  return {
    isNative: true,
    webVersion: currentWebVersion,
    nativeVersionName,
    nativeVersionCode,
    activeBundleId
  };
}

/**
 * Fetches, verifies, and stages a compatible OTA web update (or reports native APK requirement).
 */
export async function checkForAppUpdates({
  manifestUrl = import.meta.env?.VITE_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL,
  allowUntrustedTestOrigins = [],
  applyImmediately = false,
  publicKeyJwk = EMBEDDED_PUBLIC_KEY_JWK
} = {}) {
  const checkedAt = new Date().toISOString();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    return writePersistedUpdateState({
      status: 'offline',
      checkedAt,
      message: 'Offline — update check skipped cleanly.'
    });
  }

  if (!isTrustedHttpsUrl(manifestUrl, allowUntrustedTestOrigins)) {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      error: 'Untrusted manifest URL blocked.'
    });
  }

  try {
    const installed = await getInstalledVersionInfo();
    const res = await fetch(`${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`Manifest check failed (HTTP ${res.status})`);
    }

    const manifest = await res.json();
    if (!manifest || !manifest.webVersion || !manifest.sha256 || !manifest.bundleUrl) {
      throw new Error('Malformed update manifest.');
    }
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256))) {
      throw new Error('Invalid SHA-256 digest in update manifest.');
    }
    if (!isTrustedHttpsUrl(manifest.bundleUrl, allowUntrustedTestOrigins)) {
      throw new Error('Bundle download URL is not on a trusted HTTPS origin.');
    }

    const sigCheck = await verifyManifestSignature(manifest, publicKeyJwk);
    if (!sigCheck.valid) {
      throw new Error(sigCheck.reason || 'Update signature rejected.');
    }

    // Check native binary compatibility first (new permissions/plugins require new signed APK)
    const minNative = Number(manifest.minNativeVersionCode || 1);
    if (installed.nativeVersionCode < minNative) {
      return writePersistedUpdateState({
        status: 'native_update_required',
        checkedAt,
        currentWebVersion: installed.webVersion,
        currentNativeCode: installed.nativeVersionCode,
        latestVersion: normalizeSemver(manifest.webVersion),
        minNativeVersionCode: minNative,
        apkUrl: isTrustedHttpsUrl(manifest.apkUrl, allowUntrustedTestOrigins)
          ? manifest.apkUrl
          : 'https://github.com/alwaysrajshinde/PocketNook/releases/latest',
        releaseNotes: String(manifest.releaseNotes || 'This release updates Android native capabilities and requires installing the latest signed APK.'),
        message: `PocketNook v${normalizeSemver(manifest.webVersion)} requires the new Android APK.`
      });
    }

    // Check if newer compatible web bundle exists
    if (compareSemver(manifest.webVersion, installed.webVersion) <= 0) {
      return writePersistedUpdateState({
        status: 'up_to_date',
        checkedAt,
        currentWebVersion: installed.webVersion,
        currentNativeCode: installed.nativeVersionCode,
        latestVersion: normalizeSemver(manifest.webVersion),
        message: `PocketNook v${installed.webVersion} is up to date.`
      });
    }

    // On web browser (non-Capacitor), only report availability without invoking native CapacitorUpdater
    if (!installed.isNative) {
      return writePersistedUpdateState({
        status: 'web_update_available',
        checkedAt,
        currentWebVersion: installed.webVersion,
        latestVersion: normalizeSemver(manifest.webVersion),
        releaseNotes: String(manifest.releaseNotes || ''),
        message: `v${normalizeSemver(manifest.webVersion)} is live on web (refresh to load).`
      });
    }

    // Native Android: download via CapacitorUpdater with native 64-char SHA-256 verification
    writePersistedUpdateState({
      status: 'downloading',
      checkedAt,
      latestVersion: normalizeSemver(manifest.webVersion),
      message: `Downloading update v${normalizeSemver(manifest.webVersion)}...`
    });

    const bundle = await CapacitorUpdater.download({
      url: manifest.bundleUrl,
      version: normalizeSemver(manifest.webVersion),
      checksum: String(manifest.sha256).toLowerCase()
    });

    if (applyImmediately) {
      await CapacitorUpdater.set({ id: bundle.id });
      return writePersistedUpdateState({
        status: 'applied',
        checkedAt,
        stagedBundleId: bundle.id,
        stagedVersion: bundle.version,
        releaseNotes: String(manifest.releaseNotes || ''),
        message: `Update v${bundle.version} applied cleanly.`
      });
    }

    // Stage safely for next launch / background resume so user never loses active form state
    await CapacitorUpdater.next({ id: bundle.id });
    return writePersistedUpdateState({
      status: 'ready_to_install',
      checkedAt,
      currentWebVersion: installed.webVersion,
      stagedBundleId: bundle.id,
      stagedVersion: normalizeSemver(manifest.webVersion),
      releaseNotes: String(manifest.releaseNotes || 'Compatible update downloaded and verified.'),
      message: `Update v${normalizeSemver(manifest.webVersion)} downloaded & verified. Tap Restart to apply now, or it applies on next launch.`
    });
  } catch (err) {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      error: err?.message || 'Failed to check or download update.'
    });
  }
}

export async function applyStagedBundleNow(bundleId) {
  if (!Capacitor.isNativePlatform() || !bundleId) return false;
  await CapacitorUpdater.set({ id: bundleId });
  return true;
}

export async function openNativeApkDownload(apkUrl) {
  const url = isTrustedHttpsUrl(apkUrl)
    ? apkUrl
    : 'https://github.com/alwaysrajshinde/PocketNook/releases/latest';
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

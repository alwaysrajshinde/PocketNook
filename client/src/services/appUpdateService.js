/**
 * appUpdateService.js
 * Zero-Cost Cryptographically Verified Automatic Live Update Manager for PocketNook Android (Capacitor)
 *
 * Uses @capgo/capacitor-updater in self-hosted mode (autoUpdate: false, zero paid Capgo Cloud):
 * - Automatically checks manifest on launch and throttled foreground resume (15-min cooldown)
 * - Manifest hosted over permanent public HTTPS with CORS (raw.githubusercontent.com ota-manifest branch)
 * - Compatible web-layer ZIP bundles hosted permanently on GitHub Releases
 * - Verifies: HTTPS trusted origin -> ECDSA P-256 signature -> minNativeVersionCode -> downgrade/duplicate/failed-bundle guard -> SHA-256 ZIP integrity
 * - Downloads silently in background and queues via CapacitorUpdater.next() so active sessions are never interrupted
 * - Preserves automatic rollback protection via notifyAppReady()
 */

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { APP_VERSION } from '../constants/version.js';

export const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/alwaysrajshinde/PocketNook/ota-manifest/update-manifest.json';

// 15-minute cooldown between automatic foreground resume checks
export const AUTO_UPDATE_COOLDOWN_MS = 15 * 60 * 1000;

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
  'https://raw.githubusercontent.com/alwaysrajshinde/PocketNook/',
  'https://alwaysrajshinde.github.io/PocketNook/',
  'https://github.com/alwaysrajshinde/PocketNook/',
  'https://objects.githubusercontent.com/',
  'https://release-assets.githubusercontent.com/'
];

const UPDATE_STATE_KEY = 'pocketnook_ota_update_state';
const MAX_FAILED_VERSIONS_TRACKED = 12;

let inFlightAutoUpdatePromise = null;
// In-memory only: prevents duplicate activation calls within the same JS boot,
// while resetting cleanly on any fresh load so transient errors never permanently block updates.
const attemptedColdActivationIds = new Set();

export function resetUpdateRuntimeLocks() {
  inFlightAutoUpdatePromise = null;
  attemptedColdActivationIds.clear();
}

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
 * Fails closed whenever the public key or signature is missing or invalid.
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
 * Records a rolled-back or broken bundle version so future automatic checks do not re-download it.
 */
export function recordFailedBundleVersion(version, reason = 'Bundle failed boot check and rolled back.') {
  const normalized = normalizeSemver(version);
  if (!normalized || normalized === '0.0.0') return readPersistedUpdateState();

  const prev = readPersistedUpdateState();
  const existing = Array.isArray(prev.failedVersions) ? prev.failedVersions : [];
  const nextFailed = Array.from(new Set([...existing.map((v) => normalizeSemver(v)), normalized])).slice(
    -MAX_FAILED_VERSIONS_TRACKED
  );

  const shouldClearStaged = prev?.stagedVersion === normalized;
  return writePersistedUpdateState({
    failedVersions: nextFailed,
    lastFailedVersion: normalized,
    lastFailedReason: reason,
    ...(shouldClearStaged
      ? { stagedBundleId: null, stagedVersion: null, pendingManifest: null }
      : {})
  });
}

/**
 * Signals native CapacitorUpdater that the loaded bundle booted successfully.
 * Records any recently rolled-back failed bundle reported by native getFailedUpdate().
 */
export async function markAppBundleReady({
  isNative = Capacitor.isNativePlatform(),
  updater = CapacitorUpdater
} = {}) {
  if (!isNative) return { native: false };
  try {
    await updater.notifyAppReady();
    const current = await updater.current?.().catch(() => null);
    const failedEvent = await updater.getFailedUpdate?.().catch(() => null);
    if (failedEvent?.bundle?.version) {
      recordFailedBundleVersion(
        failedEvent.bundle.version,
        'Previous update rolled back automatically because it failed startup verification.'
      );
    }

    const activeVersion = current?.bundle?.version && current.bundle.version !== 'builtin'
      ? normalizeSemver(current.bundle.version)
      : normalizeSemver(APP_VERSION);
    const prev = readPersistedUpdateState();
    const activeMatchesStaged = prev?.stagedVersion && compareSemver(activeVersion, prev.stagedVersion) >= 0;

    writePersistedUpdateState({
      lastBootStatus: 'ready',
      lastBootTimestamp: new Date().toISOString(),
      activeBundleId: current?.bundle?.id || 'builtin',
      activeBundleVersion: activeVersion,
      ...(activeMatchesStaged
        ? {
          status: 'up_to_date',
          stagedBundleId: null,
          stagedVersion: null,
          pendingManifest: null,
          message: `PocketNook v${activeVersion} is up to date.`
        }
        : {})
    });

    return {
      native: true,
      bundle: current?.bundle || null,
      rolledBackBundle: failedEvent?.bundle || null
    };
  } catch (err) {
    console.warn('[AppUpdate] notifyAppReady error:', err);
    return { native: true, error: err?.message };
  }
}

/**
 * Resolves installed native versionCode and active OTA web version.
 */
export async function getInstalledVersionInfo({
  isNative = Capacitor.isNativePlatform(),
  appPlugin = CapacitorApp,
  updater = CapacitorUpdater
} = {}) {
  const webVersion = normalizeSemver(APP_VERSION);
  if (!isNative) {
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
    const appInfo = await appPlugin.getInfo();
    nativeVersionName = appInfo.version || webVersion;
    nativeVersionCode = parseInt(appInfo.build, 10) || 1;
  } catch { }

  try {
    const curr = await updater.current();
    if (curr?.bundle?.id) activeBundleId = curr.bundle.id;
    if (curr?.bundle?.version && curr.bundle.version !== 'builtin') {
      currentWebVersion = normalizeSemver(curr.bundle.version);
    }
  } catch { }

  return {
    isNative: true,
    webVersion: currentWebVersion,
    nativeVersionName,
    nativeVersionCode,
    activeBundleId
  };
}

/**
 * Validates manifest structure, trusted HTTPS URLs, ECDSA signature, and SHA-256 digest format.
 */
export async function validateManifestSecurity(manifest, {
  allowUntrustedTestOrigins = [],
  publicKeyJwk = EMBEDDED_PUBLIC_KEY_JWK
} = {}) {
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
  return sigCheck;
}

async function getLocalUpdaterBundles(updater) {
  try {
    const res = await updater?.list?.();
    return Array.isArray(res?.bundles) ? res.bundles : [];
  } catch {
    return [];
  }
}

/**
 * Checks for updates automatically in the background (with cooldown & in-flight dedupe),
 * validates signature & compatibility, and silently downloads + queues via next().
 */
export async function checkForAppUpdates(options = {}) {
  const {
    bypassInFlightLock = false
  } = options;

  if (!bypassInFlightLock && inFlightAutoUpdatePromise) {
    return inFlightAutoUpdatePromise;
  }

  const runPromise = runCheckForAppUpdates(options).finally(() => {
    if (!bypassInFlightLock && inFlightAutoUpdatePromise === runPromise) {
      inFlightAutoUpdatePromise = null;
    }
  });

  if (!bypassInFlightLock) {
    inFlightAutoUpdatePromise = runPromise;
  }
  return runPromise;
}

async function runCheckForAppUpdates({
  manifestUrl = import.meta.env?.VITE_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL,
  allowUntrustedTestOrigins = [],
  autoDownload = true,
  applyImmediately = false,
  onProgress = null,
  publicKeyJwk = EMBEDDED_PUBLIC_KEY_JWK,
  force = false,
  cooldownMs = AUTO_UPDATE_COOLDOWN_MS,
  now = () => Date.now(),
  isNative = Capacitor.isNativePlatform(),
  updater = CapacitorUpdater,
  appPlugin = CapacitorApp,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null
} = {}) {
  const nowMs = Number(now());
  const checkedAt = new Date(nowMs).toISOString();
  const prev = readPersistedUpdateState();

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    return writePersistedUpdateState({
      status: 'offline',
      checkedAt,
      message: 'Offline — automatic update check deferred cleanly.'
    });
  }

  // Enforce foreground throttling cooldown unless caller explicitly forces an immediate check
  const lastAttemptMs = Number(prev?.lastCheckAttemptAt || 0);
  if (!force && cooldownMs > 0 && lastAttemptMs > 0 && nowMs - lastAttemptMs < cooldownMs) {
    return {
      ...prev,
      throttled: true,
      checkedAt: prev?.checkedAt || checkedAt
    };
  }

  if (!isTrustedHttpsUrl(manifestUrl, allowUntrustedTestOrigins)) {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      lastCheckAttemptAt: nowMs,
      error: 'Untrusted manifest URL blocked.',
      message: 'Automatic update check blocked untrusted source.'
    });
  }

  if (typeof fetchImpl !== 'function') {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      lastCheckAttemptAt: nowMs,
      error: 'Fetch API unavailable.'
    });
  }

  writePersistedUpdateState({ lastCheckAttemptAt: nowMs });

  try {
    const installed = await getInstalledVersionInfo({ isNative, appPlugin, updater });
    const res = await fetchImpl(`${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}t=${nowMs}`, {
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`Manifest check failed (HTTP ${res.status})`);
    }

    const manifest = await res.json();
    await validateManifestSecurity(manifest, { allowUntrustedTestOrigins, publicKeyJwk });

    const targetVersion = normalizeSemver(manifest.webVersion);

    // 1. Check native binary compatibility first (new permissions/plugins require new signed APK)
    const minNative = Number(manifest.minNativeVersionCode || 1);
    if (installed.nativeVersionCode < minNative) {
      return writePersistedUpdateState({
        status: 'native_update_required',
        checkedAt,
        currentWebVersion: installed.webVersion,
        nativeVersionName: installed.nativeVersionName,
        currentNativeCode: installed.nativeVersionCode,
        latestVersion: targetVersion,
        minNativeVersionCode: minNative,
        apkUrl: isTrustedHttpsUrl(manifest.apkUrl, allowUntrustedTestOrigins)
          ? manifest.apkUrl
          : 'https://github.com/alwaysrajshinde/PocketNook/releases/latest',
        releaseNotes: String(manifest.releaseNotes || 'This update includes native Android changes and requires the latest signed APK.'),
        message: `PocketNook v${targetVersion} requires a newer signed Android APK.`
      });
    }

    // 2. Same version or downgrade rejection
    const versionCmp = compareSemver(targetVersion, installed.webVersion);
    if (versionCmp <= 0) {
      const isDowngrade = versionCmp < 0;
      return writePersistedUpdateState({
        status: 'up_to_date',
        checkedAt,
        currentWebVersion: installed.webVersion,
        nativeVersionName: installed.nativeVersionName,
        currentNativeCode: installed.nativeVersionCode,
        activeBundleId: installed.activeBundleId,
        latestVersion: targetVersion,
        stagedBundleId: null,
        stagedVersion: null,
        pendingManifest: null,
        downgradeRejected: isDowngrade,
        message: isDowngrade
          ? `PocketNook v${installed.webVersion} is newer than v${targetVersion} (downgrade blocked).`
          : `PocketNook v${installed.webVersion} is up to date.`
      });
    }

    // 3. Reject retrying any bundle version that previously rolled back / failed startup verification
    const nativeRecentFail = isNative ? await updater.getFailedUpdate?.().catch(() => null) : null;
    if (nativeRecentFail?.bundle?.version) {
      recordFailedBundleVersion(
        nativeRecentFail.bundle.version,
        'Previous update rolled back automatically because it failed startup verification.'
      );
    }
    const latestPersisted = readPersistedUpdateState();
    const localBundles = isNative ? await getLocalUpdaterBundles(updater) : [];
    const persistedFailed = Array.isArray(latestPersisted?.failedVersions)
      ? latestPersisted.failedVersions.map((v) => normalizeSemver(v))
      : [];
    const nativeFailed = localBundles.some(
      (b) => normalizeSemver(b?.version) === targetVersion && String(b?.status || '').toLowerCase() === 'error'
    );
    if (persistedFailed.includes(targetVersion) || nativeFailed) {
      recordFailedBundleVersion(targetVersion, 'Skipped known failing/rolled-back bundle.');
      return writePersistedUpdateState({
        status: 'error',
        checkedAt,
        currentWebVersion: installed.webVersion,
        latestVersion: targetVersion,
        blockedFailedVersion: targetVersion,
        error: `Update v${targetVersion} was previously rolled back and will not be retried.`,
        message: `Skipped previously rolled-back update v${targetVersion}.`
      });
    }

    // 4. Prevent duplicate downloads ONLY for completed local bundles ('pending' or 'success').
    // Interrupted downloads remain 'downloading' in list() and must be re-downloaded cleanly rather than staged.
    const existingLocalBundle = localBundles.find((b) => {
      const status = String(b?.status || '').toLowerCase();
      return (
        normalizeSemver(b?.version) === targetVersion &&
        b?.id &&
        b.id !== 'builtin' &&
        (status === 'pending' || status === 'success')
      );
    });

    const persistedReadyMatchesCompleteLocal =
      prev?.status === 'ready_to_install' &&
      prev?.stagedVersion === targetVersion &&
      prev?.stagedBundleId &&
      (!isNative || localBundles.length === 0 || Boolean(existingLocalBundle));

    if (persistedReadyMatchesCompleteLocal || existingLocalBundle) {
      const stagedId = existingLocalBundle?.id || prev.stagedBundleId;
      return writePersistedUpdateState({
        status: 'ready_to_install',
        checkedAt,
        currentWebVersion: installed.webVersion,
        nativeVersionName: installed.nativeVersionName,
        currentNativeCode: installed.nativeVersionCode,
        activeBundleId: installed.activeBundleId,
        latestVersion: targetVersion,
        stagedBundleId: stagedId,
        stagedVersion: targetVersion,
        deduplicated: true,
        pendingManifest: null,
        message: `Update v${targetVersion} verified & queued — applies automatically on next cold launch.`
      });
    }

    if (!autoDownload) {
      return writePersistedUpdateState({
        status: 'update_available',
        checkedAt,
        currentWebVersion: installed.webVersion,
        nativeVersionName: installed.nativeVersionName,
        currentNativeCode: installed.nativeVersionCode,
        activeBundleId: installed.activeBundleId,
        latestVersion: targetVersion,
        sizeBytes: Number(manifest.sizeBytes || 0),
        releaseNotes: String(manifest.releaseNotes || ''),
        pendingManifest: manifest,
        message: `Update v${targetVersion} is available.`
      });
    }

    return await downloadAndStageAppUpdate({
      manifest,
      allowUntrustedTestOrigins,
      applyImmediately,
      onProgress,
      publicKeyJwk,
      isNative,
      updater,
      appPlugin
    });
  } catch (err) {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      error: err?.message || 'Failed to check for updates.',
      message: err?.message || 'Failed to check for updates.'
    });
  }
}

/**
 * Downloads, verifies SHA-256 natively, and queues a verified OTA bundle via CapacitorUpdater.next().
 */
export async function downloadAndStageAppUpdate({
  manifest = null,
  allowUntrustedTestOrigins = [],
  applyImmediately = false,
  onProgress = null,
  publicKeyJwk = EMBEDDED_PUBLIC_KEY_JWK,
  isNative = Capacitor.isNativePlatform(),
  updater = CapacitorUpdater,
  appPlugin = CapacitorApp
} = {}) {
  const checkedAt = new Date().toISOString();
  const targetManifest = manifest || readPersistedUpdateState()?.pendingManifest;
  if (!targetManifest) {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      error: 'No verified update manifest available to download.',
      message: 'No verified update manifest available.'
    });
  }

  let downloadSub = null;
  try {
    const installed = await getInstalledVersionInfo({ isNative, appPlugin, updater });
    await validateManifestSecurity(targetManifest, { allowUntrustedTestOrigins, publicKeyJwk });

    const targetVersion = normalizeSemver(targetManifest.webVersion);
    const minNative = Number(targetManifest.minNativeVersionCode || 1);
    if (installed.nativeVersionCode < minNative) {
      return writePersistedUpdateState({
        status: 'native_update_required',
        checkedAt,
        currentWebVersion: installed.webVersion,
        currentNativeCode: installed.nativeVersionCode,
        latestVersion: targetVersion,
        minNativeVersionCode: minNative,
        apkUrl: isTrustedHttpsUrl(targetManifest.apkUrl, allowUntrustedTestOrigins)
          ? targetManifest.apkUrl
          : 'https://github.com/alwaysrajshinde/PocketNook/releases/latest',
        releaseNotes: String(targetManifest.releaseNotes || ''),
        message: `PocketNook v${targetVersion} requires a newer signed Android APK.`
      });
    }

    if (compareSemver(targetVersion, installed.webVersion) <= 0) {
      return writePersistedUpdateState({
        status: 'up_to_date',
        checkedAt,
        currentWebVersion: installed.webVersion,
        latestVersion: targetVersion,
        downgradeRejected: compareSemver(targetVersion, installed.webVersion) < 0,
        message: `PocketNook v${installed.webVersion} is up to date.`
      });
    }

    if (!installed.isNative) {
      return writePersistedUpdateState({
        status: 'up_to_date',
        checkedAt,
        currentWebVersion: installed.webVersion,
        latestVersion: targetVersion,
        message: `Automatic OTA updates apply natively on Android (v${installed.webVersion} active on web).`
      });
    }

    writePersistedUpdateState({
      status: 'downloading',
      checkedAt,
      latestVersion: targetVersion,
      progress: 0,
      message: `Downloading update v${targetVersion} in background...`
    });
    if (onProgress) onProgress(0);

    if (typeof updater.addListener === 'function') {
      downloadSub = await Promise.resolve(
        updater.addListener('download', (evt) => {
          const pct = Math.max(0, Math.min(100, Math.round(Number(evt?.percent || 0))));
          if (onProgress) onProgress(pct);
        })
      ).catch(() => null);
    }

    const bundle = await updater.download({
      url: targetManifest.bundleUrl,
      version: targetVersion,
      checksum: String(targetManifest.sha256).toLowerCase()
    });

    if (!bundle || !bundle.id) {
      throw new Error('Downloaded update bundle did not return a valid bundle ID.');
    }

    if (onProgress) onProgress(100);

    if (applyImmediately) {
      await updater.set({ id: bundle.id });
      return writePersistedUpdateState({
        status: 'applied',
        checkedAt,
        stagedBundleId: bundle.id,
        stagedVersion: bundle.version || targetVersion,
        progress: 100,
        pendingManifest: null,
        releaseNotes: String(targetManifest.releaseNotes || ''),
        message: `Update v${bundle.version || targetVersion} activated.`
      });
    }

    // Do NOT call CapacitorUpdater.next({ id }) here:
    // next() triggers native installNext() inside appMovedToBackground(), which reloads WebView when switching apps
    // (or if Activity.onDestroy clears DelayUpdateUtils kill conditions).
    // Leaving NEXT_VERSION unset ensures background transitions never reload; cold boot activates via set({ id }).
    return writePersistedUpdateState({
      status: 'ready_to_install',
      checkedAt,
      currentWebVersion: installed.webVersion,
      nativeVersionName: installed.nativeVersionName,
      currentNativeCode: installed.nativeVersionCode,
      activeBundleId: installed.activeBundleId,
      latestVersion: targetVersion,
      stagedBundleId: bundle.id,
      stagedVersion: targetVersion,
      progress: 100,
      pendingManifest: null,
      releaseNotes: String(targetManifest.releaseNotes || ''),
      message: `Update v${targetVersion} verified & queued — applies automatically on next cold launch.`
    });
  } catch (err) {
    return writePersistedUpdateState({
      status: 'error',
      checkedAt,
      progress: 0,
      error: err?.message || 'Update download or verification failed.',
      message: err?.message || 'Update download or verification failed.'
    });
  } finally {
    try {
      await downloadSub?.remove?.();
    } catch { }
  }
}

/**
 * Activates a previously staged OTA bundle ONLY on cold startup (prior to React/form mount).
 * Inspects persisted stagedBundleId against native list() (or legacy getNextBundle()), enforces
 * completed status / version / rollback safety, and avoids sessionStorage persistence so transient
 * activation failures never permanently block a valid pending update on future launches.
 */
export async function activatePendingUpdateOnColdLaunch({
  isNative = Capacitor.isNativePlatform(),
  updater = CapacitorUpdater,
  timeoutMs = 1500
} = {}) {
  if (!isNative) return { native: false, activated: false };

  const runActivation = async () => {
    const failedEvent = await updater.getFailedUpdate?.().catch(() => null);
    if (failedEvent?.bundle?.version) {
      recordFailedBundleVersion(
        failedEvent.bundle.version,
        'Previous update rolled back automatically because it failed startup verification.'
      );
    }

    const current = await updater.current?.().catch(() => null);
    const currentId = current?.bundle?.id || 'builtin';
    const currentVersion = current?.bundle?.version && current.bundle.version !== 'builtin'
      ? normalizeSemver(current.bundle.version)
      : normalizeSemver(APP_VERSION);

    const prev = readPersistedUpdateState();
    const failedVersions = Array.isArray(prev?.failedVersions)
      ? prev.failedVersions.map((v) => normalizeSemver(v))
      : [];

    const localBundles = await getLocalUpdaterBundles(updater);
    const nativeNext = await updater.getNextBundle?.().catch(() => null);

    // Resolve candidate from persisted stagedBundleId verified in localBundles (or legacy getNextBundle)
    let candidate = null;
    if (prev?.status === 'ready_to_install' && prev?.stagedBundleId) {
      candidate = localBundles.find((b) => b?.id === prev.stagedBundleId) || (
        localBundles.length === 0 ? { id: prev.stagedBundleId, version: prev.stagedVersion, status: 'pending' } : null
      );
    }
    if (!candidate && nativeNext && nativeNext.id) {
      candidate = nativeNext;
    }

    if (!candidate || !candidate.id || candidate.id === 'builtin' || candidate.id === currentId) {
      return { native: true, activated: false, reason: 'no_pending_bundle' };
    }

    const candidateStatus = String(candidate.status || '').toLowerCase();
    if (candidateStatus !== 'pending' && candidateStatus !== 'success') {
      if (candidateStatus === 'error' || candidateStatus === 'deleted' || candidateStatus === 'deleting') {
        writePersistedUpdateState({ stagedBundleId: null, stagedVersion: null, pendingManifest: null });
      }
      return { native: true, activated: false, reason: 'candidate_invalid_status' };
    }

    const candidateVersion = candidate.version && candidate.version !== 'builtin'
      ? normalizeSemver(candidate.version)
      : (prev?.stagedVersion ? normalizeSemver(prev.stagedVersion) : null);

    if (candidateVersion && failedVersions.includes(candidateVersion)) {
      writePersistedUpdateState({ stagedBundleId: null, stagedVersion: null, pendingManifest: null });
      return { native: true, activated: false, reason: 'candidate_failed_previously' };
    }

    if (candidateVersion && compareSemver(candidateVersion, currentVersion) <= 0) {
      writePersistedUpdateState({ stagedBundleId: null, stagedVersion: null, pendingManifest: null });
      return { native: true, activated: false, reason: 'already_current_or_downgrade' };
    }

    // In-memory guard prevents duplicate calls within the same JS boot only
    if (attemptedColdActivationIds.has(candidate.id)) {
      return { native: true, activated: false, reason: 'already_attempted_this_boot' };
    }
    attemptedColdActivationIds.add(candidate.id);

    await updater.cancelDelay?.().catch(() => { });
    await updater.set({ id: candidate.id });
    return {
      native: true,
      activated: true,
      bundleId: candidate.id,
      version: candidateVersion
    };
  };

  try {
    if (timeoutMs > 0) {
      return await Promise.race([
        runActivation(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ native: true, activated: false, reason: 'timeout' }), timeoutMs)
        )
      ]);
    }
    return await runActivation();
  } catch (err) {
    return { native: true, activated: false, error: err?.message || 'Cold launch activation failed.' };
  }
}

export async function applyStagedBundleNow(bundleId, { updater = CapacitorUpdater } = {}) {
  if (!Capacitor.isNativePlatform() || !bundleId) return false;
  await updater.cancelDelay?.().catch(() => { });
  await updater.set({ id: bundleId });
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

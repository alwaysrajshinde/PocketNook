import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  normalizeSemver,
  compareSemver,
  isTrustedHttpsUrl,
  buildCanonicalManifestPayload,
  verifyManifestSignature,
  checkForAppUpdates,
  downloadAndStageAppUpdate,
  activatePendingUpdateOnColdLaunch,
  markAppBundleReady,
  resetUpdateRuntimeLocks,
  readPersistedUpdateState,
  recordFailedBundleVersion,
  AUTO_UPDATE_COOLDOWN_MS
} from '../../client/src/services/appUpdateService.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(i) { return Array.from(store.keys())[i] ?? null; },
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); }
  };
}

function createSignedManifestHelper() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const signManifest = (m) => ({
    ...m,
    signatureAlgorithm: 'ECDSA-P256-SHA256-P1363',
    signature: crypto
      .sign('sha256', Buffer.from(buildCanonicalManifestPayload(m), 'utf8'), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363'
      })
      .toString('base64')
  });
  return { publicJwk, privatePem, signManifest };
}

function createMockUpdater({
  currentBundle = { id: 'builtin', version: 'builtin', status: 'success' },
  bundles = [],
  nextBundle = null,
  failedUpdate = null,
  rejectDownloadChecksum = false,
  downloadBundleId = 'bundle_v2_5_0'
} = {}) {
  const callOrder = [];
  const calls = {
    download: [],
    next: [],
    set: [],
    setMultiDelay: [],
    cancelDelay: 0,
    getNextBundle: 0,
    notifyAppReady: 0,
    list: 0,
    getFailedUpdate: 0,
    callOrder
  };
  let activeFailed = failedUpdate;
  let activeNext = nextBundle;
  let activeDelayConditions = [];
  const localBundles = [...bundles];

  return {
    calls,
    // Simulates native Android CapacitorUpdaterPlugin.appMovedToBackground() -> checkCancelDelay(BACKGROUND) -> installNext()
    simulateAppMovedToBackground() {
      callOrder.push('background');
      const remaining = activeDelayConditions.filter((c) => c.kind === 'kill');
      activeDelayConditions = remaining;
      if (remaining.length > 0) {
        return { reloaded: false, reason: 'delayed_until_kill' };
      }
      if (activeNext && activeNext.id !== currentBundle.id && activeNext.status !== 'error') {
        calls.set.push({ id: activeNext.id, source: 'background_installNext' });
        return { reloaded: true, activatedId: activeNext.id };
      }
      return { reloaded: false, reason: 'no_next' };
    },
    updater: {
      async current() {
        return { bundle: currentBundle, native: '2.4.5' };
      },
      async list() {
        calls.list += 1;
        return { bundles: localBundles };
      },
      async getNextBundle() {
        calls.getNextBundle += 1;
        return activeNext;
      },
      async getFailedUpdate() {
        calls.getFailedUpdate += 1;
        const out = activeFailed;
        activeFailed = null;
        return out;
      },
      async notifyAppReady() {
        calls.notifyAppReady += 1;
        return { bundle: currentBundle };
      },
      async addListener() {
        return { remove: async () => {} };
      },
      async setMultiDelay(opts) {
        callOrder.push('setMultiDelay');
        calls.setMultiDelay.push(opts);
        activeDelayConditions = Array.isArray(opts?.delayConditions) ? [...opts.delayConditions] : [];
      },
      async cancelDelay() {
        callOrder.push('cancelDelay');
        calls.cancelDelay += 1;
        activeDelayConditions = [];
      },
      async download(opts) {
        callOrder.push('download');
        calls.download.push(opts);
        if (rejectDownloadChecksum) {
          throw new Error('Checksum mismatch while verifying OTA zip');
        }
        const downloaded = { id: downloadBundleId, version: opts.version, status: 'pending' };
        localBundles.push(downloaded);
        return downloaded;
      },
      async next(opts) {
        callOrder.push('next');
        calls.next.push(opts);
        activeNext = localBundles.find((b) => b.id === opts.id) || { id: opts.id, version: '2.4.6', status: 'pending' };
        return activeNext;
      },
      async set(opts) {
        callOrder.push('set');
        calls.set.push(opts);
        activeNext = null;
      }
    },
    appPlugin: {
      async getInfo() {
        return { version: '2.4.5', build: '2' };
      }
    }
  };
}

function withMockBrowserEnv(online = true) {
  globalThis.window = globalThis;
  globalThis.localStorage = createMemoryStorage();
  globalThis.sessionStorage = createMemoryStorage();
  resetUpdateRuntimeLocks();
  const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: online }
  });
  return () => {
    resetUpdateRuntimeLocks();
    if (origNav) Object.defineProperty(globalThis, 'navigator', origNav);
    else delete globalThis.navigator;
  };
}

test('SemVer normalization & comparison handles OTA web version upgrades cleanly', () => {
  assert.equal(normalizeSemver('v2.4.5'), '2.4.5');
  assert.equal(compareSemver('2.4.6', '2.4.5'), 1);
  assert.equal(compareSemver('v2.10.0', '2.4.9'), 1);
  assert.equal(compareSemver('2.4.5', '2.4.5'), 0);
  assert.equal(compareSemver('2.4.4', '2.4.5'), -1);
});

test('Trusted HTTPS origin check rejects HTTP and untrusted third-party hosts', () => {
  assert.equal(isTrustedHttpsUrl('https://raw.githubusercontent.com/alwaysrajshinde/PocketNook/ota-manifest/update-manifest.json'), true);
  assert.equal(isTrustedHttpsUrl('https://alwaysrajshinde.github.io/PocketNook/update-manifest.json'), true);
  assert.equal(isTrustedHttpsUrl('https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.6/bundle.zip'), true);
  assert.equal(isTrustedHttpsUrl('http://alwaysrajshinde.github.io/PocketNook/update-manifest.json'), false);
  assert.equal(isTrustedHttpsUrl('https://evil.example.com/update.zip'), false);
  assert.equal(isTrustedHttpsUrl('javascript:alert(1)'), false);
});

test('ECDSA P-256 manifest signing script + WebCrypto verifyManifestSignature detect valid and tampered manifests', async () => {
  const { publicJwk, privatePem } = createSignedManifestHelper();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pn-ota-test-'));
  const zipPath = path.join(tmpDir, 'bundle.zip');
  const outManifest = path.join(tmpDir, 'update-manifest.json');
  await fs.writeFile(zipPath, Buffer.from('PK-test-bundle-payload'));

  try {
    execFileSync(
      process.execPath,
      [
        path.resolve('scripts/generate-update-manifest.mjs'),
        '--zip', zipPath,
        '--version', '2.4.6',
        '--minNativeCode', '1',
        '--nativeCode', '1',
        '--bundleUrl', 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.6/pocketnook-web-v2.4.6.zip',
        '--out', outManifest
      ],
      { env: { ...process.env, UPDATE_SIGNING_PRIVATE_KEY_PEM: privatePem } }
    );

    const manifest = JSON.parse(await fs.readFile(outManifest, 'utf8'));
    assert.equal(manifest.webVersion, '2.4.6');
    assert.equal(manifest.sha256.length, 64);
    assert.equal(manifest.signatureAlgorithm, 'ECDSA-P256-SHA256-P1363');

    const validRes = await verifyManifestSignature(manifest, publicJwk);
    assert.equal(validRes.valid, true);
    assert.equal(validRes.mode, 'ecdsa_p256_verified');

    assert.equal((await verifyManifestSignature({ ...manifest, bundleUrl: 'https://github.com/evil/repo/releases/download/v2.4.6/pwn.zip' }, publicJwk)).valid, false);
    assert.equal((await verifyManifestSignature({ ...manifest, sha256: 'a'.repeat(64) }, publicJwk)).valid, false);
    assert.equal((await verifyManifestSignature({ ...manifest, signature: '' }, publicJwk)).valid, false);
    assert.equal((await verifyManifestSignature(manifest, null)).valid, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Automatic OTA flow: compatible newer version downloads silently in background without calling next() or set(), preventing background reloads', async () => {
  const restoreEnv = withMockBrowserEnv(true);
  try {
    const { publicJwk, signManifest } = createSignedManifestHelper();
    const { updater, appPlugin, calls } = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' }
    });

    const manifest = signManifest({
      webVersion: '2.4.6',
      minNativeVersionCode: 2,
      nativeVersionCode: 2,
      bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.6/pocketnook-web-v2.4.6.zip',
      sha256: 'd'.repeat(64)
    });

    const res = await checkForAppUpdates({
      manifestUrl: 'https://raw.githubusercontent.com/alwaysrajshinde/PocketNook/ota-manifest/update-manifest.json',
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      fetchImpl: async () => ({ ok: true, json: async () => manifest })
    });

    assert.equal(res.status, 'ready_to_install');
    assert.equal(res.stagedBundleId, 'bundle_v2_5_0');
    assert.equal(res.stagedVersion, '2.4.6');
    assert.equal(calls.download.length, 1);
    assert.equal(calls.download[0].checksum, 'd'.repeat(64));
    // Crucial: neither next() nor set() is called during background staging, so appMovedToBackground() / onDestroy cannot trigger a reload
    assert.equal(calls.next.length, 0);
    assert.equal(calls.set.length, 0);
  } finally {
    restoreEnv();
  }
});

test('Safe cold-launch activation: switching to PhonePe/WhatsApp, locking screen, or activity destruction without next() never reloads; cold launch activates safely & transient failures do not permanently block', async () => {
  const restoreEnv = withMockBrowserEnv(true);
  try {
    const { publicJwk, signManifest } = createSignedManifestHelper();
    const mock = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' },
      downloadBundleId: 'bundle_2_4_6'
    });

    const manifest = signManifest({
      webVersion: '2.4.6',
      minNativeVersionCode: 2,
      nativeVersionCode: 2,
      bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.6/pocketnook-web-v2.4.6.zip',
      sha256: 'e'.repeat(64)
    });

    // Session 1: background download + local staging (no next())
    const checkRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater: mock.updater,
      appPlugin: mock.appPlugin,
      force: true,
      fetchImpl: async () => ({ ok: true, json: async () => manifest })
    });
    assert.equal(checkRes.status, 'ready_to_install');

    // User switches to PhonePe / WhatsApp or locks phone -> appMovedToBackground() sees no nextBundle -> NEVER reloads
    const bg1 = mock.simulateAppMovedToBackground();
    const bg2 = mock.simulateAppMovedToBackground();
    assert.equal(bg1.reloaded, false);
    assert.equal(bg1.reason, 'no_next');
    assert.equal(bg2.reloaded, false);
    assert.equal(mock.calls.set.length, 0);

    // Simulate transient activation failure on first launch (even if sessionStorage retains keys across WebView reloads)
    globalThis.sessionStorage.setItem('some_sticky_key', '1');
    const failingOnceUpdater = {
      ...mock.updater,
      async set() {
        throw new Error('Transient WebView bridge busy');
      }
    };
    const failedOnce = await activatePendingUpdateOnColdLaunch({
      isNative: true,
      updater: failingOnceUpdater
    });
    assert.equal(failedOnce.activated, false);
    assert.match(failedOnce.error, /Transient WebView bridge busy/i);

    // Next fresh boot (in-memory lock resets, sessionStorage still populated) MUST NOT permanently block valid pending bundle!
    resetUpdateRuntimeLocks();
    const coldRes = await activatePendingUpdateOnColdLaunch({
      isNative: true,
      updater: mock.updater
    });
    assert.equal(coldRes.activated, true);
    assert.equal(coldRes.bundleId, 'bundle_2_4_6');
    assert.equal(coldRes.version, '2.4.6');
    assert.equal(mock.calls.set.length, 1);
    assert.equal(mock.calls.set[0].id, 'bundle_2_4_6');

    // New bundle boots cleanly and calls notifyAppReady() immediately before network requests
    const newBootMock = createMockUpdater({
      currentBundle: { id: 'bundle_2_4_6', version: '2.4.6', status: 'pending' },
      nextBundle: null
    });
    resetUpdateRuntimeLocks();
    const coldAfterActivate = await activatePendingUpdateOnColdLaunch({
      isNative: true,
      updater: newBootMock.updater
    });
    assert.equal(coldAfterActivate.activated, false);
    assert.equal(coldAfterActivate.reason, 'no_pending_bundle');
    await markAppBundleReady({ isNative: true, updater: newBootMock.updater });
    assert.equal(newBootMock.calls.notifyAppReady, 1);
    assert.equal(readPersistedUpdateState().status, 'up_to_date');
    assert.equal(readPersistedUpdateState().stagedBundleId, null);

    // Guard checks: no pending bundle, already active version, and failed/rolled-back bundle are handled safely
    const noPendingMock = createMockUpdater({
      currentBundle: { id: 'bundle_2_4_6', version: '2.4.6', status: 'success' },
      bundles: [{ id: 'bundle_2_4_6', version: '2.4.6', status: 'success' }]
    });
    const noPendingRes = await activatePendingUpdateOnColdLaunch({
      isNative: true,
      updater: noPendingMock.updater
    });
    assert.equal(noPendingRes.activated, false);
    assert.equal(noPendingRes.reason, 'no_pending_bundle');

    recordFailedBundleVersion('2.4.9', 'Boot timeout');
    const blockedColdMock = createMockUpdater({
      currentBundle: { id: 'bundle_2_4_6', version: '2.4.6', status: 'success' },
      nextBundle: { id: 'broken_2_4_9', version: '2.4.9', status: 'pending' }
    });
    const blockedColdRes = await activatePendingUpdateOnColdLaunch({
      isNative: true,
      updater: blockedColdMock.updater
    });
    assert.equal(blockedColdRes.activated, false);
    assert.equal(blockedColdRes.reason, 'candidate_failed_previously');
    assert.equal(blockedColdMock.calls.set.length, 0);
  } finally {
    restoreEnv();
  }
});

test('Automatic OTA guards: rejects same version, downgrades, untrusted URLs, invalid signatures, and malformed or mismatched SHA-256 checksums', async () => {
  const restoreEnv = withMockBrowserEnv(true);
  try {
    const { publicJwk, signManifest } = createSignedManifestHelper();
    const { updater, appPlugin, calls } = createMockUpdater({
      currentBundle: { id: 'bundle_2_4_6', version: '2.4.6', status: 'success' }
    });

    // 1. Same version -> no download
    const sameRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => signManifest({
          webVersion: '2.4.6',
          minNativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.6/b.zip',
          sha256: 'e'.repeat(64)
        })
      })
    });
    assert.equal(sameRes.status, 'up_to_date');
    assert.equal(sameRes.downgradeRejected, false);
    assert.equal(calls.download.length, 0);

    // 2. Older version (downgrade) -> blocked cleanly
    const downgradeRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => signManifest({
          webVersion: '2.4.4',
          minNativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.4/b.zip',
          sha256: 'e'.repeat(64)
        })
      })
    });
    assert.equal(downgradeRes.status, 'up_to_date');
    assert.equal(downgradeRes.downgradeRejected, true);
    assert.equal(calls.download.length, 0);

    // 3. Invalid ECDSA signature -> rejected
    const badSigRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          webVersion: '2.5.0',
          minNativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.5.0/b.zip',
          sha256: 'a'.repeat(64),
          signature: 'invalid-base64-sig'
        })
      })
    });
    assert.equal(badSigRes.status, 'error');
    assert.equal(calls.download.length, 0);

    // 4. Untrusted manifest URL & untrusted bundle URL -> rejected
    const untrustedManifestRes = await checkForAppUpdates({
      manifestUrl: 'https://evil.example.com/update-manifest.json',
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      force: true
    });
    assert.equal(untrustedManifestRes.status, 'error');
    assert.match(untrustedManifestRes.error, /Untrusted manifest URL/i);

    const untrustedBundleRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => signManifest({
          webVersion: '2.5.0',
          minNativeVersionCode: 1,
          bundleUrl: 'https://evil.example.com/pwn.zip',
          sha256: 'a'.repeat(64)
        })
      })
    });
    assert.equal(untrustedBundleRes.status, 'error');
    assert.match(untrustedBundleRes.error, /trusted HTTPS origin/i);

    // 5. Invalid SHA-256 format -> rejected before download
    const badShaFormatRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => signManifest({
          webVersion: '2.5.0',
          minNativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.5.0/b.zip',
          sha256: 'not-a-valid-sha256'
        })
      })
    });
    assert.equal(badShaFormatRes.status, 'error');
    assert.match(badShaFormatRes.error, /Invalid SHA-256/i);
    assert.equal(calls.download.length, 0);

    // 6. Valid manifest but ZIP fails checksum natively during download -> error without next()
    const badZipMock = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' },
      rejectDownloadChecksum: true
    });
    const checksumMismatchRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater: badZipMock.updater,
      appPlugin: badZipMock.appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => signManifest({
          webVersion: '2.5.0',
          minNativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.5.0/b.zip',
          sha256: 'f'.repeat(64)
        })
      })
    });
    assert.equal(checksumMismatchRes.status, 'error');
    assert.match(checksumMismatchRes.error, /Checksum mismatch/i);
    assert.equal(badZipMock.calls.next.length, 0);
  } finally {
    restoreEnv();
  }
});

test('Automatic OTA prevents duplicate downloads of already staged bundles, ignores interrupted downloads, and rejects retrying rolled-back/failed bundles', async () => {
  const restoreEnv = withMockBrowserEnv(true);
  try {
    const { publicJwk, signManifest } = createSignedManifestHelper();

    // 1. Already locally downloaded ('pending') in updater.list() -> reuse staged bundle without re-downloading or calling next()
    const existingMock = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' },
      bundles: [{ id: 'bundle_cached_2_4_7', version: '2.4.7', status: 'pending' }]
    });
    const manifest247 = signManifest({
      webVersion: '2.4.7',
      minNativeVersionCode: 1,
      bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.7/b.zip',
      sha256: '1'.repeat(64)
    });
    const dedupedRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater: existingMock.updater,
      appPlugin: existingMock.appPlugin,
      force: true,
      fetchImpl: async () => ({ ok: true, json: async () => manifest247 })
    });
    assert.equal(dedupedRes.status, 'ready_to_install');
    assert.equal(dedupedRes.stagedBundleId, 'bundle_cached_2_4_7');
    assert.equal(dedupedRes.deduplicated, true);
    assert.equal(existingMock.calls.download.length, 0);
    assert.equal(existingMock.calls.next.length, 0);

    // 1b. Interrupted download ('downloading' status in list()) MUST NOT be treated as ready; triggers clean download
    const interruptedMock = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' },
      bundles: [{ id: 'partial_2_4_7', version: '2.4.7', status: 'downloading' }],
      downloadBundleId: 'clean_2_4_7'
    });
    const recoveredRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater: interruptedMock.updater,
      appPlugin: interruptedMock.appPlugin,
      force: true,
      fetchImpl: async () => ({ ok: true, json: async () => manifest247 })
    });
    assert.equal(recoveredRes.status, 'ready_to_install');
    assert.equal(recoveredRes.stagedBundleId, 'clean_2_4_7');
    assert.equal(interruptedMock.calls.download.length, 1);

    // 2. Rollback happened on v2.4.8 (reported via native getFailedUpdate during notifyAppReady) -> v2.4.8 must never be retried
    const rolledBackMock = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' },
      failedUpdate: { bundle: { id: 'broken_2_4_8', version: '2.4.8', status: 'error' } }
    });
    const readyRes = await markAppBundleReady({ isNative: true, updater: rolledBackMock.updater });
    assert.equal(rolledBackMock.calls.notifyAppReady, 1);
    assert.equal(readyRes.rolledBackBundle.version, '2.4.8');
    assert.ok(readPersistedUpdateState().failedVersions.includes('2.4.8'));

    const retryFailedRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater: rolledBackMock.updater,
      appPlugin: rolledBackMock.appPlugin,
      force: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => signManifest({
          webVersion: '2.4.8',
          minNativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.8/b.zip',
          sha256: '2'.repeat(64)
        })
      })
    });
    assert.equal(retryFailedRes.status, 'error');
    assert.equal(retryFailedRes.blockedFailedVersion, '2.4.8');
    assert.equal(rolledBackMock.calls.download.length, 0);
  } finally {
    restoreEnv();
  }
});

test('Automatic OTA respects incompatible minNativeVersionCode, offline resilience, GitHub HTTP failures, and 15-minute foreground throttling', async () => {
  const restoreEnv = withMockBrowserEnv(false);
  try {
    const { publicJwk, signManifest } = createSignedManifestHelper();
    const { updater, appPlugin, calls } = createMockUpdater({
      currentBundle: { id: 'builtin', version: '2.4.5', status: 'success' }
    });

    // 1. Offline skip without disrupting state
    const offlineRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin
    });
    assert.equal(offlineRes.status, 'offline');
    assert.equal(calls.download.length, 0);

    // Go online and verify 15-min foreground throttling
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    let clock = 1_000_000;
    let fetchCount = 0;

    // 2. GitHub 503 outage -> non-blocking error status, records attempt timestamp
    const outageRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      now: () => clock,
      fetchImpl: async () => {
        fetchCount += 1;
        return { ok: false, status: 503 };
      }
    });
    assert.equal(outageRes.status, 'error');
    assert.equal(fetchCount, 1);

    // 3. Foreground resume 5 minutes later -> throttled cleanly (0 extra fetches)
    clock += 5 * 60 * 1000;
    const throttledRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      now: () => clock,
      fetchImpl: async () => {
        fetchCount += 1;
        return { ok: true, json: async () => ({}) };
      }
    });
    assert.equal(throttledRes.throttled, true);
    assert.equal(fetchCount, 1);

    // 4. Advance past 15-minute cooldown -> check runs and catches native_update_required without downloading OTA zip
    clock += AUTO_UPDATE_COOLDOWN_MS + 1000;
    const nativeReqRes = await checkForAppUpdates({
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin,
      now: () => clock,
      fetchImpl: async () => {
        fetchCount += 1;
        return {
          ok: true,
          json: async () => signManifest({
            webVersion: '2.6.0',
            minNativeVersionCode: 99,
            nativeVersionCode: 99,
            bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.6.0/b.zip',
            apkUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.6.0/pocketnook.apk',
            sha256: 'b'.repeat(64)
          })
        };
      }
    });
    assert.equal(fetchCount, 2);
    assert.equal(nativeReqRes.status, 'native_update_required');
    assert.equal(nativeReqRes.minNativeVersionCode, 99);
    assert.equal(calls.download.length, 0);

    // Ensure downloadAndStageAppUpdate also respects native compatibility if called directly
    const directNativeBlock = await downloadAndStageAppUpdate({
      manifest: signManifest({
        webVersion: '2.6.0',
        minNativeVersionCode: 99,
        bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.6.0/b.zip',
        sha256: 'b'.repeat(64)
      }),
      publicKeyJwk: publicJwk,
      isNative: true,
      updater,
      appPlugin
    });
    assert.equal(directNativeBlock.status, 'native_update_required');
    assert.equal(calls.download.length, 0);
  } finally {
    restoreEnv();
  }
});

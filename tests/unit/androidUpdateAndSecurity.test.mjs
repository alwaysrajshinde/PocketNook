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
  verifyManifestSignature
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
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });

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

    // Tamper bundleUrl -> cryptographic verification must fail
    const tamperedUrl = { ...manifest, bundleUrl: 'https://github.com/evil/repo/releases/download/v2.4.6/pwn.zip' };
    assert.equal((await verifyManifestSignature(tamperedUrl, publicJwk)).valid, false);

    // Tamper sha256 -> cryptographic verification must fail
    const tamperedHash = { ...manifest, sha256: 'a'.repeat(64) };
    assert.equal((await verifyManifestSignature(tamperedHash, publicJwk)).valid, false);

    // Missing signature when publicKey is present -> fail closed
    const unsigned = { ...manifest, signature: '' };
    assert.equal((await verifyManifestSignature(unsigned, publicJwk)).valid, false);

    // Missing publicKey -> fail closed (never allow unkeyed bypass)
    assert.equal((await verifyManifestSignature(manifest, null)).valid, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('checkForAppUpdates enforces offline skip, untrusted origin block, fail-closed signature check, tampered manifest rejection, and native compatibility gate', async () => {
  globalThis.window = globalThis;
  globalThis.localStorage = createMemoryStorage();
  globalThis.sessionStorage = createMemoryStorage();

  const { checkForAppUpdates, buildCanonicalManifestPayload } = await import('../../client/src/services/appUpdateService.js');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = publicKey.export({ format: 'jwk' });
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

  // 1. Offline graceful skip
  const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: false }
  });
  try {
    const offlineRes = await checkForAppUpdates({
      manifestUrl: 'https://alwaysrajshinde.github.io/PocketNook/update-manifest.json',
      publicKeyJwk: publicJwk
    });
    assert.equal(offlineRes.status, 'offline');
  } finally {
    if (origNav) Object.defineProperty(globalThis, 'navigator', origNav);
    else delete globalThis.navigator;
  }

  // 2. Online untrusted manifest origin is blocked
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true }
  });
  try {
    const untrustedRes = await checkForAppUpdates({
      manifestUrl: 'https://evil.example.com/update-manifest.json',
      publicKeyJwk: publicJwk
    });
    assert.equal(untrustedRes.status, 'error');
    assert.match(untrustedRes.error, /Untrusted manifest URL/i);

    // 3. Unsigned manifest is rejected (fail closed)
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        webVersion: '2.5.0',
        minNativeVersionCode: 1,
        bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.5.0/pocketnook-web-v2.5.0.zip',
        sha256: 'a'.repeat(64)
      })
    });
    try {
      const unsignedRes = await checkForAppUpdates({
        manifestUrl: 'https://alwaysrajshinde.github.io/PocketNook/update-manifest.json',
        publicKeyJwk: publicJwk
      });
      assert.equal(unsignedRes.status, 'error');
      assert.match(unsignedRes.error, /signature is missing/i);
    } finally {
      globalThis.fetch = origFetch;
    }

    // 4. Signed manifest requiring newer native APK triggers native_update_required safely
    globalThis.fetch = async () => ({
      ok: true,
      json: async () =>
        signManifest({
          webVersion: '2.5.0',
          minNativeVersionCode: 99,
          nativeVersionCode: 99,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.5.0/pocketnook-web-v2.5.0.zip',
          apkUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.5.0/pocketnook-v2.5.0.apk',
          sha256: 'b'.repeat(64)
        })
    });
    try {
      const nativeGateRes = await checkForAppUpdates({
        manifestUrl: 'https://alwaysrajshinde.github.io/PocketNook/update-manifest.json',
        publicKeyJwk: publicJwk
      });
      assert.equal(nativeGateRes.status, 'native_update_required');
      assert.equal(nativeGateRes.minNativeVersionCode, 99);
    } finally {
      globalThis.fetch = origFetch;
    }

    // 5. Compatible signed manifest returns user-controlled update_available with releaseNotes & pendingManifest
    globalThis.fetch = async () => ({
      ok: true,
      json: async () =>
        signManifest({
          webVersion: '2.4.6',
          minNativeVersionCode: 1,
          nativeVersionCode: 1,
          bundleUrl: 'https://github.com/alwaysrajshinde/PocketNook/releases/download/v2.4.6/pocketnook-web-v2.4.6.zip',
          sha256: 'd'.repeat(64),
          releaseNotes: 'Speed Chips and Android safe area fix.'
        })
    });
    try {
      const availRes = await checkForAppUpdates({
        manifestUrl: 'https://raw.githubusercontent.com/alwaysrajshinde/PocketNook/ota-manifest/update-manifest.json',
        publicKeyJwk: publicJwk
      });
      assert.equal(availRes.status, 'update_available');
      assert.equal(availRes.latestVersion, '2.4.6');
      assert.equal(availRes.releaseNotes, 'Speed Chips and Android safe area fix.');
      assert.ok(availRes.pendingManifest);
    } finally {
      globalThis.fetch = origFetch;
    }

    // 6. Tampered bundleUrl domain fails closed
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        webVersion: '2.4.6',
        minNativeVersionCode: 1,
        bundleUrl: 'https://evil.example.com/pwn.zip',
        sha256: 'c'.repeat(64),
        signature: 'invalid'
      })
    });
    try {
      const badBundleRes = await checkForAppUpdates({
        manifestUrl: 'https://alwaysrajshinde.github.io/PocketNook/update-manifest.json',
        publicKeyJwk: publicJwk
      });
      assert.equal(badBundleRes.status, 'error');
      assert.match(badBundleRes.error, /trusted HTTPS origin/i);
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    if (origNav) Object.defineProperty(globalThis, 'navigator', origNav);
    else delete globalThis.navigator;
  }
});

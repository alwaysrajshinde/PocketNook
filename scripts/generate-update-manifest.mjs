/**
 * generate-update-manifest.mjs
 * Generates a cryptographically verifiable update-manifest.json and SHA-256 digest
 * for a zipped Vite web bundle (`pocketnook-web-vX.Y.Z.zip`).
 *
 * Zero-cost infrastructure: runs in GitHub Actions or locally during release prep.
 * Private ECDSA P-256 key (`UPDATE_SIGNING_PRIVATE_KEY_PEM`) stays ONLY in GitHub Secrets.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      args[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function normalizeSemver(v = '0.0.0') {
  return String(v || '0.0.0').trim().replace(/^v/i, '').split('-')[0];
}

function run() {
  const args = parseArgs(process.argv);
  const zipPath = args.zip;
  const webVersion = normalizeSemver(args.version);
  const minNativeVersionCode = Number(args.minNativeCode || 1);
  const nativeVersionCode = Number(args.nativeCode || minNativeVersionCode);
  const bundleUrl = args.bundleUrl;
  const apkUrl = args.apkUrl || 'https://github.com/alwaysrajshinde/PocketNook/releases/latest';
  const outPath = args.out || path.resolve(process.cwd(), 'update-manifest.json');
  const releaseNotes = args.notes || 'Bug fixes and performance improvements.';

  if (!zipPath || !fs.existsSync(zipPath)) {
    throw new Error(`Missing --zip bundle file: ${zipPath}`);
  }
  if (!bundleUrl || !bundleUrl.startsWith('https://')) {
    throw new Error(`--bundleUrl must be a valid HTTPS URL (got: ${bundleUrl})`);
  }

  const zipBytes = fs.readFileSync(zipPath);
  const sha256 = crypto.createHash('sha256').update(zipBytes).digest('hex').toLowerCase();

  const canonicalPayload = [
    webVersion,
    String(minNativeVersionCode),
    String(nativeVersionCode),
    sha256,
    bundleUrl
  ].join('|');

  let signature = '';
  const privateKeyPem = process.env.UPDATE_SIGNING_PRIVATE_KEY_PEM;
  if (privateKeyPem) {
    // Use IEEE P1363 encoding so browser/WebView WebCrypto subtle.verify() verifies natively
    const sigBuf = crypto.sign('sha256', Buffer.from(canonicalPayload, 'utf8'), {
      key: privateKeyPem,
      dsaEncoding: 'ieee-p1363'
    });
    signature = sigBuf.toString('base64');
  }

  const manifest = {
    schemaVersion: 1,
    webVersion,
    minNativeVersionCode,
    nativeVersionCode,
    bundleUrl,
    sha256,
    sizeBytes: zipBytes.length,
    apkUrl,
    releaseNotes,
    publishedAt: new Date().toISOString(),
    signatureAlgorithm: signature ? 'ECDSA-P256-SHA256-P1363' : 'SHA256-ONLY',
    signature
  };

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[Manifest] Generated ${outPath} for v${webVersion} (sha256=${sha256}, signed=${Boolean(signature)})`);
}

run();

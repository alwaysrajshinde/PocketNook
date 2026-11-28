/**
 * generate-update-keys.mjs
 * Generates an ECDSA P-256 keypair for signing PocketNook live web update manifests.
 *
 * Security usage (recommended — never exposes private key to stdout or logs):
 *   node scripts/generate-update-keys.mjs --private-out "C:\Users\hi\pocketnook-ota-private.pem"
 *
 * Put the PEM file contents into GitHub Secret: UPDATE_SIGNING_PRIVATE_KEY_PEM
 * Put the printed Public JWK into client app / GitHub Variable: VITE_UPDATE_PUBLIC_KEY_JWK
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

const privateOut = getArgValue('--private-out');
const publicOut = getArgValue('--public-out');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1'
});

const publicJwk = publicKey.export({ format: 'jwk' });
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });

if (publicOut) {
  const absPub = path.resolve(publicOut);
  fs.mkdirSync(path.dirname(absPub), { recursive: true });
  fs.writeFileSync(absPub, JSON.stringify(publicJwk, null, 2) + '\n', 'utf8');
}

console.log('=== PUBLIC KEY JWK (Safe to embed / store in VITE_UPDATE_PUBLIC_KEY_JWK) ===');
console.log(JSON.stringify(publicJwk));

if (privateOut) {
  const absPriv = path.resolve(privateOut);
  fs.mkdirSync(path.dirname(absPriv), { recursive: true });
  fs.writeFileSync(absPriv, privatePem, { encoding: 'utf8', mode: 0o600 });
  console.log(`\n=== PRIVATE KEY SAVED SECURELY TO FILE (NOT LOGGED): ${absPriv} ===`);
  console.log('Store the exact contents of that file in GitHub Secret: UPDATE_SIGNING_PRIVATE_KEY_PEM');
} else {
  console.log('\n=== STORE IN GITHUB REPO SECRET: UPDATE_SIGNING_PRIVATE_KEY_PEM ===');
  console.log(privatePem);
}

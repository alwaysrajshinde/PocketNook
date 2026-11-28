# PocketNook Android Conversion & Zero-Cost Live Auto-Update Guide

**Source Branch:** `android-prod` (branched cleanly from `origin/main` at `a5934d1` — **PROD only**, zero experimental QA/AI/Chatbox code)  
**Verified Base Version:** `2.4.5` (`versionName: "2.4.5"`, `versionCode` managed cleanly in CI)  
**Android Package ID:** `com.pocketnook.app`  
**App Name:** `PocketNook`

---

## 1. Capacitor Android Architecture & Audit Fixes Included

- **Native Shell (`client/capacitor.config.json`, `client/android/`):**
  - Capacitor v8 (`@capacitor/core`, `@capacitor/android`) running React `19.3.1` + Vite `8.3.6` on `https://localhost`.
  - Generated 87 Android adaptive icons & dark/light splash screen assets from `client/public/icon-512.png`.
  - Minimal permissions in `AndroidManifest.xml`: `INTERNET` and `ACCESS_NETWORK_STATE` only (`android:allowBackup="false"`, `android:usesCleartextTraffic="false"`).
- **Mandatory Phase 2 Audit Fixes Applied:**
  1. **Service Worker Guard (`client/src/main.jsx`):** Skips SW registration and unregisters any active SW when `Capacitor.isNativePlatform()` is true, preventing stale PWA caches from overriding live OTA web bundles while keeping the Web PWA offline service worker intact.
  2. **Native Google Sign-In & Sheets Scope Support (`AuthContext.jsx`, `googleSheetsService.js`, `MainActivity.java`):** Bridges Google Credential Manager via `@capgo/capacitor-social-login` on Android (`idToken` -> Firebase `signInWithCredential`) and forwards custom scope activity results via `ModifiedMainActivityForSocialLoginPlugin`. Web popup auth remains untouched.
  3. **Cross-User Isolation (`googleSheetsService.js`, `AuthContext.jsx`, `App.jsx`):** Removed global `localStorage` key scan in `getSavedSheetConfig(userId)`, cleared `et_gsheets_token_*` tokens on logout/account switch, cleared Android Google Auth session cache, and wiped React in-memory financial state on `expense_tracker_logout`.
  4. **Android File Exports & Client Backup Restore (`exportService.js`, `Settings.jsx`, `api.js`):** Fixed empty `Settings.jsx` exports by wiring real transaction retrieval; implemented native Android Share/Save sheet via `@capacitor/filesystem` + `@capacitor/share` (`Directory.Cache`, zero dangerous storage permissions); implemented schema-validated client-side JSON backup restore for standalone APK use.
  5. **Android Lifecycle, Hardware Back & Sync (`App.jsx`, `syncService.js`, `SyncProgressIndicator.jsx`):** Added hardware back-button modal/tab unwinding and double-tap exit on Home; wired `@capacitor/network` + `appStateChange` resume sync; aligned `status === 'failed'` retry indicator; fixed missing `rajHistoricalData` import in `api.js` and made Firestore `addTransaction` idempotent on `data.id`.

---

## 2. Live Web-Layer Automatic Update Architecture (₹0 Cost)

Uses **`@capgo/capacitor-updater` v8** strictly in **self-hosted `manual` mode** (`autoUpdate: false`, `statsUrl: ""` — **zero Capgo Cloud account or paid subscription**).

### How Updates Work
1. **Free Hosting Split:**
   - **Signed Manifest (`update-manifest.json`):** Hosted over permanent public HTTPS with CORS `*` on the dedicated `ota-manifest` branch (`https://raw.githubusercontent.com/alwaysrajshinde/PocketNook/ota-manifest/update-manifest.json`) — or optionally GitHub Pages (`https://alwaysrajshinde.github.io/PocketNook/update-manifest.json`).
   - **Versioned Web ZIP Bundles (`pocketnook-web-vX.Y.Z.zip`):** Hosted on GitHub Releases (`https://github.com/alwaysrajshinde/PocketNook/releases/download/vX.Y.Z/pocketnook-web-vX.Y.Z.zip`).
2. **Five Security & Compatibility Gates (`client/src/services/appUpdateService.js`):**
   - **HTTPS Allowlist:** Rejects non-HTTPS URLs and any origin outside GitHub Pages / GitHub Releases.
   - **ECDSA P-256 Signature (`crypto.subtle.verify`):** Verifies signature over `webVersion|minNativeVersionCode|nativeVersionCode|sha256|bundleUrl` using the public JWK (`VITE_UPDATE_PUBLIC_KEY_JWK`); private key stays strictly in GitHub Secrets.
   - **Native Binary Compatibility Gate (`minNativeVersionCode`):** If the release bumps `minNativeVersionCode` above the APK's installed `versionCode`, OTA ZIP download is skipped and an in-app **Native APK Update Available** banner directs the user to GitHub Releases.
   - **Native SHA-256 Archive Verification (`CapgoUpdater.download`):** Native Android verifies the exact 64-char hex SHA-256 checksum of the downloaded ZIP before keeping the bundle.
   - **Automatic Boot Rollback (`markAppBundleReady`):** Calls `CapacitorUpdater.notifyAppReady()` after React mounts. If a faulty bundle crashes or hangs past `appReadyTimeout` (10s), native Android automatically rolls back to the previous working bundle without wiping Firebase Auth (`IndexedDB`) or offline pending transactions (`localStorage`).

---

## 3. One-Time Setup Before Your First Signed APK CI Build

### Step A: Generate Release Keystore & Extract SHA-1 (Local Terminal — NEVER commit `.jks`)
```bash
keytool -genkeypair -v -keystore pocketnook-release.jks -alias pocketnook -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore pocketnook-release.jks -alias pocketnook
# Encode Base64 for GitHub Secret (Windows PowerShell):
[Convert]::ToBase64String([IO.File]::ReadAllBytes("pocketnook-release.jks")) | Set-Clipboard
```

### Step B: Live Update Signing Keys (ECDSA P-256)
Your ECDSA P-256 keypair is pre-configured cleanly:
- **Public Key (`DEFAULT_PUBLIC_KEY_JWK`):** Already embedded in [`client/src/services/appUpdateService.js`](../client/src/services/appUpdateService.js) (fail-closed verification). You can optionally override/rotate it via GitHub Variable `VITE_UPDATE_PUBLIC_KEY_JWK`.
- **Private Key (`UPDATE_SIGNING_PRIVATE_KEY_PEM`):** Saved securely outside the repository at `C:\Users\hi\pocketnook-ota-private.pem`. Copy it directly to GitHub Secret `UPDATE_SIGNING_PRIVATE_KEY_PEM` (e.g. `Get-Content "C:\Users\hi\pocketnook-ota-private.pem" -Raw | Set-Clipboard`).
- To rotate keys in the future without logging secrets:
  `node scripts/generate-update-keys.mjs --private-out "C:\Users\hi\pocketnook-ota-private.pem"`

### Step C: Register Android SHA-1 / SHA-256 + Web Client ID in Firebase & Google Cloud
1. **Extract SHA-1 & SHA-256 from your existing keystore (`C:\Users\hi\pocketnook-release.jks`)** on your own terminal:
   ```powershell
   keytool -list -v -keystore "C:\Users\hi\pocketnook-release.jks" -alias pocketnook
   ```
   Copy the **SHA1** and **SHA256** lines shown under `Certificate fingerprints`.
2. **Firebase Console (`expense-tracker-d98cd`):**
   - Open Firebase Console -> select your project -> click **Project Settings** (gear icon) -> scroll to **Your apps** -> click **Add app** -> **Android**.
   - **Android package name:** `com.pocketnook.app`
   - **App nickname:** `PocketNook Android`
   - **Debug / Release signing certificate SHA-1:** paste your release **SHA-1**. Click **Register app**, then in the Android app settings click **Add fingerprint** and also add your **SHA-256**.
   - Go to **Authentication -> Sign-in method -> Google -> Web SDK configuration** and copy the **Web client ID** (`...apps.googleusercontent.com`).
3. **Google Cloud Console (Project `506613300270`):**
   - Open **APIs & Services -> Credentials**.
   - Confirm an **Android OAuth 2.0 Client ID** exists for `com.pocketnook.app` + your release **SHA-1** (Firebase Console normally creates this automatically when you register SHA-1).
   - Confirm the **Web application OAuth 2.0 Client ID** matches the ID copied in Step C.2, and save it in GitHub Secret/Variable **`VITE_GOOGLE_CLIENT_ID`**.

### Step D: Configure GitHub Repository Secrets & Variables (`Settings -> Secrets and variables -> Actions`)
| Name | Kind | Where to get it |
| :--- | :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | Secret | Your clipboard / `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\hi\pocketnook-release.jks")) \| Set-Clipboard` |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Password you chose for `pocketnook-release.jks` |
| `ANDROID_KEY_ALIAS` | Secret | `pocketnook` |
| `ANDROID_KEY_PASSWORD` | Secret | Key password you chose for alias `pocketnook` |
| `UPDATE_SIGNING_PRIVATE_KEY_PEM` | Secret | Exact contents of `C:\Users\hi\pocketnook-ota-private.pem` (`Get-Content "C:\Users\hi\pocketnook-ota-private.pem" -Raw \| Set-Clipboard`) |
| `VITE_GOOGLE_CLIENT_ID` | Variable or Secret | Web client ID (`...apps.googleusercontent.com`) from Firebase Authentication -> Google -> Web SDK configuration |
| `VITE_UPDATE_PUBLIC_KEY_JWK` | Variable (optional) | Only needed if rotating the embedded public key in `appUpdateService.js` |
| `VITE_UPDATE_MANIFEST_URL` | Variable (optional) | Defaults to `https://alwaysrajshinde.github.io/PocketNook/update-manifest.json` |

---

## 4. Future Release Workflow: Web OTA Update vs New APK

- **Web-Only Update (UI, bug fixes, React/JS/CSS changes — users do NOT reinstall APK):**
  1. Bump version in `client/package.json` & root `package.json` (e.g. `2.4.6`).
  2. Trigger **GitHub Actions -> `PocketNook Android Release & OTA Bundle CI`** on `android-prod` with `min_native_version_code` unchanged (`1`), `build_apk: false`, and **`publish_ota: true`**.
  3. GitHub Actions automatically creates/updates GitHub Release `v2.4.6` with `pocketnook-web-v2.4.6.zip` and pushes the signed `update-manifest.json` to branch `ota-manifest`.
  4. In the Android app, users tap **More / Settings -> App Updates -> Check for Updates -> Update Now -> Restart App to Apply** (no APK reinstall needed!).

- **Native Android Update Required (new APK must be installed):**
  Required whenever adding/updating **Capacitor plugins, `AndroidManifest.xml` permissions, Java/Kotlin `MainActivity`, Gradle SDK/AGP versions, or app icons/package ID**:
  1. Increment `min_native_version_code` input to match the new CI `versionCode`.
  2. Run workflow with `build_apk: true`.
  3. Publish `PocketNook-vX.Y.Z-release.apk` + `update-manifest.json`. Existing APKs detect `native_update_required` and prompt the user to download/approve the new signed APK cleanly.

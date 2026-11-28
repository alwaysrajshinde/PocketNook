// @ts-check
const { test, expect } = require('../fixtures/auth.fixture');
const { cleanTestUsers } = require('../helpers/dbHelper');

test.describe('Area 35 (Android Conversion): Exports, Offline Sync, Account Isolation & Update Manifest Safety', () => {
  test.beforeAll(() => {
    cleanTestUsers();
  });

  test.afterAll(() => {
    cleanTestUsers();
  });

  async function dismissOverlays(page) {
    for (let i = 0; i < 2; i++) {
      const btn = page.locator('[data-testid="welcome-greeting-overlay"], button:has-text("Let\'s Dive In"), [data-testid="onboarding-tour-close-btn"]').first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
      }
    }
  }

  test('35.1: PROD build has zero QA AI/Chatbox UI and keeps clean navigation + mobile bottom bar', async ({ page, authHelpers }) => {
    await authHelpers.loginAsRaj();
    await dismissOverlays(page);

    // Ensure no QA/Chatbox triggers exist in clean PROD
    await expect(page.locator('[data-testid="floating-whatsapp-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="android-open-whatsapp-btn"]')).toHaveCount(0);

    // Bottom navigation on mobile / Sidebar on desktop works cleanly
    const vp = page.viewportSize();
    if (vp && vp.width < 1024) {
      await expect(page.locator('nav button:has-text("Home")')).toBeVisible();
      await expect(page.locator('nav button:has-text("Transactions")')).toBeVisible();
      await expect(page.locator('nav button:has-text("Reports")')).toBeVisible();
      await expect(page.locator('nav button:has-text("More")')).toBeVisible();
    }
  });

  test('35.2: Settings Excel & JSON exports use real transaction data (not empty fallback) and client JSON restore validates input', async ({ page, authHelpers }) => {
    await authHelpers.loginAsRaj();
    await dismissOverlays(page);

    // Create one real transaction first so Settings export has data
    const addBtn = page.locator('button[aria-label="Quick Add Expense"], button:has-text("Add Expense")').first();
    await addBtn.click();
    await page.locator('.fixed input[placeholder="0"]').fill('345');
    await page.locator('.fixed input[placeholder*="Grocery"], .fixed input[placeholder*="Lunch"], .fixed input[placeholder*="Coffee"], .fixed input[name="description"]').first().fill('Android Parity Lunch');
    await page.locator('.fixed button[type="submit"]').first().click();
    await expect(page.locator('h2:has-text("Add Expense")')).not.toBeVisible({ timeout: 5000 });

    // Navigate to Settings -> Data & Backup
    const moreBtn = page.locator('nav button:has-text("More"), button:has-text("Backup & Restore")').first();
    await moreBtn.click();
    await page.waitForTimeout(300);

    const dataRow = page.locator('button:has-text("Data, Import & Export"), button:has-text("Backup & Restore"), button:has-text("Excel (.xlsx)")').first();
    if (await dataRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dataRow.click();
      await page.waitForTimeout(250);
    }

    // Intercept Excel export download cleanly (ensures handleExportExcel passes real expenses)
    const excelBtn = page.locator('button:has-text("Excel (.xlsx)"), button:has-text("Export Excel")').first();
    if (await excelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [xlsxDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        excelBtn.click()
      ]);
      expect(xlsxDownload.suggestedFilename().toLowerCase()).toContain('.xlsx');
    }

    // Intercept JSON export download and inspect exact exported JSON contents (must include Android Parity Lunch)
    const jsonBtn = page.locator('button:has-text("Full JSON Data Backup"), button:has-text("JSON Backup")').first();
    if (await jsonBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        jsonBtn.click()
      ]);
      const dlPath = await download.path();
      if (dlPath) {
        const fs = require('fs');
        const content = fs.readFileSync(dlPath, 'utf8');
        expect(content).toContain('Android Parity Lunch');
        expect(content).toContain('345');

        // Verify Restore Data validates invalid JSON safely and accepts real exported backup JSON
        const fileInput = page.locator('input[type="file"][accept=".json"]').first();
        if (await fileInput.count() > 0) {
          const os = require('os');
          const path = require('path');
          const badFile = path.join(os.tmpdir(), 'pn-bad-backup.json');
          fs.writeFileSync(badFile, JSON.stringify({ hello: 'invalid' }), 'utf8');
          await fileInput.setInputFiles(badFile);
          await page.locator('button:has-text("Restore Data")').first().click();
          await expect(page.locator('text=/Backup file must contain a valid|Invalid backup|missing transactions/i').first()).toBeVisible({ timeout: 5000 });
          fs.rmSync(badFile, { force: true });

          await fileInput.setInputFiles(dlPath);
          await page.locator('button:has-text("Restore Data")').first().click();
          await expect(page.locator('text=/Successfully restored/i').first()).toBeVisible({ timeout: 8000 });
        }
      }
    }
  });

  test('35.3: Account switching / logout wipes Google Sheets tokens and isolates saved sheet metadata', async ({ page, authHelpers }) => {
    await authHelpers.loginAsRaj();
    await dismissOverlays(page);

    // Simulate cached Google Sheets config + session token for Account A
    await page.evaluate(() => {
      localStorage.setItem('et_gsheets_config_userA', JSON.stringify({ spreadsheetId: 'secret_sheet_a', title: 'Secret Sheet A' }));
      sessionStorage.setItem('et_gsheets_token_userA', JSON.stringify({ access_token: 'secret_tok_a', expires_at: Date.now() + 999999 }));
    });

    // Verify Google Sheets modal does NOT leak userA's spreadsheet to logged-in user (strict userId isolation)
    const moreBtn = page.locator('nav button:has-text("More"), button:has-text("Export to Google Sheets")').first();
    if (await moreBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(250);
    }
    const sheetsBtn = page.locator('button:has-text("Export to Google Sheets"), button:has-text("Google Sheets")').first();
    if (await sheetsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sheetsBtn.click();
      await expect(page.locator('text=Secret Sheet A')).toHaveCount(0);
      await page.locator('button[aria-label="Close Modal"]').first().click();
      await page.waitForTimeout(250);
    }

    // Trigger real UI logout ("Log Out" in sidebar or "Log Out of PocketNook" in mobile More Settings)
    let logoutBtn = page.locator('button:has-text("Log Out")').first();
    if (!(await logoutBtn.isVisible({ timeout: 2500 }).catch(() => false))) {
      await page.locator('nav button:has-text("More")').first().click().catch(() => {});
      await page.waitForTimeout(250);
      logoutBtn = page.locator('button:has-text("Log Out")').first();
    }
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await page.waitForTimeout(500);

    // Verify Account A session token was wiped on logout
    const leakedToken = await page.evaluate(() => sessionStorage.getItem('et_gsheets_token_userA'));
    expect(leakedToken).toBeNull();
  });

  test('35.4: Offline expense creation queues safely and syncs cleanly on reconnect', async ({ page, context, authHelpers }) => {
    await authHelpers.loginAsRaj();
    await dismissOverlays(page);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('text=/Offline Mode/i').first()).toBeVisible({ timeout: 5000 });

    const addBtn = page.locator('button[aria-label="Quick Add Expense"], button:has-text("Add Expense")').first();
    await addBtn.click();
    await page.locator('.fixed input[placeholder="0"]').fill('189');
    await page.locator('.fixed input[placeholder*="Grocery"], .fixed input[placeholder*="Lunch"], .fixed input[placeholder*="Coffee"], .fixed input[name="description"]').first().fill('Offline Metro Ticket');
    await page.locator('.fixed button[type="submit"]').first().click();
    await expect(page.locator('h2:has-text("Add Expense")')).not.toBeVisible({ timeout: 5000 });

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1200);

    await page.locator('nav button:has-text("Transactions"), button:has-text("Transactions")').first().click();
    const searchInput = page.locator('input[placeholder*="Search by description"]').first();
    if (await searchInput.isVisible({ timeout: 2500 }).catch(() => false)) {
      await searchInput.fill('Offline Metro Ticket');
      await page.waitForTimeout(250);
    }
    await expect(page.locator('text=Offline Metro Ticket').first()).toBeVisible({ timeout: 6000 });
  });

  test('35.5: Install / App Updates UI, Add Expense keyboard non-autofocus, and Speed Chips migration work seamlessly', async ({ page, authHelpers }) => {
    await authHelpers.loginAsRaj();
    await dismissOverlays(page);

    // 1. Speed Chips migrated from QA works on both Mobile & Desktop Home
    const speedStrip = page.locator('[data-testid="speed-chips-strip"]');
    await expect(speedStrip).toBeVisible({ timeout: 5000 });
    const chaiChip = page.locator('[data-testid="speed-chip-sc_chai"]');
    await expect(chaiChip).toBeVisible();
    await chaiChip.click();
    await expect(page.locator('text=/Logged.*Chai/i').first()).toBeVisible({ timeout: 5000 });

    // Create custom speed chip
    await page.locator('[data-testid="toggle-add-speed-chip"]').click();
    await page.locator('input[placeholder="e.g. Metro"]').fill('Cold Coffee');
    await page.locator('input[placeholder="40"]').fill('95');
    await page.locator('[data-testid="save-speed-chip-btn"]').click();
    await expect(page.locator('text=Cold Coffee').first()).toBeVisible({ timeout: 4000 });

    // 2. Add Expense & Income modal must NOT autofocus inputs on mount (prevents auto-opening Android keyboard)
    const addBtn = page.locator('button[aria-label="Quick Add Expense"], button:has-text("Add Expense")').first();
    await addBtn.click();
    await expect(page.locator('h2:has-text("Add Expense")')).toBeVisible({ timeout: 4000 });
    const focusedTagExpense = await page.evaluate(() => document.activeElement?.tagName || 'BODY');
    expect(['INPUT', 'TEXTAREA']).not.toContain(focusedTagExpense);

    // Switch to Income / Refund and confirm input stays unfocused until user taps
    await page.locator('.fixed button:has-text("Income / Refund")').click();
    const focusedTagIncome = await page.evaluate(() => document.activeElement?.tagName || 'BODY');
    expect(['INPUT', 'TEXTAREA']).not.toContain(focusedTagIncome);

    // Tapping an input explicitly focuses it cleanly
    const amountField = page.locator('.fixed input[placeholder="0"]').first();
    await amountField.click();
    await expect(amountField).toBeFocused();

    await page.locator('button[aria-label="Close modal"]').first().click();
    await expect(page.locator('h2:has-text("Add Income")')).not.toBeVisible({ timeout: 4000 });

    // 3. Global Android status-bar shield stays 0px on web/desktop (no excessive blank top space)
    const shield = page.locator('[data-testid="android-status-bar-shield"]');
    if (await shield.count() > 0) {
      const h = await shield.evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBeLessThanOrEqual(1);
    }

    // 4. Settings -> App Updates section shows installed/OTA version, Check for Updates, and clean error/status handling
    const moreBtn = page.locator('nav button:has-text("More"), button:has-text("More Settings")').first();
    if (await moreBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(250);
    }

    await expect(page.locator('[data-testid="app-updates-panel"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=v2.4.5').first()).toBeVisible({ timeout: 5000 });

    // Mock 404 manifest fetch cleanly and confirm clear error message surfaces when clicking Check for Updates
    await page.route('**/update-manifest.json**', async (route) => {
      await route.fulfill({ status: 404, body: 'Not found' });
    });
    const checkUpdatesBtn = page.locator('[data-testid="settings-check-updates-btn"]').first();
    await expect(checkUpdatesBtn).toBeVisible({ timeout: 4000 });
    await checkUpdatesBtn.click();
    await expect(page.locator('[data-testid="app-update-status-banner"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="app-update-status-banner"]')).toContainText(/HTTP 404|Failed|Manifest check/i);
    await page.unroute('**/update-manifest.json**');

    const openInstallBtn = page.locator('[data-testid="mobile-install-pwa-btn"], [data-testid="desktop-install-pwa-btn"]').first();
    await expect(openInstallBtn).toBeVisible({ timeout: 5000 });
    await openInstallBtn.click();
    await expect(page.locator('[data-testid="install-app-modal"]')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="install-app-modal"]')).not.toBeVisible({ timeout: 4000 });
  });
});

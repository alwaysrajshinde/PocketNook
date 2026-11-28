/**
 * Google Sheets API v4 Integration Service
 * Secure client-side OAuth 2.0 authorization, spreadsheet creation,
 * duplicate-prevented updates, and multi-user scoped metadata storage.
 */

import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { updateSettings } from './firestoreService';
import { isFirebaseConfigured } from '../firebase/config';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_STORAGE_PREFIX = 'et_gsheets_token_';
const CONFIG_STORAGE_PREFIX = 'et_gsheets_config_';

/**
 * Resolves the Google OAuth 2.0 Client ID from Vite environment or runtime configuration
 */
export function getGoogleClientId() {
  if (typeof window !== 'undefined' && window.__TEST_GOOGLE_CLIENT_ID) {
    return window.__TEST_GOOGLE_CLIENT_ID;
  }
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || '506613300270-web-client.apps.googleusercontent.com';
}

/**
 * Retrieves the cached access token for the given user, checking expiration
 */
export function getCachedToken(userId) {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${TOKEN_STORAGE_PREFIX}${userId}`);
    if (raw) {
      const data = JSON.parse(raw);
      // Valid if not expired with a 2-minute safety buffer
      if (data.access_token && data.expires_at > Date.now() + 120000) {
        return data.access_token;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Saves access token to sessionStorage with expiration timestamp
 */
export function saveToken(userId, accessToken, expiresInSeconds = 3599) {
  if (!userId || !accessToken || typeof window === 'undefined') return;
  try {
    const payload = {
      access_token: accessToken,
      expires_at: Date.now() + (expiresInSeconds * 1000)
    };
    sessionStorage.setItem(`${TOKEN_STORAGE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch (e) {}
}

/**
 * Clears cached Google Sheets token (e.g. on revocation or logout)
 */
export function clearToken(userId) {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      sessionStorage.removeItem(`${TOKEN_STORAGE_PREFIX}${userId}`);
    }
  } catch (e) {}
}

/**
 * Clears all cached Google Sheets session tokens across sessionStorage on logout/account switch
 */
export function clearAllTokens() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(TOKEN_STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {}
}

/**
 * Retrieves saved spreadsheet configuration strictly scoped to the authenticated userId
 */
export function getSavedSheetConfig(userId) {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CONFIG_STORAGE_PREFIX}${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

/**
 * Saves spreadsheet metadata to localStorage and Cloud Firestore
 */
export async function saveSheetConfig(userId, config) {
  if (!userId) return;
  try {
    localStorage.setItem(`${CONFIG_STORAGE_PREFIX}${userId}`, JSON.stringify(config));
    if (isFirebaseConfigured) {
      await updateSettings(userId, {
        google_sheets_spreadsheet_id: config.spreadsheetId,
        google_sheets_spreadsheet_url: config.spreadsheetUrl,
        google_sheets_title: config.title,
        google_sheets_last_exported_at: config.lastExportedAt
      });
    }
  } catch (e) {
    console.warn('[GoogleSheetsService] Error saving sheet config:', e);
  }
}

/**
 * Initiates Google OAuth 2.0 Token Flow via Google Identity Services (GIS)
 */
export function requestGoogleSheetsAccess(userId, userEmail) {
  return new Promise((resolve, reject) => {
    // 1. Check for active cached token
    const cached = getCachedToken(userId);
    if (cached) {
      return resolve(cached);
    }

    // 2. Check for offline state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return reject(new Error('Internet connection required to authorize Google Sheets. Please reconnect.'));
    }

    // 3. Automated test hook
    if (typeof window !== 'undefined' && window.__TEST_MOCK_GOOGLE_SHEETS) {
      const mockToken = 'mock-google-sheets-token-' + Date.now();
      saveToken(userId, mockToken);
      return resolve(mockToken);
    }

    // 4. Native Android Capacitor Google OAuth via SocialLogin
    if (Capacitor.isNativePlatform()) {
      const clientId = getGoogleClientId();
      if (!clientId || clientId.includes('-web-client.')) {
        return reject(new Error('Google Web Client ID (VITE_GOOGLE_CLIENT_ID) is required for native Sheets authorization.'));
      }
      SocialLogin.initialize({ google: { webClientId: clientId } })
        .then(() => SocialLogin.login({ provider: 'google', options: { scopes: [SCOPES] } }))
        .then((res) => {
          const token = res?.result?.accessToken?.token || res?.result?.accessToken;
          if (!token) {
            throw new Error('Google Sheets authorization did not return an access token.');
          }
          saveToken(userId, token, 3599);
          resolve(token);
        })
        .catch((err) => {
          reject(new Error(err?.message || 'Native Google Sheets authorization failed.'));
        });
      return;
    }

    // 5. Verify Google Identity Services client script on Web
    if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return reject(new Error('Google Identity Services library is not loaded. Please ensure you are online and refresh the page.'));
    }

    const clientId = getGoogleClientId();
    if (!clientId) {
      return reject(new Error('Google OAuth Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID.'));
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: userEmail || undefined,
        prompt: 'consent',
        callback: (response) => {
          if (response.error) {
            console.error('[GoogleSheetsService] OAuth error:', response);
            if (response.error === 'access_denied') {
              reject(new Error('Google Sheets permission was denied by user.'));
            } else {
              reject(new Error(`Google authorization failed: ${response.error_description || response.error}`));
            }
            return;
          }

          if (response.access_token) {
            const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3599;
            saveToken(userId, response.access_token, expiresIn);
            resolve(response.access_token);
          } else {
            reject(new Error('No access token returned from Google.'));
          }
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Google OAuth prompt was cancelled or closed.'));
        }
      });

      tokenClient.requestAccessToken();
    } catch (err) {
      console.error('[GoogleSheetsService] Failed to initialize token client:', err);
      reject(err);
    }
  });
}

/**
 * Filter transactions based on chosen export option
 */
export function filterTransactionsForExport(transactions = [], option = 'all', options = {}) {
  let list = Array.isArray(transactions) ? [...transactions] : [];

  if (option === 'current_month') {
    const monthKey = options.selectedMonth || new Date().toISOString().slice(0, 7);
    list = list.filter(t => (t.month_key || (t.date ? t.date.slice(0, 7) : '')) === monthKey);
  } else if (option === 'selected_month') {
    const monthKey = options.selectedMonth;
    if (monthKey && monthKey !== 'all') {
      list = list.filter(t => (t.month_key || (t.date ? t.date.slice(0, 7) : '')) === monthKey);
    }
  } else if (option === 'date_range') {
    const { startDate, endDate } = options;
    if (startDate) {
      list = list.filter(t => (t.date || '') >= startDate);
    }
    if (endDate) {
      list = list.filter(t => (t.date || '') <= endDate);
    }
  }

  // Sort by date descending
  list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return list;
}

/**
 * Creates a brand new Google Spreadsheet with Transactions and Monthly Summary sheets
 */
export async function createNewSpreadsheet(token, userName = 'Personal', onProgress) {
  if (onProgress) onProgress('Creating Google Spreadsheet...', 15);

  // Mock test bypass
  if (typeof window !== 'undefined' && window.__TEST_MOCK_GOOGLE_SHEETS) {
    const id = 'mock_sheet_' + Date.now();
    return {
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      title: `PocketNook - Financial Records (${userName})`
    };
  }

  const title = `PocketNook - Financial Records (${userName})`;

  const res = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: title,
        locale: 'en_IN',
        autoRecalc: 'ON_CHANGE'
      },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: 'Transactions',
            gridProperties: { frozenRowCount: 1 }
          }
        },
        {
          properties: {
            sheetId: 1,
            title: 'Monthly Summary',
            gridProperties: { frozenRowCount: 1 }
          }
        }
      ]
    })
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Google Sheets authorization has expired or was revoked. Please authorize again.');
    }
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Failed to create Google Spreadsheet (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    title: data.properties?.title || title
  };
}

/**
 * Fetches existing rows from the Transactions sheet to enable intelligent duplicate prevention & updates
 */
export async function getExistingSheetTransactions(token, spreadsheetId) {
  if (typeof window !== 'undefined' && window.__TEST_MOCK_GOOGLE_SHEETS) {
    return [];
  }

  try {
    const res = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Transactions!A1:H10000`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const json = await res.json();
      return json.values || [];
    }
  } catch (e) {
    console.warn('[GoogleSheetsService] Could not fetch existing values:', e);
  }
  return [];
}

/**
 * Formats and writes transactions to Sheet 1: Transactions
 */
export async function writeTransactionsToSheet(token, spreadsheetId, transactions = [], onProgress) {
  if (onProgress) onProgress('Formatting transaction records...', 40);

  // Headers matching specification + stable Transaction ID
  const headers = [
    'Date',
    'Description',
    'Category',
    'Payment Mode',
    'Amount (₹)',
    'Transaction Type',
    'Month',
    'Transaction ID'
  ];

  // Map transactions to row arrays
  const txRows = transactions.map(t => {
    const amt = parseFloat(t.amount) || 0;
    const isRefund = Boolean(t.is_refund || amt < 0);
    const txType = t.type === 'income' ? 'Income'
      : t.type === 'transfer' ? 'Transfer'
      : isRefund ? 'Refund / Return'
      : 'Expense';

    const monthKey = t.month_key || (t.date ? t.date.slice(0, 7) : '');

    return [
      t.date || '',
      t.description || '',
      t.category || 'Other',
      t.payment_mode || 'UPI',
      amt,
      txType,
      monthKey,
      String(t.id || '')
    ];
  });

  const allValues = [headers, ...txRows];

  if (typeof window !== 'undefined' && window.__TEST_MOCK_GOOGLE_SHEETS) {
    if (onProgress) onProgress('Synchronized transactions sheet!', 70);
    return true;
  }

  // Clear existing values and overwrite cleanly to prevent stale tail rows
  await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Transactions!A1:H10000:clear`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (onProgress) onProgress('Writing records to Google Sheets...', 60);

  const writeRes = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Transactions!A1:H${allValues.length}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: `Transactions!A1:H${allValues.length}`,
      majorDimension: 'ROWS',
      values: allValues
    })
  });

  if (!writeRes.ok) {
    const errJson = await writeRes.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Failed to write transactions to sheet (HTTP ${writeRes.status})`);
  }

  return true;
}

/**
 * Calculates and writes Sheet 2: Monthly Summary
 */
export async function writeMonthlySummaryToSheet(token, spreadsheetId, transactions = [], onProgress) {
  if (onProgress) onProgress('Calculating financial summaries...', 75);

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = {};
  const paymentMap = {};

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += Math.abs(amt);
    } else if (t.is_refund || amt < 0) {
      // Refunds offset expenses
      totalExpenses -= Math.abs(amt);
    } else if (t.type !== 'transfer') {
      totalExpenses += amt;
    }

    // Category breakdown (for expenses)
    if (t.type !== 'income' && t.type !== 'transfer') {
      const cat = t.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + amt;
    }

    // Payment breakdown
    const pm = t.payment_mode || 'Other';
    paymentMap[pm] = (paymentMap[pm] || 0) + amt;
  });

  const netBalance = totalIncome - totalExpenses;
  const txCount = transactions.length;

  const summaryValues = [
    ['Executive Financial Summary', '', '', ''],
    ['Generated At', new Date().toLocaleString('en-IN'), '', ''],
    ['Total Transactions', txCount, '', ''],
    ['Total Income (₹)', totalIncome, '', ''],
    ['Total Expenses (₹)', totalExpenses, '', ''],
    ['Net Savings / Balance (₹)', netBalance, '', ''],
    ['', '', '', ''],
    ['Category Spending Breakdown', 'Amount (₹)', 'Share (%)', ''],
  ];

  const sortedCats = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  sortedCats.forEach(([cat, amt]) => {
    const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 1000) / 10 : 0;
    summaryValues.push([cat, amt, `${pct}%`, '']);
  });

  summaryValues.push(['', '', '', '']);
  summaryValues.push(['Payment Mode Distribution', 'Amount (₹)', '', '']);
  const sortedPayments = Object.entries(paymentMap).sort((a, b) => b[1] - a[1]);
  sortedPayments.forEach(([pm, amt]) => {
    summaryValues.push([pm, amt, '', '']);
  });

  if (typeof window !== 'undefined' && window.__TEST_MOCK_GOOGLE_SHEETS) {
    if (onProgress) onProgress('Summary complete!', 95);
    return true;
  }

  // Clear and update summary sheet
  await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/'Monthly Summary'!A1:D100:clear`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const summaryRes = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/'Monthly Summary'!A1:D${summaryValues.length}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: `'Monthly Summary'!A1:D${summaryValues.length}`,
      majorDimension: 'ROWS',
      values: summaryValues
    })
  });

  if (!summaryRes.ok) {
    const errJson = await summaryRes.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Failed to write monthly summary (HTTP ${summaryRes.status})`);
  }

  return true;
}

/**
 * Apply styling: Violet headers with white text, bold columns, and formatting
 */
export async function applySpreadsheetStyling(token, spreadsheetId, onProgress) {
  if (onProgress) onProgress('Applying theme & grid styling...', 90);

  if (typeof window !== 'undefined' && window.__TEST_MOCK_GOOGLE_SHEETS) {
    return true;
  }

  try {
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Format Transactions Header (Row 1)
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.42, green: 0.28, blue: 1.0 }, // #6C47FF Violet
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          // Format Summary Sheet Header
          {
            repeatCell: {
              range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.42, green: 0.28, blue: 1.0 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }
        ]
      })
    });
  } catch (e) {
    // Styling failure should not abort successful data export
    console.warn('[GoogleSheetsService] Styling batchUpdate warning:', e);
  }
  return true;
}

/**
 * High-Level Orchestrator: Executes complete export workflow
 */
export async function executeGoogleSheetsExport({
  userId,
  userEmail,
  userName = 'Raj Shinde',
  transactions = [],
  exportScope = 'all', // 'all' | 'current_month' | 'selected_month' | 'date_range'
  filterOptions = {},
  destination = 'create_new', // 'create_new' | 'update_existing'
  existingSpreadsheetId = null,
  onProgress
}) {
  // 1. Connectivity check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Internet connection required. Cannot export to Google Sheets while offline.');
  }

  // 2. Filter transactions
  if (onProgress) onProgress('Filtering transactions...', 5);
  const filtered = filterTransactionsForExport(transactions, exportScope, filterOptions);

  if (!filtered || filtered.length === 0) {
    throw new Error('No transactions found matching the selected export filter.');
  }

  // 3. Acquire valid Google OAuth 2.0 Access Token
  if (onProgress) onProgress('Checking Google Sheets authorization...', 10);
  const token = await requestGoogleSheetsAccess(userId, userEmail);

  // 4. Resolve Target Spreadsheet
  let sheetMetadata;
  if (destination === 'update_existing' && existingSpreadsheetId) {
    if (onProgress) onProgress('Locating existing Google Spreadsheet...', 20);
    sheetMetadata = {
      spreadsheetId: existingSpreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${existingSpreadsheetId}/edit`,
      title: `PocketNook - Financial Records (${userName})`
    };
  } else {
    sheetMetadata = await createNewSpreadsheet(token, userName, onProgress);
  }

  // 5. Write Transactions Sheet
  await writeTransactionsToSheet(token, sheetMetadata.spreadsheetId, filtered, onProgress);

  // 6. Write Monthly Summary Sheet
  await writeMonthlySummaryToSheet(token, sheetMetadata.spreadsheetId, filtered, onProgress);

  // 7. Apply Theme & Grid Styling
  await applySpreadsheetStyling(token, sheetMetadata.spreadsheetId, onProgress);

  // 8. Save updated configuration for the user
  const savedConfig = {
    spreadsheetId: sheetMetadata.spreadsheetId,
    spreadsheetUrl: sheetMetadata.spreadsheetUrl,
    title: sheetMetadata.title,
    lastExportedAt: new Date().toISOString(),
    lastExportCount: filtered.length,
    lastExportScope: exportScope
  };
  await saveSheetConfig(userId, savedConfig);

  if (onProgress) onProgress('Export Complete!', 100);

  return {
    success: true,
    count: filtered.length,
    spreadsheetId: sheetMetadata.spreadsheetId,
    spreadsheetUrl: sheetMetadata.spreadsheetUrl,
    title: sheetMetadata.title
  };
}

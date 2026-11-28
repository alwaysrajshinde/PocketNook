import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Universal Client-Side Export Service for Web & Native Android (Capacitor)
 * Generates and downloads/shares Excel (.xlsx), CSV, and JSON files cleanly without extra storage permissions.
 */

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function saveAndShareOnNative(safeFilename, base64Data, title) {
  const cleanName = safeFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const writeRes = await Filesystem.writeFile({
    path: cleanName,
    data: base64Data,
    directory: Directory.Cache
  });
  await Share.share({
    title: title || cleanName,
    text: `PocketNook Export: ${cleanName}`,
    url: writeRes.uri,
    dialogTitle: `Save or Share ${cleanName}`
  });
}

export async function exportTransactionsToExcel(transactions = [], filename = 'Daily_Expenses_Export.xlsx') {
  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const rows = (Array.isArray(transactions) ? transactions : []).map((t, idx) => ({
    'Sr No': idx + 1,
    'Date': t.date || '',
    'Category': t.category || '',
    'Payment Mode': t.payment_mode || '',
    'Description': t.description || '',
    'Amount (₹)': parseFloat(t.amount) || 0,
    'Type': (t.is_refund || t.amount < 0) ? 'Refund / Return' : 'Expense'
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 32 },
    { wch: 14 },
    { wch: 18 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    await saveAndShareOnNative(safeName, base64, 'PocketNook Excel Export');
    return;
  }

  XLSX.writeFile(workbook, safeName);
}

export async function exportTransactionsToCsv(transactions = [], filename = 'Daily_Expenses_Export.csv') {
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const rows = (Array.isArray(transactions) ? transactions : []).map((t, idx) => ({
    'Sr No': idx + 1,
    'Date': t.date || '',
    'Category': t.category || '',
    'Payment Mode': t.payment_mode || '',
    'Description': t.description || '',
    'Amount': parseFloat(t.amount) || 0,
    'Type': (t.is_refund || t.amount < 0) ? 'Refund' : 'Expense'
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csvOutput = XLSX.utils.sheet_to_csv(worksheet);

  if (Capacitor.isNativePlatform()) {
    await saveAndShareOnNative(safeName, utf8ToBase64(csvOutput), 'PocketNook CSV Export');
    return;
  }

  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', safeName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportDataToJson(data, filename = 'expense_tracker_backup.json') {
  const safeName = filename.endsWith('.json') ? filename : `${filename}.json`;
  const jsonStr = JSON.stringify(data || {}, null, 2);

  if (Capacitor.isNativePlatform()) {
    const writeRes = await Filesystem.writeFile({
      path: safeName.replace(/[^a-zA-Z0-9._-]/g, '_'),
      data: jsonStr,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });
    await Share.share({
      title: 'PocketNook JSON Backup',
      text: `PocketNook Backup: ${safeName}`,
      url: writeRes.uri,
      dialogTitle: `Save or Share ${safeName}`
    });
    return;
  }

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', safeName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

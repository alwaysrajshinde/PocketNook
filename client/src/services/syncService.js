/**
 * Reliable Synchronization & Network State Engine
 * Orchestrates offline write queues, network transitions, and conflict resolution.
 */

import { 
  getPendingMutations, 
  dequeuePendingMutation, 
  getOfflineLedger,
  saveOfflineLedger
} from './offlineStorage';
import * as firestoreService from './firestoreService';
import { isFirebaseConfigured, db } from '../firebase/config';
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App as CapacitorApp } from '@capacitor/app';

class SyncService {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.isSyncing = false;
    this.status = this.isOnline ? 'synced' : 'offline';
    this.listeners = new Set();
    this.lastSyncedAt = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isOnline) {
          this.triggerAutoSync();
        }
      });

      if (Capacitor.isNativePlatform()) {
        Network.getStatus().then((status) => {
          if (status.connected !== this.isOnline) {
            if (status.connected) this.handleOnline();
            else this.handleOffline();
          }
        }).catch(() => {});

        Network.addListener('networkStatusChange', (status) => {
          if (status.connected) this.handleOnline();
          else this.handleOffline();
        });

        CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive && this.isOnline) {
            this.triggerAutoSync();
          }
        });
      }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach(fn => {
      try { fn(state); } catch (e) {}
    });
  }

  getState() {
    const uid = this.getActiveUserId();
    const pendingCount = uid ? this.getPendingCount(uid) : 0;
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      status: this.isSyncing ? 'syncing' : (!this.isOnline ? 'offline' : (pendingCount > 0 ? 'pending' : (this.status || 'synced'))),
      pendingCount,
      lastSyncedAt: this.lastSyncedAt
    };
  }

  handleOnline() {
    console.log('[SyncService] Device reconnected to internet.');
    this.isOnline = true;
    this.status = 'syncing';
    this.notify();
    this.triggerAutoSync();
  }

  handleOffline() {
    console.log('[SyncService] Device lost internet connection. Operating offline.');
    this.isOnline = false;
    this.status = 'offline';
    this.notify();
  }

  hasPendingSync(userId) {
    if (!userId) return false;
    const queue = getPendingMutations(userId);
    return queue.length > 0;
  }

  getPendingCount(userId) {
    if (!userId) return 0;
    return getPendingMutations(userId).length;
  }

  async triggerAutoSync(userId) {
    const activeUid = userId || this.getActiveUserId();
    if (!activeUid || !this.isOnline || this.isSyncing) return;
    await this.processQueue(activeUid);
  }

  getActiveUserId() {
    try {
      const s = localStorage.getItem('expense_tracker_auth_session');
      if (s) {
        const parsed = JSON.parse(s);
        return parsed.uid || String(parsed.id) || null;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Processes all pending mutations in the local queue
   */
  async processQueue(userId) {
    if (!userId || this.isSyncing) return;
    const queue = getPendingMutations(userId);

    if (queue.length === 0) {
      this.status = this.isOnline ? 'synced' : 'offline';
      this.notify();
      return;
    }

    if (!this.isOnline) {
      this.status = 'offline';
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.status = 'syncing';
    this.notify();

    let successCount = 0;
    let failCount = 0;

    for (const mutation of queue) {
      try {
        const { action, targetId, payload } = mutation;
        if (isFirebaseConfigured && db) {
          if (action === 'create') {
            const docRef = doc(db, 'users', userId, 'transactions', String(targetId));
            await setDoc(docRef, {
              ...payload,
              id: targetId,
              sync_status: 'synced',
              synced_at: new Date().toISOString(),
              created_at: payload.created_at || serverTimestamp(),
              updated_at: serverTimestamp()
            }, { merge: true });

            // Invalidate monthly cache roll-up
            const monthKey = payload.month_key || (payload.date ? payload.date.slice(0, 7) : null);
            if (monthKey) {
              try { await deleteDoc(doc(db, 'users', userId, 'months', monthKey)); } catch (e) {}
            }
          } else if (action === 'update') {
            const docRef = doc(db, 'users', userId, 'transactions', String(targetId));
            await updateDoc(docRef, {
              ...payload,
              sync_status: 'synced',
              synced_at: new Date().toISOString(),
              updated_at: serverTimestamp()
            });

            const monthKey = payload.month_key || (payload.date ? payload.date.slice(0, 7) : null);
            if (monthKey) {
              try { await deleteDoc(doc(db, 'users', userId, 'months', monthKey)); } catch (e) {}
            }
          } else if (action === 'delete') {
            const docRef = doc(db, 'users', userId, 'transactions', String(targetId));
            await deleteDoc(docRef);
            if (mutation.monthKey) {
              try { await deleteDoc(doc(db, 'users', userId, 'months', mutation.monthKey)); } catch (e) {}
            }
          } else if (action === 'budget') {
            await firestoreService.updateBudget(userId, payload.month, payload.budget);
          } else if (action === 'create_category') {
            await firestoreService.addCategory(userId, payload);
          } else if (action === 'delete_category') {
            await firestoreService.deleteCategory(userId, targetId);
          }
        } else {
          // REST API fallback for local SQLite / non-Firebase environment
          const headers = { 'Content-Type': 'application/json' };
          try {
            const s = localStorage.getItem('expense_tracker_auth_session');
            if (s) {
              const session = JSON.parse(s);
              if (session.email) headers['x-user-email'] = session.email;
              if (session.name) headers['x-user-name'] = session.name;
              if (session.sub) headers['x-google-sub'] = session.sub;
              if (session.id_token) headers['authorization'] = `Bearer ${session.id_token}`;
            }
          } catch (e) {}

          if (action === 'create') {
            await fetch('/api/transactions', { method: 'POST', headers, body: JSON.stringify(payload) });
          } else if (action === 'update') {
            await fetch(`/api/transactions/${targetId}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
          } else if (action === 'delete') {
            await fetch(`/api/transactions/${targetId}`, { method: 'DELETE', headers });
          }
        }

        // Dequeue upon confirmed synchronization
        dequeuePendingMutation(userId, mutation.mutationId);
        successCount++;
      } catch (err) {
        console.warn(`[SyncService] Failed to sync mutation ${mutation.mutationId}:`, err);
        failCount++;
        // If network lost mid-sync, break loop to preserve order
        if (!navigator.onLine) {
          this.isOnline = false;
          break;
        }
      }
    }

    const remaining = getPendingMutations(userId);
    this.isSyncing = false;

    if (remaining.length === 0) {
      this.status = 'synced';
      this.lastSyncedAt = new Date().toISOString();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('expense_tracker_synced'));
      }
    } else if (failCount > 0) {
      this.status = 'failed';
    } else {
      this.status = this.isOnline ? 'pending' : 'offline';
    }

    this.notify();
  }
}

export const syncService = new SyncService();
export default syncService;

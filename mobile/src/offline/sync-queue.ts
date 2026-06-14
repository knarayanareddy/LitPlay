/**
 * Sync queue (§13.2).
 *
 * Offline sessions/gate attempts are stored in SQLite (§13.1) so growing
 * offline queues do not require parsing a large MMKV JSON blob. MMKV is still
 * used for small metadata such as `lastSyncAt`.
 */

import { MMKV_KEYS, mmkvStorage } from '../services/mmkv';
import {
  countSyncItems,
  deleteSyncItems,
  listSyncItems,
  moveSyncItemToDead,
  upsertSyncItem,
} from './sqlite-store';

export interface SyncQueueItem {
  id: string; // local UUID
  type: 'SESSION' | 'GATE_ATTEMPT';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  lastAttemptAt?: string;
}

const BATCH_SIZE = 20;
const MAX_QUEUE_AGE_DAYS = 30;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export async function getPendingQueue(): Promise<SyncQueueItem[]> {
  return listSyncItems('pending');
}

export async function enqueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
  await upsertSyncItem({
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
}

export async function getQueueLength(): Promise<number> {
  return countSyncItems('pending');
}

async function moveToDead(item: SyncQueueItem): Promise<void> {
  await moveSyncItemToDead(item);
}

/**
 * Purge items older than 30 days (§13.2 rule 6).
 */
export async function purgeExpired(): Promise<number> {
  const queue = await getPendingQueue();
  const cutoff = Date.now() - MAX_QUEUE_AGE_DAYS * 24 * 60 * 60 * 1000;
  const expired = queue.filter((item) => new Date(item.createdAt).getTime() < cutoff);
  if (expired.length > 0) {
    await deleteSyncItems(expired.map((item) => item.id));
    console.warn(`[sync] Purged ${expired.length} items older than ${MAX_QUEUE_AGE_DAYS} days`);
  }
  return expired.length;
}

/**
 * Calculate exponential backoff delay (§13.2 rule 5).
 */
export function backoffDelay(retryCount: number): number {
  const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount);
  return Math.min(delay, BACKOFF_MAX_MS);
}

/**
 * Flush the queue: send batches to batch-sync endpoint.
 * Called by the sync service on reconnect.
 */
export async function flushQueue(
  syncFn: (sessions: unknown[]) => Promise<{ synced: number; failed: string[] }>,
): Promise<{ synced: number; failed: number }> {
  await purgeExpired();
  const queue = await getPendingQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let totalSynced = 0;
  let totalFailed = 0;

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    try {
      const result = await syncFn(batch.map((item) => item.payload));
      const failedIds = new Set(result.failed ?? []);
      const syncedIds: string[] = [];

      totalSynced += result.synced;
      for (const item of batch) {
        if (failedIds.has(item.id) || failedIds.has(String(item.payload.id ?? ''))) {
          await moveToDead(item);
          totalFailed++;
        } else {
          syncedIds.push(item.id);
        }
      }
      await deleteSyncItems(syncedIds);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      const isClientError = typeof status === 'number' && status >= 400 && status < 500;
      for (const item of batch) {
        if (isClientError) {
          await moveToDead(item);
          totalFailed++;
        } else {
          await upsertSyncItem({
            ...item,
            retryCount: item.retryCount + 1,
            lastAttemptAt: new Date().toISOString(),
          });
          totalFailed++;
        }
      }
    }
  }

  mmkvStorage.set(MMKV_KEYS.LAST_SYNC_AT, new Date().toISOString());
  return { synced: totalSynced, failed: totalFailed };
}

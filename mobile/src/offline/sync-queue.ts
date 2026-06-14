/**
 * Sync queue (§13.2).
 *
 * Manages offline session/gate-attempt data in MMKV and flushes it
 * to POST /progress/sessions/batch-sync on reconnect.
 *
 * Sync rules (§13.2):
 *  1. On reconnect, read syncQueue:pending from MMKV
 *  2. Send in batches of 20 to batch-sync endpoint
 *  3. On 2xx → remove from queue
 *  4. On 4xx → move to syncQueue:dead (manual review)
 *  5. On 5xx/network → stay in queue; exponential backoff (5s base, 5m max)
 *  6. Max queue age: 30 days, then purge with warning log
 */

import { mmkvStorage, MMKV_KEYS } from '../services/mmkv';

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

export function getPendingQueue(): SyncQueueItem[] {
  const raw = mmkvStorage.getString(MMKV_KEYS.SYNC_QUEUE_PENDING);
  return raw ? JSON.parse(raw) : [];
}

export function savePendingQueue(items: SyncQueueItem[]): void {
  mmkvStorage.set(MMKV_KEYS.SYNC_QUEUE_PENDING, JSON.stringify(items));
}

export function enqueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>): void {
  const queue = getPendingQueue();
  queue.push({
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  savePendingQueue(queue);
}

export function getQueueLength(): number {
  return getPendingQueue().length;
}

function moveToDead(item: SyncQueueItem): void {
  const deadRaw = mmkvStorage.getString(MMKV_KEYS.SYNC_QUEUE_DEAD);
  const dead: SyncQueueItem[] = deadRaw ? JSON.parse(deadRaw) : [];
  dead.push(item);
  mmkvStorage.set(MMKV_KEYS.SYNC_QUEUE_DEAD, JSON.stringify(dead));
}

/**
 * Purge items older than 30 days (§13.2 rule 6).
 */
export function purgeExpired(): number {
  const queue = getPendingQueue();
  const cutoff = Date.now() - MAX_QUEUE_AGE_DAYS * 24 * 60 * 60 * 1000;
  const expired = queue.filter((item) => new Date(item.createdAt).getTime() < cutoff);
  const remaining = queue.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
  savePendingQueue(remaining);
  // Log warning for purged items (production: structured log + Sentry breadcrumb)
  if (expired.length > 0) {
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
  purgeExpired();
  const queue = getPendingQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let totalSynced = 0;
  let totalFailed = 0;
  const stillPending: SyncQueueItem[] = [];

  // Process in batches of 20 (§13.2 rule 2)
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    try {
      const result = await syncFn(batch.map((item) => item.payload));
      totalSynced += result.synced;
      // §13.2 rule 3 — on success, items are removed (not re-added to pending)
    } catch (err) {
      // §13.2 rule 4 — on 4xx, move to dead queue
      // §13.2 rule 5 — on 5xx/network, keep in queue with backoff
      const isClientError = err instanceof Error && 'status' in err && (err as any).status >= 400 && (err as any).status < 500;
      for (const item of batch) {
        if (isClientError) {
          moveToDead(item);
          totalFailed++;
        } else {
          stillPending.push({
            ...item,
            retryCount: item.retryCount + 1,
            lastAttemptAt: new Date().toISOString(),
          });
          totalFailed++;
        }
      }
    }
  }

  savePendingQueue(stillPending);
  mmkvStorage.set(MMKV_KEYS.LAST_SYNC_AT, new Date().toISOString());
  return { synced: totalSynced, failed: totalFailed };
}

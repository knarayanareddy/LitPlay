/**
 * Mobile SQLite offline store (§13.1).
 *
 * Queryable offline records live in SQLite, while MMKV is reserved for small
 * key/value metadata (auth tokens, last-sync timestamps, feature flags). This
 * avoids repeatedly parsing large MMKV JSON arrays as offline usage grows.
 */

import { open, type DB } from '@op-engineering/op-sqlite';
import { mmkvStorage } from '../services/mmkv';
import type { SyncQueueItem } from './sync-queue';

const DB_NAME = 'litplay_offline.sqlite';
const FALLBACK_KEY = 'sqliteFallback:syncQueue';

let db: DB | null | undefined;
let initPromise: Promise<void> | null = null;
let memoryFallback: SyncQueueItem[] | null = null;

function getDb(): DB | null {
  if (db !== undefined) return db;
  try {
    db = open({ name: DB_NAME });
  } catch (error) {
    console.warn('[sqlite] Falling back to MMKV/in-memory offline store', error);
    db = null;
  }
  return db;
}

async function initSQLite(): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.execute(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'dead')),
      created_at TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT
    )
  `);
  await database.execute('CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created ON sync_queue(status, created_at)');
}

export async function ensureOfflineDb(): Promise<void> {
  if (!initPromise) initPromise = initSQLite();
  await initPromise;
}

function getFallback(): SyncQueueItem[] {
  if (memoryFallback) return memoryFallback;
  const raw = mmkvStorage.getString(FALLBACK_KEY);
  memoryFallback = raw ? JSON.parse(raw) as SyncQueueItem[] : [];
  return memoryFallback;
}

function saveFallback(items: SyncQueueItem[]): void {
  memoryFallback = items;
  mmkvStorage.set(FALLBACK_KEY, JSON.stringify(items));
}

function rowToItem(row: Record<string, unknown>): SyncQueueItem {
  return {
    id: String(row.id),
    type: row.type as SyncQueueItem['type'],
    payload: JSON.parse(String(row.payload_json)),
    createdAt: String(row.created_at),
    retryCount: Number(row.retry_count),
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : undefined,
  };
}

export async function listSyncItems(status: 'pending' | 'dead' = 'pending'): Promise<SyncQueueItem[]> {
  await ensureOfflineDb();
  const database = getDb();
  if (!database) return getFallback().filter((item) => status === 'pending' || (item as SyncQueueItem & { status?: string }).status === status);
  const result = await database.execute(
    'SELECT id, type, payload_json, created_at, retry_count, last_attempt_at FROM sync_queue WHERE status = ? ORDER BY created_at ASC',
    [status],
  );
  return (result.rows?._array ?? []).map(rowToItem);
}

export async function upsertSyncItem(item: SyncQueueItem, status: 'pending' | 'dead' = 'pending'): Promise<void> {
  await ensureOfflineDb();
  const database = getDb();
  if (!database) {
    const rest = getFallback().filter((existing) => existing.id !== item.id);
    saveFallback([...rest, { ...item, ...(status === 'dead' ? { status } : {}) } as SyncQueueItem]);
    return;
  }
  await database.execute(
    `INSERT INTO sync_queue (id, type, payload_json, status, created_at, retry_count, last_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       payload_json = excluded.payload_json,
       status = excluded.status,
       retry_count = excluded.retry_count,
       last_attempt_at = excluded.last_attempt_at`,
    [item.id, item.type, JSON.stringify(item.payload), status, item.createdAt, item.retryCount, item.lastAttemptAt ?? null],
  );
}

export async function deleteSyncItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureOfflineDb();
  const database = getDb();
  if (!database) {
    saveFallback(getFallback().filter((item) => !ids.includes(item.id)));
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  await database.execute(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, ids);
}

export async function moveSyncItemToDead(item: SyncQueueItem): Promise<void> {
  await upsertSyncItem(item, 'dead');
}

export async function countSyncItems(status: 'pending' | 'dead' = 'pending'): Promise<number> {
  await ensureOfflineDb();
  const database = getDb();
  if (!database) return getFallback().length;
  const result = await database.execute('SELECT COUNT(*) AS count FROM sync_queue WHERE status = ?', [status]);
  return Number(result.rows?.item(0)?.count ?? 0);
}

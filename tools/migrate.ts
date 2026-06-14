#!/usr/bin/env tsx
/**
 * Simple production migration runner for LitPlay SQL migrations.
 *
 * Usage:
 *   AUTH_DATABASE_URL=... PROGRESS_DATABASE_URL=... npm run migrate
 *
 * This intentionally tracks applied files in schema_migrations per database and
 * executes migrations in lexical order. It is suitable for ECS one-shot tasks;
 * teams may swap it for Flyway without changing migration files.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

const DB_DIRS = {
  auth: 'packages/db/auth',
  progress: 'packages/db/progress',
  content: 'packages/db/content',
  classroom: 'packages/db/classroom',
  notification: 'packages/db/notification',
} as const;

const URL_ENV = {
  auth: 'AUTH_DATABASE_URL',
  progress: 'PROGRESS_DATABASE_URL',
  content: 'CONTENT_DATABASE_URL',
  classroom: 'CLASSROOM_DATABASE_URL',
  notification: 'NOTIFICATION_DATABASE_URL',
} as const;

async function migrateOne(name: keyof typeof DB_DIRS, connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(DB_DIRS[name])).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [file]);
      if (existing.rowCount) continue;
      const sql = await readFile(join(DB_DIRS[name], file), 'utf8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`[migrate] ${name}: applied ${file}`);
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

for (const name of Object.keys(DB_DIRS) as Array<keyof typeof DB_DIRS>) {
  const url = process.env[URL_ENV[name]] ?? (name === 'auth' ? process.env.DATABASE_URL : undefined);
  if (!url) {
    console.warn(`[migrate] skipping ${name}: ${URL_ENV[name]} not set`);
    continue;
  }
  await migrateOne(name, url);
}

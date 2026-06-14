/**
 * Content repository — world/scene/gate catalog + assignments (§10.4, §18).
 */

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import type { Difficulty } from '@litplay/contracts';

export interface WorldRecord {
  id: string;
  title: string;
  gradeLevel: string;
  lexileRange: string;
  language: string;
  tags: string[];
  thumbnailUrl: string | null;
  assetBundleUrl: string;
  manifestVersion: string;
  checksumSha256: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  scenes: SceneRecord[];
}

export interface SceneRecord {
  id: string;
  worldId: string;
  title: string;
  sceneIndex: number;
  estimatedMinutes: number;
  gates: GateRecord[];
}

export interface GateRecord {
  id: string;
  sceneId: string;
  passage: string;
  difficulty: Difficulty;
  maxRetries: number;
  orderIndex: number;
}

export interface AssignmentRecord {
  id: string;
  contentId: string;
  studentId: string | null;
  classroomId: string | null;
  assignedBy: string;
  createdAt: string;
}

export interface ContentRepository {
  listWorlds(filter?: { gradeLevel?: string; published?: boolean }): Promise<WorldRecord[]>;
  getWorld(id: string): Promise<WorldRecord | null>;
  createWorld(w: WorldRecord): Promise<WorldRecord>;
  createAssignment(a: AssignmentRecord): Promise<AssignmentRecord>;
  getAssignments(studentId: string): Promise<AssignmentRecord[]>;
  deleteAssignment(id: string): Promise<void>;
  signDownloadUrl(worldId: string, ttlSeconds: number): Promise<string>;
}

function signCloudFrontUrl(url: string, ttlSeconds: number): string {
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const expires = new Date(Date.now() + ttlSeconds * 1000);

  if (keyPairId && privateKey) {
    return getSignedUrl({ url, keyPairId, privateKey, dateLessThan: expires.toISOString() });
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CloudFront signing keys are required in production');
  }

  const epoch = Math.floor(expires.getTime() / 1000);
  return `${url}?Expires=${epoch}&Signature=signed-placeholder&Key-Pair-Id=DEV_ONLY`;
}

export class InMemoryContentRepository implements ContentRepository {
  worlds = new Map<string, WorldRecord>();
  assignments = new Map<string, AssignmentRecord>();

  async listWorlds(filter?: { gradeLevel?: string; published?: boolean }): Promise<WorldRecord[]> {
    let result = [...this.worlds.values()].filter((w) => !w.deletedAt);
    if (filter?.gradeLevel) {
      result = result.filter((w) => w.gradeLevel === filter.gradeLevel);
    }
    if (filter?.published !== undefined) {
      result = result.filter((w) => w.isPublished === filter.published);
    }
    return result;
  }

  async getWorld(id: string): Promise<WorldRecord | null> {
    return this.worlds.get(id) ?? null;
  }

  async createWorld(w: WorldRecord): Promise<WorldRecord> {
    this.worlds.set(w.id, w);
    return w;
  }

  async createAssignment(a: AssignmentRecord): Promise<AssignmentRecord> {
    this.assignments.set(a.id, a);
    return a;
  }

  async getAssignments(studentId: string): Promise<AssignmentRecord[]> {
    return [...this.assignments.values()].filter((a) => a.studentId === studentId);
  }

  async deleteAssignment(id: string): Promise<void> {
    this.assignments.delete(id);
  }

  /**
   * §18.2 — CloudFront signed URL with 24h TTL.
   * Production: uses @aws-sdk/cloudfront-signer. Here we build the signed URL
   * shape and return a placeholder with embedded expiry for testing.
   */
  async signDownloadUrl(worldId: string, ttlSeconds: number): Promise<string> {
    const world = this.worlds.get(worldId);
    const base = world?.assetBundleUrl ?? `https://cdn.litplay.app/content/${worldId}/bundle.zip`;
    return signCloudFrontUrl(base, ttlSeconds);
  }
}

/**
 * §18.3 — Lexile range lookup by grade level.
 */
export const LEXILE_BY_GRADE: Record<string, string> = {
  K: 'BR100L–200L',
  '1': '200L–400L',
  '2': '400L–600L',
  '3': '600L–800L',
  '4': '800L–1000L',
  '5': '1000L–1100L',
};

// --- PostgreSQL implementation (production) ---------------------------------

import { Pool } from 'pg';

type WorldRow = { id:string; title:string; grade_level:string; lexile_range:string; language:string; tags:string[]; thumbnail_url:string|null; asset_bundle_url:string; manifest_version:string; checksum_sha256:string|null; is_published:boolean; created_at:Date|string; updated_at:Date|string; deleted_at:Date|string|null };
type SceneRow = { id:string; world_id:string; title:string; scene_index:number; estimated_minutes:number };
type GateRow = { id:string; scene_id:string; passage:string; difficulty:Difficulty; max_retries:number; order_index:number };
type AssignmentRow = { id:string; content_id:string; student_id:string|null; classroom_id:string|null; assigned_by:string; created_at:Date|string };
const iso2 = (v: Date|string|null|undefined) => v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
function mapAssignment(r: AssignmentRow): AssignmentRecord { return { id:r.id, contentId:r.content_id, studentId:r.student_id, classroomId:r.classroom_id, assignedBy:r.assigned_by, createdAt:iso2(r.created_at)! }; }

export class PostgresContentRepository implements ContentRepository {
  private pool: Pool;
  constructor(connectionString = process.env.DATABASE_URL) { if (!connectionString) throw new Error('DATABASE_URL is required for PostgresContentRepository'); this.pool = new Pool({ connectionString }); }
  private async hydrateWorld(row: WorldRow): Promise<WorldRecord> {
    const { rows: scenes } = await this.pool.query<SceneRow>('SELECT id,world_id,title,scene_index,estimated_minutes FROM scenes WHERE world_id=$1 ORDER BY scene_index',[row.id]);
    const sceneRecords: SceneRecord[] = [];
    for (const s of scenes) {
      const { rows: gates } = await this.pool.query<GateRow>('SELECT id,scene_id,passage,difficulty,max_retries,order_index FROM gates WHERE scene_id=$1 ORDER BY order_index',[s.id]);
      sceneRecords.push({ id:s.id, worldId:s.world_id, title:s.title, sceneIndex:s.scene_index, estimatedMinutes:s.estimated_minutes, gates:gates.map(g=>({id:g.id,sceneId:g.scene_id,passage:g.passage,difficulty:g.difficulty,maxRetries:g.max_retries,orderIndex:g.order_index})) });
    }
    return { id:row.id,title:row.title,gradeLevel:row.grade_level,lexileRange:row.lexile_range,language:row.language,tags:row.tags ?? [],thumbnailUrl:row.thumbnail_url,assetBundleUrl:row.asset_bundle_url,manifestVersion:row.manifest_version,checksumSha256:row.checksum_sha256,isPublished:row.is_published,createdAt:iso2(row.created_at)!,updatedAt:iso2(row.updated_at)!,deletedAt:iso2(row.deleted_at),scenes:sceneRecords };
  }
  async listWorlds(filter?: {gradeLevel?: string; published?: boolean}): Promise<WorldRecord[]> {
    const clauses=['deleted_at IS NULL']; const values: unknown[]=[];
    if (filter?.gradeLevel) { values.push(filter.gradeLevel); clauses.push(`grade_level=$${values.length}`); }
    if (filter?.published !== undefined) { values.push(filter.published); clauses.push(`is_published=$${values.length}`); }
    const { rows } = await this.pool.query<WorldRow>(`SELECT * FROM worlds WHERE ${clauses.join(' AND ')} ORDER BY title`, values);
    return Promise.all(rows.map(r=>this.hydrateWorld(r)));
  }
  async getWorld(id: string): Promise<WorldRecord|null> { const { rows } = await this.pool.query<WorldRow>('SELECT * FROM worlds WHERE id=$1 AND deleted_at IS NULL',[id]); return rows[0]?this.hydrateWorld(rows[0]):null; }
  async createWorld(w: WorldRecord): Promise<WorldRecord> {
    await this.pool.query(`INSERT INTO worlds (id,title,grade_level,lexile_range,language,tags,thumbnail_url,asset_bundle_url,manifest_version,checksum_sha256,is_published,created_at,updated_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [w.id,w.title,w.gradeLevel,w.lexileRange,w.language,w.tags,w.thumbnailUrl,w.assetBundleUrl,w.manifestVersion,w.checksumSha256,w.isPublished,w.createdAt,w.updatedAt,w.deletedAt]);
    for (const s of w.scenes) { await this.pool.query('INSERT INTO scenes (id,world_id,title,scene_index,estimated_minutes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,now(),now())',[s.id,w.id,s.title,s.sceneIndex,s.estimatedMinutes]); for (const g of s.gates) await this.pool.query('INSERT INTO gates (id,scene_id,passage,difficulty,max_retries,order_index,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now(),now())',[g.id,s.id,g.passage,g.difficulty,g.maxRetries,g.orderIndex]); }
    return w;
  }
  async createAssignment(a: AssignmentRecord): Promise<AssignmentRecord> { const { rows } = await this.pool.query<AssignmentRow>('INSERT INTO assignments (id,content_id,student_id,classroom_id,assigned_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING id,content_id,student_id,classroom_id,assigned_by,created_at',[a.id,a.contentId,a.studentId,a.classroomId,a.assignedBy,a.createdAt]); return mapAssignment(rows[0]); }
  async getAssignments(studentId: string): Promise<AssignmentRecord[]> { const { rows } = await this.pool.query<AssignmentRow>('SELECT id,content_id,student_id,classroom_id,assigned_by,created_at FROM assignments WHERE student_id=$1 ORDER BY created_at DESC',[studentId]); return rows.map(mapAssignment); }
  async deleteAssignment(id: string): Promise<void> { await this.pool.query('DELETE FROM assignments WHERE id=$1',[id]); }
  async signDownloadUrl(worldId: string, ttlSeconds: number): Promise<string> { const w = await this.getWorld(worldId); const base=w?.assetBundleUrl ?? `https://cdn.litplay.app/content/${worldId}/bundle.zip`; return signCloudFrontUrl(base, ttlSeconds); }
}

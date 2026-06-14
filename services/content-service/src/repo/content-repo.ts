/**
 * Content repository — world/scene/gate catalog + assignments (§10.4, §18).
 */

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
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const world = this.worlds.get(worldId);
    const base = world?.assetBundleUrl ?? `https://cdn.litplay.app/content/${worldId}/bundle.zip`;
    return `${base}?Expires=${expires}&Signature=signed-placeholder&Key-Pair-Id=APKAIATEST`;
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

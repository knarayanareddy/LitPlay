/**
 * Content business logic (§10.4, §18).
 */

import {
  TOPICS,
  buildEvent,
  type CreateAssignmentRequest,
} from '@litplay/contracts';
import type { EventBus } from '@litplay/server-kit';
import {
  type AssignmentRecord,
  type ContentRepository,
  type WorldRecord,
} from './repo/content-repo.js';

const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60; // §18.2 — 24h expiry

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
}

export interface ContentServiceDeps {
  repo: ContentRepository;
  eventBus: EventBus;
}

export class ContentService {
  constructor(private deps: ContentServiceDeps) {}

  async listWorlds(filter?: { gradeLevel?: string; published?: boolean }) {
    return this.deps.repo.listWorlds(filter);
  }

  async getWorld(id: string): Promise<WorldRecord> {
    const w = await this.deps.repo.getWorld(id);
    if (!w) throw new NotFoundError('World not found');
    return w;
  }

  async getDownloadUrl(worldId: string): Promise<{ url: string; expiresInSeconds: number }> {
    // Verify the world exists
    await this.getWorld(worldId);
    const url = await this.deps.repo.signDownloadUrl(worldId, SIGNED_URL_TTL_SECONDS);
    return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  }

  async listGates(worldId: string) {
    const world = await this.getWorld(worldId);
    return world.scenes.flatMap((scene) => scene.gates);
  }

  async assignContent(req: CreateAssignmentRequest, assignedBy: string): Promise<AssignmentRecord> {
    if (!req.studentId && !req.classroomId) {
      throw new ValidationError('Either studentId or classroomId is required');
    }
    // Verify content exists
    await this.getWorld(req.contentId);

    const now = new Date().toISOString();
    const assignment: AssignmentRecord = {
      id: crypto.randomUUID(),
      contentId: req.contentId,
      studentId: req.studentId ?? null,
      classroomId: req.classroomId ?? null,
      assignedBy,
      createdAt: now,
    };
    const saved = await this.deps.repo.createAssignment(assignment);

    // §15.3 — emit assignment.created → notification-service sends push to student
    await this.deps.eventBus.publish(
      buildEvent(
        TOPICS.CONTENT_ASSIGNMENT_CREATED,
        'content-service',
        {
          assignmentId: saved.id,
          contentId: saved.contentId,
          studentId: saved.studentId ?? undefined,
          classroomId: saved.classroomId ?? undefined,
          assignedBy,
        },
        saved.id,
      ),
    );
    return saved;
  }

  async getAssignments(studentId: string) {
    return this.deps.repo.getAssignments(studentId);
  }

  async deleteAssignment(id: string) {
    await this.deps.repo.deleteAssignment(id);
  }
}

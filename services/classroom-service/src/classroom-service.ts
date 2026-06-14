/**
 * Classroom business logic (§10.6, §19).
 */

import {
  TOPICS,
  buildEvent,
  type CreateClassroomRequest,
  type JoinClassroomRequest,
  type SetGoalRequest,
  type UpdateClassroomRequest,
} from '@litplay/contracts';
import type { EventBus, InterServiceClient } from '@litplay/server-kit';
import { generateJoinCode } from '@litplay/server-kit';
import {
  type ClassroomMemberRecord,
  type ClassroomRecord,
  type ClassroomRepository,
  type JoinCodeRecord,
  type StudentGoalRecord,
} from './repo/classroom-repo.js';

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
}
export class ConflictError extends Error {
  statusCode = 409;
  code = 'CONFLICT';
}
export class ExpiredCodeError extends Error {
  statusCode = 410;
  code = 'JOIN_CODE_EXPIRED';
}

export interface ClassroomServiceDeps {
  repo: ClassroomRepository;
  eventBus: EventBus;
  interService?: InterServiceClient;
}

export class ClassroomService {
  constructor(private deps: ClassroomServiceDeps) {}

  // --- Classroom lifecycle (§19.1) ---

  async createClassroom(req: CreateClassroomRequest): Promise<ClassroomRecord> {
    const now = new Date().toISOString();
    const classroom: ClassroomRecord = {
      id: crypto.randomUUID(),
      name: req.name,
      teacherId: req.teacherId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const saved = await this.deps.repo.createClassroom(classroom);

    // §19.1 — auto-generate a join code
    await this.generateJoinCode(saved.id);

    // Teacher becomes a member automatically
    await this.deps.repo.addMember({
      classroomId: saved.id,
      userId: req.teacherId,
      role: 'teacher',
      joinedAt: now,
    });

    return saved;
  }

  async getClassroom(id: string): Promise<ClassroomRecord> {
    const c = await this.deps.repo.getClassroom(id);
    if (!c || c.deletedAt) throw new NotFoundError('Classroom not found');
    return c;
  }

  async updateClassroom(id: string, req: UpdateClassroomRequest): Promise<ClassroomRecord> {
    await this.getClassroom(id);
    const patch: Partial<ClassroomRecord> = {};
    if (req.name !== undefined) patch.name = req.name;
    return this.deps.repo.updateClassroom(id, patch);
  }

  async deleteClassroom(id: string): Promise<void> {
    await this.getClassroom(id);
    await this.deps.repo.deleteClassroom(id);
  }

  // --- Join codes (§19.1) ---

  async generateJoinCode(classroomId: string): Promise<JoinCodeRecord> {
    await this.getClassroom(classroomId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const code: JoinCodeRecord = {
      classroomId,
      code: generateJoinCode(),
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };
    await this.deps.repo.setJoinCode(code);
    return code;
  }

  async getJoinCodeByClassroom(classroomId: string): Promise<JoinCodeRecord | null> {
    await this.getClassroom(classroomId);
    return this.deps.repo.getJoinCodeByClassroom(classroomId);
  }

  async joinClassroom(req: JoinClassroomRequest): Promise<ClassroomMemberRecord> {
    const joinCode = await this.deps.repo.getJoinCode(req.joinCode);
    if (!joinCode) throw new NotFoundError('Invalid join code');
    if (new Date(joinCode.expiresAt) < new Date()) {
      throw new ExpiredCodeError('This join code has expired');
    }

    // Check for duplicate membership
    const members = await this.deps.repo.listMembers(joinCode.classroomId);
    if (members.some((m) => m.userId === req.studentId)) {
      throw new ConflictError('Already a member of this classroom');
    }

    const member: ClassroomMemberRecord = {
      classroomId: joinCode.classroomId,
      userId: req.studentId,
      role: 'student',
      joinedAt: new Date().toISOString(),
    };
    await this.deps.repo.addMember(member);

    // §15.3 — emit member.joined for analytics
    await this.deps.eventBus.publish(
      buildEvent(
        TOPICS.CLASSROOM_MEMBER_JOINED,
        'classroom-service',
        { classroomId: member.classroomId, userId: member.userId, role: member.role },
        member.userId,
      ),
    );
    return member;
  }

  async listMembers(classroomId: string): Promise<ClassroomMemberRecord[]> {
    await this.getClassroom(classroomId);
    return this.deps.repo.listMembers(classroomId);
  }

  async removeMember(classroomId: string, userId: string): Promise<void> {
    await this.getClassroom(classroomId);
    await this.deps.repo.removeMember(classroomId, userId);
  }

  // --- Goals (FR-044) ---

  async setGoal(
    classroomId: string,
    studentId: string,
    req: SetGoalRequest,
  ): Promise<StudentGoalRecord> {
    await this.getClassroom(classroomId);
    const now = new Date().toISOString();
    const goal: StudentGoalRecord = {
      studentId,
      classroomId,
      targetWpm: req.targetWpm,
      minutesPerWeek: req.minutesPerWeek,
      createdAt: now,
      updatedAt: now,
    };
    return this.deps.repo.setGoal(goal);
  }

  async getGoal(studentId: string, classroomId: string): Promise<StudentGoalRecord | null> {
    return this.deps.repo.getGoal(studentId, classroomId);
  }

  // --- Progress dashboard (§11.6, §19.2) ---

  /**
   * Get per-student progress summary for a classroom.
   * Calls progress-service via inter-service client (§10.1 rule 3).
   */
  async getClassroomProgress(classroomId: string): Promise<
    Array<{
      studentId: string;
      role: string;
      fluency?: unknown;
    }>
  > {
    await this.getClassroom(classroomId);
    const members = await this.deps.repo.listMembers(classroomId);
    const students = members.filter((m) => m.role === 'student');

    // If inter-service client is available, fetch fluency in one batch to avoid
    // an N+1 dashboard request pattern for large classrooms.
    if (this.deps.interService) {
      const studentIds = students.map((s) => s.userId);
      const fluencyByStudent = await this.deps.interService
        .getStudentsFluency(studentIds)
        .catch(() => ({} as Record<string, unknown>));
      return students.map((s) => ({
        studentId: s.userId,
        role: s.role,
        fluency: fluencyByStudent[s.userId] ?? null,
      }));
    }

    // Without inter-service client, return member list only
    return students.map((s) => ({ studentId: s.userId, role: s.role }));
  }
}

/** classroom-service tests (§10.6, §19). */

import { InMemoryEventBus } from '@litplay/server-kit';
import { TOPICS } from '@litplay/contracts';
import { ClassroomService } from '../classroom-service.js';
import { InMemoryClassroomRepository } from '../repo/classroom-repo.js';

function makeService() {
  const repo = new InMemoryClassroomRepository();
  const eventBus = new InMemoryEventBus();
  const service = new ClassroomService({ repo, eventBus });
  return { repo, eventBus, service };
}

const TEACHER_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '00000000-0000-0000-0000-000000000002';

describe('ClassroomService', () => {
  describe('create + join', () => {
    it('creates a classroom with auto join code and teacher member', async () => {
      const { service } = makeService();
      const classroom = await service.createClassroom({
        name: 'Grade 2 - Room A',
        teacherId: TEACHER_ID,
      });
      expect(classroom.name).toBe('Grade 2 - Room A');

      // Teacher should be a member
      const members = await service.listMembers(classroom.id);
      expect(members).toHaveLength(1);
      expect(members[0].role).toBe('teacher');
      expect(members[0].userId).toBe(TEACHER_ID);

      // Join code should be 6 chars
      const joinCode = await service['deps'].repo.getJoinCodeByClassroom(classroom.id);
      expect(joinCode).not.toBeNull();
      expect(joinCode!.code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('student joins via join code and emits event', async () => {
      const { service, eventBus } = makeService();
      const classroom = await service.createClassroom({
        name: 'Test Class',
        teacherId: TEACHER_ID,
      });
      const joinCode = await service['deps'].repo.getJoinCodeByClassroom(classroom.id);

      const member = await service.joinClassroom({
        joinCode: joinCode!.code,
        studentId: STUDENT_ID,
      });
      expect(member.role).toBe('student');

      const events = eventBus.published.filter(
        (e) => e.topic === TOPICS.CLASSROOM_MEMBER_JOINED,
      );
      expect(events).toHaveLength(1);

      const members = await service.listMembers(classroom.id);
      expect(members).toHaveLength(2); // teacher + student
    });

    it('rejects invalid join code', async () => {
      const { service } = makeService();
      await expect(
        service.joinClassroom({ joinCode: 'BADCOD', studentId: STUDENT_ID }),
      ).rejects.toThrow('Invalid join code');
    });

    it('rejects expired join code', async () => {
      const { repo, service } = makeService();
      const classroom = await service.createClassroom({
        name: 'Test',
        teacherId: TEACHER_ID,
      });
      // Manually expire the code
      const code = await repo.getJoinCodeByClassroom(classroom.id);
      code!.expiresAt = new Date(Date.now() - 1000).toISOString();

      await expect(
        service.joinClassroom({ joinCode: code!.code, studentId: STUDENT_ID }),
      ).rejects.toThrow('expired');
    });

    it('prevents duplicate membership', async () => {
      const { service } = makeService();
      const classroom = await service.createClassroom({
        name: 'Test',
        teacherId: TEACHER_ID,
      });
      const code = await service['deps'].repo.getJoinCodeByClassroom(classroom.id);

      await service.joinClassroom({ joinCode: code!.code, studentId: STUDENT_ID });
      await expect(
        service.joinClassroom({ joinCode: code!.code, studentId: STUDENT_ID }),
      ).rejects.toThrow('Already a member');
    });
  });

  describe('goals (FR-044)', () => {
    it('sets and retrieves a student goal', async () => {
      const { service } = makeService();
      const classroom = await service.createClassroom({
        name: 'Test',
        teacherId: TEACHER_ID,
      });
      await service.setGoal(classroom.id, STUDENT_ID, {
        targetWpm: 75,
        minutesPerWeek: 90,
      });
      const goal = await service.getGoal(STUDENT_ID, classroom.id);
      expect(goal).not.toBeNull();
      expect(goal!.targetWpm).toBe(75);
      expect(goal!.minutesPerWeek).toBe(90);
    });
  });

  describe('delete', () => {
    it('soft-deletes a classroom', async () => {
      const { repo, service } = makeService();
      const classroom = await service.createClassroom({
        name: 'Test',
        teacherId: TEACHER_ID,
      });
      await service.deleteClassroom(classroom.id);
      // Re-get from repo to check deletedAt
      const raw = await repo.getClassroom(classroom.id);
      expect(raw!.deletedAt).not.toBeNull();
    });
  });
});

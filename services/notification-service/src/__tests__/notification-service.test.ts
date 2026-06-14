/** notification-service tests (§10.8, §21). */

import {
  buildEvent,
  TOPICS,
  type EventEnvelope,
} from '@litplay/contracts';
import {
  NotificationService,
  InMemoryNotificationRepository,
} from '../notification-service.js';

function makeService() {
  const repo = new InMemoryNotificationRepository();
  const service = new NotificationService({ repo });
  return { repo, service };
}

describe('NotificationService.handleEvent', () => {
  it('sends welcome email on user.created', async () => {
    const { repo, service } = makeService();
    const envelope: EventEnvelope = buildEvent(
      TOPICS.AUTH_USER_CREATED,
      'auth-service',
      {
        userId: 'user-1',
        email: 'parent@test.com',
        role: 'parent',
        requiresParentalConsent: false,
      },
    );
    await service.handleEvent(envelope);
    const records = await repo.getByUser('user-1');
    expect(records).toHaveLength(1);
    expect(records[0].template).toBe('welcome');
  });

  it('sends consent request email for under-13 user (§17.1)', async () => {
    const { repo, service } = makeService();
    const envelope: EventEnvelope = buildEvent(
      TOPICS.AUTH_USER_CREATED,
      'auth-service',
      {
        userId: 'user-1',
        email: 'child@test.com',
        role: 'student',
        requiresParentalConsent: true,
      },
    );
    await service.handleEvent(envelope);
    const records = await repo.getByUser('user-1');
    expect(records).toHaveLength(2); // welcome + consent_request
    expect(records.some((r) => r.template === 'consent_request')).toBe(true);
  });

  it('sends deletion confirmation on user.deleted (§17.3)', async () => {
    const { repo, service } = makeService();
    const envelope: EventEnvelope = buildEvent(
      TOPICS.AUTH_USER_DELETED,
      'auth-service',
      { userId: 'user-1' },
    );
    await service.handleEvent(envelope);
    const records = await repo.getByUser('user-1');
    expect(records).toHaveLength(1);
    expect(records[0].template).toBe('deletion_confirmation');
  });

  it('sends push notification on assignment.created (§21.1)', async () => {
    const { repo, service } = makeService();
    const envelope: EventEnvelope = buildEvent(
      TOPICS.CONTENT_ASSIGNMENT_CREATED,
      'content-service',
      { assignmentId: 'a-1', contentId: 'world-1', studentId: 'student-1', assignedBy: 'teacher-1' },
    );
    await service.handleEvent(envelope);
    const records = await repo.getByUser('student-1');
    expect(records).toHaveLength(1);
    expect(records[0].channel).toBe('push');
    expect(records[0].template).toBe('assignment_notification');
  });

  it('does not send push for classroom-wide assignments (no studentId)', async () => {
    const { repo, service } = makeService();
    const envelope: EventEnvelope = buildEvent(
      TOPICS.CONTENT_ASSIGNMENT_CREATED,
      'content-service',
      { assignmentId: 'a-1', contentId: 'world-1', classroomId: 'class-1', assignedBy: 'teacher-1' },
    );
    await service.handleEvent(envelope);
    const records = await repo.getByUser('student-1');
    expect(records).toHaveLength(0);
  });
});

describe('NotificationService weekly digest', () => {
  it('sends a weekly digest email', async () => {
    const { repo, service } = makeService();
    await service.sendWeeklyDigest('user-1', {
      totalWordsRead: 500,
      wpm: 62,
      sessionsCount: 5,
    });
    const records = await repo.getByUser('user-1');
    expect(records).toHaveLength(1);
    expect(records[0].template).toBe('weekly_digest');
    expect(records[0].body).toContain('500 words');
  });
});

describe('NotificationService quiet hours (§21.2)', () => {
  it('blocks push notifications at 9pm', () => {
    expect(NotificationService.isQuietHours(21)).toBe(true);
  });

  it('allows push notifications at 10am', () => {
    expect(NotificationService.isQuietHours(10)).toBe(false);
  });

  it('blocks push before 7am', () => {
    expect(NotificationService.isQuietHours(6)).toBe(true);
  });

  it('respects explicit opt-in requirement', () => {
    expect(NotificationService.shouldSendPush(false, 10)).toBe(false);
    expect(NotificationService.shouldSendPush(true, 10)).toBe(true);
    expect(NotificationService.shouldSendPush(true, 22)).toBe(false);
  });
});

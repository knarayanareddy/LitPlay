/**
 * Notification service (§10.8, §21).
 *
 * Consumes Kafka events and dispatches notifications:
 *  - user.created → welcome email + parental consent email (if needed)
 *  - assignment.created → push to student
 *  - user.deleted → deletion confirmation email
 *  - Weekly digest cron → teacher/parent email (§19, §21)
 */

import type { EventEnvelope } from '@litplay/contracts';

export interface NotificationRecord {
  id: string;
  userId: string;
  channel: 'email' | 'push';
  template: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

export interface NotificationRepository {
  save(n: NotificationRecord): Promise<NotificationRecord>;
  getByUser(userId: string): Promise<NotificationRecord[]>;
}

export class InMemoryNotificationRepository implements NotificationRepository {
  records = new Map<string, NotificationRecord>();

  async save(n: NotificationRecord): Promise<NotificationRecord> {
    this.records.set(n.id, n);
    return n;
  }

  async getByUser(userId: string): Promise<NotificationRecord[]> {
    return [...this.records.values()].filter((n) => n.userId === userId);
  }
}

export interface NotificationServiceDeps {
  repo: NotificationRepository;
}

export class NotificationService {
  constructor(private deps: NotificationServiceDeps) {}

  /**
   * Handle an incoming event envelope from the event bus (§15.3 consumers).
   * This is the entry point the Kafka consumer calls.
   */
  async handleEvent(envelope: EventEnvelope): Promise<void> {
    switch (envelope.topic) {
      case 'litplay.auth.user.created':
        await this.onUserCreated(envelope);
        break;
      case 'litplay.auth.user.deleted':
        await this.onUserDeleted(envelope);
        break;
      case 'litplay.content.assignment.created':
        await this.onAssignmentCreated(envelope);
        break;
    }
  }

  /** §21 — Welcome email + parental consent request for under-13 */
  private async onUserCreated(envelope: EventEnvelope): Promise<void> {
    const data = envelope.data as {
      userId: string;
      email: string;
      requiresParentalConsent: boolean;
    };

    // Welcome email (§21.1)
    await this.send({
      userId: data.userId,
      channel: 'email',
      template: 'welcome',
      subject: 'Welcome to LitPlay!',
      body: `Hi! Your LitPlay account is ready. Start your reading adventure today.`,
    });

    // §17.1 rule 5 — parental consent email
    if (data.requiresParentalConsent) {
      await this.send({
        userId: data.userId,
        channel: 'email',
        template: 'consent_request',
        subject: 'Action needed: Verify your child\'s LitPlay account',
        body: `Please confirm your consent for your child to use LitPlay. Click the link to verify.`,
      });
    }
  }

  /** §17.3 — deletion confirmation email */
  private async onUserDeleted(envelope: EventEnvelope): Promise<void> {
    const data = envelope.data as { userId: string };
    await this.send({
      userId: data.userId,
      channel: 'email',
      template: 'deletion_confirmation',
      subject: 'Your LitPlay account has been deleted',
      body: 'Your account and all associated data will be purged within 72 hours.',
    });
  }

  /** §21.1 — assignment push notification */
  private async onAssignmentCreated(envelope: EventEnvelope): Promise<void> {
    const data = envelope.data as { assignmentId: string; studentId?: string };
    if (!data.studentId) return;

    await this.send({
      userId: data.studentId,
      channel: 'push',
      template: 'assignment_notification',
      subject: 'New reading assignment!',
      body: 'Your teacher assigned new content. Tap to start reading!',
    });
  }

  /** §21.1 — weekly digest (Sundays, cron-triggered) */
  async sendWeeklyDigest(userId: string, summary: {
    totalWordsRead: number;
    wpm: number;
    sessionsCount: number;
  }): Promise<void> {
    await this.send({
      userId,
      channel: 'email',
      template: 'weekly_digest',
      subject: 'Your weekly LitPlay reading summary',
      body: `This week: ${summary.totalWordsRead} words read, ${summary.wpm} WPM average, ${summary.sessionsCount} sessions.`,
    });
  }

  /**
   * Core send method. Production: dispatches to FCM/APNs (push) or
   * SendGrid (email). Here we just persist the notification record.
   */
  private async send(input: Omit<NotificationRecord, 'id' | 'status' | 'createdAt'>): Promise<void> {
    const record: NotificationRecord = {
      ...input,
      id: crypto.randomUUID(),
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    await this.deps.repo.save(record);
  }

  /**
   * §21.2 rule 2 — student push notifications only between 7am–8pm local.
   */
  static isQuietHours(hourLocal: number): boolean {
    return hourLocal < 7 || hourLocal >= 20;
  }

  /**
   * §21.2 rule 1 — push requires explicit opt-in.
   */
  static shouldSendPush(hasPermission: boolean, hourLocal: number): boolean {
    if (!hasPermission) return false;
    return !NotificationService.isQuietHours(hourLocal);
  }
}

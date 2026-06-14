/**
 * Notification service (§10.8, §21).
 *
 * Consumes Kafka events and dispatches notifications:
 *  - user.created → welcome email + parental consent email (if needed)
 *  - assignment.created → push to student
 *  - user.deleted → deletion confirmation email
 *  - Weekly digest cron → teacher/parent email (§19, §21)
 */

import { createSign } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { connect as http2Connect } from 'node:http2';
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

export interface PushPreference {
  hasPermission: boolean;
  timezone: string;
}

export interface DeviceTokenRecord {
  userId: string;
  token: string;
  platform: 'ios' | 'android';
}

export interface NotificationRepository {
  save(n: NotificationRecord): Promise<NotificationRecord>;
  getByUser(userId: string): Promise<NotificationRecord[]>;
  getPushPreference(userId: string): Promise<PushPreference | null>;
  getDeviceTokens(userId: string): Promise<DeviceTokenRecord[]>;
}

export class InMemoryNotificationRepository implements NotificationRepository {
  records = new Map<string, NotificationRecord>();
  pushPreferences = new Map<string, PushPreference>();
  deviceTokens = new Map<string, DeviceTokenRecord[]>();

  async save(n: NotificationRecord): Promise<NotificationRecord> {
    this.records.set(n.id, n);
    return n;
  }

  async getByUser(userId: string): Promise<NotificationRecord[]> {
    return [...this.records.values()].filter((n) => n.userId === userId);
  }

  async getPushPreference(userId: string): Promise<PushPreference | null> {
    return this.pushPreferences.get(userId) ?? null;
  }

  async getDeviceTokens(userId: string): Promise<DeviceTokenRecord[]> {
    return this.deviceTokens.get(userId) ?? [];
  }

  setPushPreference(userId: string, pref: PushPreference): void {
    this.pushPreferences.set(userId, pref);
  }

  setDeviceTokens(userId: string, tokens: DeviceTokenRecord[]): void {
    this.deviceTokens.set(userId, tokens);
  }
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDispatcher {
  send(tokens: DeviceTokenRecord[], payload: PushPayload): Promise<void>;
}

export interface EmailPayload {
  toUserId: string;
  subject: string;
  body: string;
  template: string;
}

export interface EmailDispatcher {
  send(payload: EmailPayload): Promise<void>;
}

export class NoopPushDispatcher implements PushDispatcher {
  async send(_tokens: DeviceTokenRecord[], _payload: PushPayload): Promise<void> {
    // Local/test dispatcher: persistence verifies delivery intent.
  }
}

export class NoopEmailDispatcher implements EmailDispatcher {
  async send(_payload: EmailPayload): Promise<void> {
    // Local/test dispatcher: persistence verifies delivery intent.
  }
}

export class SendGridEmailDispatcher implements EmailDispatcher {
  async send(payload: EmailPayload): Promise<void> {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const toEmail = process.env.SENDGRID_TEST_TO_EMAIL;
    if (!apiKey || !fromEmail || !toEmail) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, and recipient mapping are required');
      }
      return;
    }
    const body = JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }], custom_args: { userId: payload.toUserId, template: payload.template } }],
      from: { email: fromEmail },
      subject: payload.subject,
      content: [{ type: 'text/plain', value: payload.body }],
    });
    await requestJson({
      hostname: 'api.sendgrid.com',
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
  }
}

export class FcmApnsPushDispatcher implements PushDispatcher {
  async send(tokens: DeviceTokenRecord[], payload: PushPayload): Promise<void> {
    const errors: Error[] = [];
    for (const token of tokens) {
      try {
        if (token.platform === 'android') await this.sendFcm(token.token, payload);
        else await this.sendApns(token.token, payload);
      } catch (error) {
        errors.push(error as Error);
      }
    }
    if (errors.length === tokens.length && errors.length > 0) {
      throw new Error(`All push dispatch attempts failed: ${errors.map((e) => e.message).join('; ')}`);
    }
  }

  private async sendFcm(token: string, payload: PushPayload): Promise<void> {
    const projectId = process.env.FCM_PROJECT_ID;
    const accessToken = await getFcmAccessToken();
    if (!projectId || !accessToken) {
      if (process.env.NODE_ENV === 'production') throw new Error('FCM_PROJECT_ID and FCM service-account credentials are required');
      return;
    }

    const body = JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      },
    });

    await requestJson({
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${projectId}/messages:send`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
  }

  private async sendApns(token: string, payload: PushPayload): Promise<void> {
    const teamId = process.env.APNS_TEAM_ID;
    const keyId = process.env.APNS_KEY_ID;
    const bundleId = process.env.APNS_BUNDLE_ID;
    const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!teamId || !keyId || !bundleId || !privateKey) {
      if (process.env.NODE_ENV === 'production') throw new Error('APNs credentials are required');
      return;
    }

    const host = process.env.APNS_USE_SANDBOX === 'true'
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';
    const jwt = createApnsJwt(teamId, keyId, privateKey);
    const client = http2Connect(host);
    const body = JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' }, ...(payload.data ?? {}) });

    await new Promise<void>((resolve, reject) => {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': bundleId,
        'content-type': 'application/json',
      });
      let statusCode = 0;
      let response = '';
      req.setEncoding('utf8');
      req.on('response', (headers) => {
        statusCode = Number(headers[':status'] ?? 0);
      });
      req.on('data', (chunk) => { response += chunk; });
      req.on('end', () => {
        client.close();
        if (statusCode >= 200 && statusCode < 300) resolve();
        else reject(new Error(`APNs ${statusCode}: ${response}`));
      });
      req.on('error', (err) => {
        client.close();
        reject(err);
      });
      req.end(body);
    });
  }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createApnsJwt(teamId: string, keyId: string, privateKey: string): string {
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${header}.${claims}.${base64Url(signature)}`;
}

let fcmTokenCache: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<string | null> {
  if (process.env.FCM_ACCESS_TOKEN) return process.env.FCM_ACCESS_TOKEN;
  if (fcmTokenCache && fcmTokenCache.expiresAt > Date.now() + 60_000) return fcmTokenCache.token;

  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const assertionClaims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${assertionHeader}.${assertionClaims}`);
  signer.end();
  const assertion = `${assertionHeader}.${assertionClaims}.${base64Url(signer.sign(privateKey))}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const response = await requestJson<{ access_token: string; expires_in: number }>({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
    parseJson: true,
  });
  fcmTokenCache = { token: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 };
  return fcmTokenCache.token;
}

function requestJson<T = void>(opts: { hostname: string; path: string; method: string; headers: Record<string, string | number>; body: string; parseJson?: boolean }): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(opts, (res) => {
      let response = '';
      res.on('data', (chunk) => { response += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve((opts.parseJson ? JSON.parse(response) : undefined) as T);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${response}`));
        }
      });
    });
    req.on('error', reject);
    req.write(opts.body);
    req.end();
  });
}

export interface NotificationServiceDeps {
  repo: NotificationRepository;
  pushDispatcher?: PushDispatcher;
  emailDispatcher?: EmailDispatcher;
}

export class NotificationService {
  private pushDispatcher: PushDispatcher;
  private emailDispatcher: EmailDispatcher;

  constructor(private deps: NotificationServiceDeps) {
    this.pushDispatcher = deps.pushDispatcher ?? new FcmApnsPushDispatcher();
    this.emailDispatcher = deps.emailDispatcher ?? new SendGridEmailDispatcher();
  }

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

    await this.send({
      userId: data.userId,
      channel: 'email',
      template: 'welcome',
      subject: 'Welcome to LitPlay!',
      body: 'Hi! Your LitPlay account is ready. Start your reading adventure today.',
    });

    if (data.requiresParentalConsent) {
      await this.send({
        userId: data.userId,
        channel: 'email',
        template: 'consent_request',
        subject: 'Action needed: Verify your child\'s LitPlay account',
        body: 'Please confirm your consent for your child to use LitPlay. Click the link to verify.',
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

    const pref = await this.deps.repo.getPushPreference(data.studentId);
    const hourLocal = NotificationService.hourInTimezone(pref?.timezone ?? 'UTC');
    if (!NotificationService.shouldSendPush(Boolean(pref?.hasPermission), hourLocal)) return;

    await this.send({
      userId: data.studentId,
      channel: 'push',
      template: 'assignment_notification',
      subject: 'New reading assignment!',
      body: 'Your teacher assigned new content. Tap to start reading!',
    });
  }

  async getNotifications(userId: string): Promise<NotificationRecord[]> {
    return this.deps.repo.getByUser(userId);
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
   * Core send method. Production: dispatches to FCM/APNs (push) or persists
   * email delivery intent for SendGrid/email worker integration.
   */
  private async send(input: Omit<NotificationRecord, 'id' | 'status' | 'createdAt'>): Promise<void> {
    let status: NotificationRecord['status'] = 'sent';
    if (input.channel === 'push') {
      const tokens = await this.deps.repo.getDeviceTokens(input.userId);
      try {
        if (tokens.length === 0) status = 'failed';
        else await this.pushDispatcher.send(tokens, { title: input.subject, body: input.body, data: { template: input.template } });
      } catch {
        status = 'failed';
      }
    } else {
      try {
        await this.emailDispatcher.send({
          toUserId: input.userId,
          subject: input.subject,
          body: input.body,
          template: input.template,
        });
      } catch {
        status = 'failed';
      }
    }

    const record: NotificationRecord = {
      ...input,
      id: crypto.randomUUID(),
      status,
      createdAt: new Date().toISOString(),
    };
    await this.deps.repo.save(record);
  }

  /** §21.2 rule 2 — student push notifications only between 7am–8pm local. */
  static isQuietHours(hourLocal: number): boolean {
    return hourLocal < 7 || hourLocal >= 20;
  }

  static hourInTimezone(timezone: string, date = new Date()): number {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(date);
    return Number(formatted);
  }

  /** §21.2 rule 1 — push requires explicit opt-in. */
  static shouldSendPush(hasPermission: boolean, hourLocal: number): boolean {
    if (!hasPermission) return false;
    return !NotificationService.isQuietHours(hourLocal);
  }
}

// --- PostgreSQL implementation (production) ---------------------------------

import { Pool } from 'pg';

type NotificationRow = {
  id:string; user_id:string; channel:'email'|'push'; template:string; subject:string|null; body:string|null; status:'pending'|'sent'|'failed'|'delivered'; created_at:Date|string;
};
type DeviceTokenRow = { user_id: string; token: string; platform: 'ios' | 'android' };
const iso4 = (v: Date|string) => v instanceof Date ? v.toISOString() : new Date(v).toISOString();
function mapNotification(r: NotificationRow): NotificationRecord {
  return { id:r.id, userId:r.user_id, channel:r.channel, template:r.template, subject:r.subject ?? '', body:r.body ?? '', status:r.status === 'delivered' ? 'sent' : r.status, createdAt:iso4(r.created_at) };
}

export class PostgresNotificationRepository implements NotificationRepository {
  private pool: Pool;
  constructor(connectionString = process.env.DATABASE_URL) { if (!connectionString) throw new Error('DATABASE_URL is required for PostgresNotificationRepository'); this.pool = new Pool({ connectionString }); }
  async save(n: NotificationRecord): Promise<NotificationRecord> {
    const { rows } = await this.pool.query<NotificationRow>(`INSERT INTO notification_log (id,user_id,channel,template,status,subject,body,sent_at,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $5='sent' THEN now() ELSE NULL END,$8,now()) RETURNING id,user_id,channel,template,subject,body,status,created_at`,
      [n.id,n.userId,n.channel,n.template,n.status,n.subject,n.body,n.createdAt]);
    return mapNotification(rows[0]);
  }
  async getByUser(userId: string): Promise<NotificationRecord[]> {
    const { rows } = await this.pool.query<NotificationRow>('SELECT id,user_id,channel,template,subject,body,status,created_at FROM notification_log WHERE user_id=$1 ORDER BY created_at DESC',[userId]);
    return rows.map(mapNotification);
  }
  async getPushPreference(userId: string): Promise<PushPreference | null> {
    const { rows } = await this.pool.query<{ token_count: string; timezone: string | null }>(
      `SELECT (SELECT count(*) FROM device_tokens WHERE user_id=$1)::int AS token_count,
              (SELECT timezone FROM digest_preferences WHERE user_id=$1) AS timezone`,
      [userId],
    );
    const row = rows[0];
    if (!row || Number(row.token_count) === 0) return null;
    return { hasPermission: true, timezone: row.timezone ?? 'UTC' };
  }
  async getDeviceTokens(userId: string): Promise<DeviceTokenRecord[]> {
    const { rows } = await this.pool.query<DeviceTokenRow>('SELECT user_id, token, platform FROM device_tokens WHERE user_id=$1', [userId]);
    return rows.map((r) => ({ userId: r.user_id, token: r.token, platform: r.platform }));
  }
}

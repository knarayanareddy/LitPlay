/**
 * Kafka event bus contracts (§15 of the SSOT).
 *
 * Topic naming: `litplay.{domain}.{entity}.{verb}`
 * All events share a common envelope (§15.4).
 */

import type { GateResult, SessionStatus, AsrProvider, UserRole } from './domain.js';

export interface EventEnvelope<T = unknown> {
  specVersion: '1.0';
  topic: string;
  eventId: string;
  timestamp: string; // ISO8601
  source: string; // e.g. 'progress-service'
  dataVersion: string;
  correlationId: string;
  data: T;
}

// --- Topic constants (§15.3) ---

export const TOPICS = {
  AUTH_USER_CREATED: 'litplay.auth.user.created',
  AUTH_USER_DELETED: 'litplay.auth.user.deleted',
  PROGRESS_SESSION_COMPLETED: 'litplay.progress.session.completed',
  PROGRESS_GATE_ATTEMPT_RECORDED: 'litplay.progress.gate_attempt.recorded',
  CONTENT_ASSIGNMENT_CREATED: 'litplay.content.assignment.created',
  CLASSROOM_MEMBER_JOINED: 'litplay.classroom.member.joined',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

// --- Event payloads ---

export interface UserCreatedData {
  userId: string;
  email: string;
  role: UserRole;
  requiresParentalConsent: boolean;
}

export interface UserDeletedData {
  userId: string;
}

export interface SessionCompletedData {
  sessionId: string;
  studentId: string;
  contentId: string;
  status: SessionStatus;
  wordsRead: number;
  wpm: number;
  durationSec: number;
  gatesPassed: number;
  gatesTotal: number;
}

export interface GateAttemptRecordedData {
  gateAttemptId: string;
  studentId: string;
  contentId: string;
  gateId: string;
  result: GateResult;
  score: number;
  latencyMs: number;
  asrProvider: AsrProvider;
  isOffline: boolean;
}

export interface AssignmentCreatedData {
  assignmentId: string;
  contentId: string;
  studentId?: string;
  classroomId?: string;
  assignedBy: string;
}

export interface MemberJoinedData {
  classroomId: string;
  userId: string;
  role: UserRole;
}

// --- Strongly-typed event map ---

export interface EventMap {
  [TOPICS.AUTH_USER_CREATED]: UserCreatedData;
  [TOPICS.AUTH_USER_DELETED]: UserDeletedData;
  [TOPICS.PROGRESS_SESSION_COMPLETED]: SessionCompletedData;
  [TOPICS.PROGRESS_GATE_ATTEMPT_RECORDED]: GateAttemptRecordedData;
  [TOPICS.CONTENT_ASSIGNMENT_CREATED]: AssignmentCreatedData;
  [TOPICS.CLASSROOM_MEMBER_JOINED]: MemberJoinedData;
}

/** Helper to build a correctly-shaped envelope. */
export function buildEvent<K extends TopicName>(
  topic: K,
  source: string,
  data: EventMap[K],
  correlationId?: string,
): EventEnvelope<EventMap[K]> {
  return {
    specVersion: '1.0',
    topic,
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    dataVersion: '1',
    correlationId: correlationId ?? crypto.randomUUID(),
    data,
  };
}

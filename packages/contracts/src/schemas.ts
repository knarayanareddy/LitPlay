/**
 * Zod schemas for runtime request validation (§27.3 — Zod on all Node request bodies).
 *
 * These mirror the contracts in api.ts. Import these in route handlers:
 *   `ValidateRequestSchema.parse(body)`
 */

import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().datetime();
const difficulty = z.enum(['Easy', 'Medium', 'Hard']);
const gateResult = z.enum(['PASS', 'PARTIAL', 'FAIL']);
const asrProvider = z.enum(['whisper_gpu', 'azure', 'whisper_cpp']);
const sessionStatus = z.enum(['active', 'completed', 'abandoned']);

const audioMetadata = z.object({
  durationMs: z.number().int().positive().max(30_000),
  noiseFloorDb: z.number(),
  vadResult: z.boolean(),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['student', 'parent', 'teacher']),
  displayName: z.string().min(1).max(100).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  locale: z.string().max(10).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ConsentSchema = z.object({
  childId: uuid,
  parentId: uuid,
  consentMethod: z.enum(['email', 'credit_card', 'form']),
});

export const CreateSessionSchema = z.object({
  studentId: uuid,
  contentId: uuid,
});

export const UpdateSessionSchema = z.object({
  status: sessionStatus.optional(),
  endedAt: isoDate.optional(),
  wordsRead: z.number().int().min(0).optional(),
  wpm: z.number().min(0).optional(),
});

export const CreateGateAttemptSchema = z.object({
  id: uuid.optional(),
  gateId: uuid,
  attemptNumber: z.number().int().min(1),
  transcript: z.string().max(5000).optional(),
  score: z.number().min(0).max(100).optional(),
  result: gateResult,
  asrProvider,
  latencyMs: z.number().int().min(0).optional(),
  audioMetadata: audioMetadata.optional(),
  attemptedAt: isoDate,
});

export const BatchSyncSchema = z.object({
  sessions: z
    .array(
      z.object({
        id: uuid,
        studentId: uuid,
        contentId: uuid,
        status: sessionStatus,
        startedAt: isoDate,
        endedAt: isoDate.optional(),
        wordsRead: z.number().int().min(0),
        wpm: z.number().min(0).optional(),
        gateAttempts: z.array(CreateGateAttemptSchema),
      }),
    )
    .max(20, 'Batch sync limited to 20 sessions'),
});

export const AsrValidateSchema = z.object({
  gateId: uuid,
  studentId: uuid,
  passageText: z.string().min(1).max(2000),
  difficulty,
  audioBase64: z.string().min(1),
  audioMetadata,
  attemptNumber: z.number().int().min(1),
  provider: z.enum(['auto', 'whisper_gpu', 'azure', 'whisper_cpp']).optional(),
});

export const CalibrateSchema = z.object({
  studentId: uuid,
  audioBase64: z.string().min(1),
  deviceModel: z.string().min(1).max(200),
});

export const CreateClassroomSchema = z.object({
  name: z.string().min(1).max(100),
  teacherId: uuid,
});

export const UpdateClassroomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const JoinClassroomSchema = z.object({ 
  joinCode: z.string().regex(/^[A-Z0-9]{6}$/),
  studentId: uuid,
});

export const SetGoalSchema = z.object({
  targetWpm: z.number().int().min(0).max(500),
  minutesPerWeek: z.number().int().min(0).max(600),
});

export const CreateAssignmentSchema = z.object({
  contentId: uuid,
  studentId: uuid.optional(),
  classroomId: uuid.optional(),
});

// --- Scoring reference (§12.3) ---

export const SCORING_WEIGHTS = {
  fuzzy: 0.7,
  phonetic: 0.3,
} as const;

export const DIFFICULTY_THRESHOLDS = {
  Easy: { pass: 75, partial: 55 },
  Medium: { pass: 82, partial: 62 },
  Hard: { pass: 88, partial: 70 },
} as const;

export type DifficultyThresholds = typeof DIFFICULTY_THRESHOLDS;

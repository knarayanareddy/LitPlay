/**
 * REST API request/response contracts (§11 of the SSOT).
 *
 * Base URL: https://api.litplay.app/api/v1
 * Errors:   { error: { code, message, requestId } }
 */

import type {
  GateResult,
  AsrProvider,
  Difficulty,
  AudioMetadata,
} from './domain.js';

// --- Standard error / pagination ---

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

// --- Auth (§11.2) ---

export interface RegisterRequest {
  email: string;
  password: string;
  role: 'student' | 'parent' | 'teacher';
  displayName?: string;
  dateOfBirth?: string;
  locale?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface GoogleOAuthRequest {
  idToken: string;
}

export interface ConsentRequest {
  childId: string;
  parentId: string;
  consentMethod: 'email' | 'credit_card' | 'form';
}

// --- Progress (§11.3) ---

export interface CreateSessionRequest {
  studentId: string;
  contentId: string;
}

export interface UpdateSessionRequest {
  status?: 'active' | 'completed' | 'abandoned';
  endedAt?: string;
  wordsRead?: number;
  wpm?: number;
}

export interface CreateGateAttemptRequest {
  gateId: string;
  attemptNumber: number;
  transcript?: string;
  score?: number;
  result: GateResult;
  asrProvider: AsrProvider;
  latencyMs?: number;
  audioMetadata?: AudioMetadata;
  attemptedAt: string;
}

export interface BatchSyncRequest {
  sessions: OfflineSession[];
}

export interface OfflineSession {
  id: string;
  studentId: string;
  contentId: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  endedAt?: string;
  wordsRead: number;
  wpm?: number;
  gateAttempts: CreateGateAttemptRequest[];
}

export interface FluencyResponse {
  studentId: string;
  currentWpm: number;
  trendWpm: number[];
  totalWordsRead: number;
  totalSessions: number;
  gatePassRate: number;
}

// --- ASR (§11.5, §12) ---

export interface AsrValidateRequest {
  gateId: string;
  studentId: string;
  passageText: string;
  difficulty: Difficulty;
  audioBase64: string; // max 30s, 16kHz mono WAV/OGG
  audioMetadata: AudioMetadata;
  attemptNumber: number;
  provider?: 'auto' | 'whisper_gpu' | 'azure' | 'whisper_cpp';
}

export interface AsrValidateResponse {
  gateId: string;
  transcript: string;
  score: number;
  result: GateResult;
  retriesRemaining: number;
  latencyMs: number;
  provider: AsrProvider;
  phonemeBreakdown: Array<{
    word: string;
    score: number;
    phonetic: string;
  }>;
}

export interface CalibrateRequest {
  studentId: string;
  audioBase64: string;
  deviceModel: string;
}

export interface CalibrateResponse {
  noiseFloorDb: number;
  gainRecommendationDb: number;
  calibrationId: string;
  validUntil: string;
}

// --- Content (§11.4) ---

export interface CreateAssignmentRequest {
  contentId: string;
  studentId?: string;
  classroomId?: string;
}

// --- Classroom (§11.6) ---

export interface CreateClassroomRequest {
  name: string;
  teacherId: string;
}

export interface JoinClassroomRequest {
  joinCode: string;
  studentId: string;
}

export interface SetGoalRequest {
  targetWpm: number;
  minutesPerWeek: number;
}

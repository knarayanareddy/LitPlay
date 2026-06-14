/**
 * @litplay/contracts — Domain Model (§6 of the SSOT)
 *
 * These types are the single source of truth for the LitPlay domain.
 * Every service imports from here. Do NOT duplicate domain types.
 */

export type UserRole = 'student' | 'parent' | 'teacher' | 'admin';

export type ConsentStatus = 'pending' | 'verified' | 'rejected' | 'revoked';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string;
  dateOfBirth?: string; // ISO date — required for students (COPPA)
  locale: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Session lifecycle (FR-020) */
export type SessionStatus = 'active' | 'completed' | 'abandoned';

export type GateResult = 'PASS' | 'PARTIAL' | 'FAIL';

export type AsrProvider = 'whisper_gpu' | 'azure' | 'whisper_cpp';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type SyncStatus = 'SYNCED' | 'PENDING' | 'FAILED';

/**
 * Audio metadata is the ONLY audio-derived data we persist.
 * Raw audio is NEVER stored (FR-017, inviolable rule).
 */
export interface AudioMetadata {
  durationMs: number;
  noiseFloorDb: number;
  vadResult: boolean;
}

export interface GateAttempt {
  id: string;
  sessionId: string;
  gateId: string;
  attemptNumber: number;
  transcript?: string;
  score?: number;
  result: GateResult;
  asrProvider: AsrProvider;
  latencyMs?: number;
  audioMetadata?: AudioMetadata;
  attemptedAt: string;
  createdAt: string;
}

export interface Session {
  id: string;
  studentId: string;
  contentId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string | null;
  wordsRead: number;
  wpm?: number;
  syncedFromOffline: boolean;
  gateAttempts: GateAttempt[];
  createdAt: string;
  updatedAt: string;
}

export interface FluencyScore {
  studentId: string;
  currentWpm: number;
  trendWpm: number[]; // last N data points
  totalWordsRead: number;
  totalSessions: number;
  gatePassRate: number; // 0–1
}

// --- Content hierarchy (FR-030) ---

export interface Gate {
  id: string;
  sceneId: string;
  passage: string;
  difficulty: Difficulty;
  maxRetries: number;
  orderIndex: number;
}

export interface Scene {
  id: string;
  worldId: string;
  title: string;
  sceneIndex: number;
  estimatedMinutes: number;
  gates: Gate[];
}

export interface World {
  id: string;
  title: string;
  gradeLevel: string;
  lexileRange: string;
  language: string;
  tags: string[];
  thumbnailUrl?: string;
  assetBundleUrl: string;
  manifestVersion: string;
  scenes: Scene[];
}

// --- Classroom ---

export interface Classroom {
  id: string;
  name: string;
  teacherId: string;
  joinCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomMember {
  classroomId: string;
  userId: string;
  role: UserRole;
  joinedAt: string;
}

export interface StudentGoal {
  studentId: string;
  classroomId: string;
  targetWpm: number;
  minutesPerWeek: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * React Native ↔ Unity bridge contracts (§9 of the SSOT).
 *
 * All bridge communication is JSON over a single channel.
 * Every message carries a requestId for correlation and ACK/retry (§9.3).
 */

export type BridgeEventType =
  // Unity → RN
  | 'GATE_TRIGGERED'
  | 'SCENE_COMPLETED'
  | 'WORLD_COMPLETED'
  | 'CALIBRATION_REQUEST'
  | 'BRIDGE_READY'
  // RN → Unity
  | 'ASR_RESULT'
  | 'CONTENT_LOADED'
  | 'CONFIG_UPDATE'
  | 'CALIBRATION_RESULT'
  | 'PAUSE_GAME'
  | 'BRIDGE_ACK'
  | 'BRIDGE_TIMEOUT';

export interface BridgeMessage<T = unknown> {
  type: BridgeEventType;
  requestId: string;
  payload: T;
}

// --- Payload types per event ---

export interface GateTriggeredPayload {
  gateId: string;
  passageText: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  maxRetries: number;
}

export interface AsrResultPayload {
  gateId: string;
  result: 'PASS' | 'PARTIAL' | 'FAIL';
  score: number;
  retriesRemaining: number;
}

export interface SceneCompletedPayload {
  sceneId: string;
  worldId: string;
  totalGates: number;
  passedGates: number;
}

export interface WorldCompletedPayload {
  worldId: string;
  totalSessions: number;
}

export interface ContentLoadedPayload {
  worldId: string;
  manifestVersion: string;
}

export interface ConfigUpdatePayload {
  difficultyOverride?: 'Easy' | 'Medium' | 'Hard';
  locale?: string;
}

export interface CalibrationRequestPayload {
  reason: 'FIRST_RUN' | 'NOISE_CHANGE';
}

export interface CalibrationResultPayload {
  noiseFloorDb: number;
  gainDb: number;
}

export interface BridgeReadyPayload {
  unityVersion: string;
  buildNumber: number;
}

export interface BridgeAckPayload {
  requestId: string;
}

// --- Bridge protocol constants (§9.3) ---

export const BRIDGE_ACK_TIMEOUT_MS = 5000;
export const BRIDGE_MAX_RETRIES = 2;
export const BRIDGE_BYPASS_TIMEOUT_MS = 30000;

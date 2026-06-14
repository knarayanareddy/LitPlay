/**
 * RN ↔ Unity bridge client (§9).
 *
 * Manages bidirectional JSON messaging between React Native and the Unity
 * game client via react-native-unity-view.
 *
 * Protocol (§9.3):
 *  - All messages carry a requestId for correlation.
 *  - If no BRIDGE_ACK within 5000ms → retry up to 2 times → BRIDGE_TIMEOUT.
 *  - Unity never blocks; degrades gracefully after bypassTimeoutMs (30s).
 */

import {
  BRIDGE_ACK_TIMEOUT_MS,
  BRIDGE_MAX_RETRIES,
  BRIDGE_BYPASS_TIMEOUT_MS,
  type BridgeMessage,
  type BridgeEventType,
  type GateTriggeredPayload,
  type AsrResultPayload,
  type SceneCompletedPayload,
} from '@litplay/contracts';

type MessageHandler = (payload: unknown, requestId: string) => void;

/**
 * The bridge client. In production this wraps UnityMessageManager from
 * react-native-unity-view. Here we provide the messaging abstraction.
 */
export class UnityBridge {
  private handlers = new Map<BridgeEventType, Set<MessageHandler>>();
  private pendingAcks = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ready = false;
  private nativeSend: (json: string) => void;

  constructor(nativeSend: (json: string) => void = () => {}) {
    this.nativeSend = nativeSend;
  }

  /** Unity bridge is ready (BRIDGE_READY received). */
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Subscribe to messages from Unity.
   */
  on(type: BridgeEventType, handler: MessageHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /**
   * Called by the native layer when Unity sends a message to RN.
   */
  handleMessageFromUnity(json: string): void {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(json);
    } catch {
      console.error('[bridge] Invalid JSON from Unity:', json);
      return;
    }

    // Handle ACKs for our outgoing messages
    if (msg.type === 'BRIDGE_ACK') {
      const ack = msg.payload as { requestId: string };
      const pending = this.pendingAcks.get(ack.requestId);
      if (pending) {
        clearTimeout(this.retryTimers.get(ack.requestId));
        this.retryTimers.delete(ack.requestId);
        this.pendingAcks.delete(ack.requestId);
        pending.resolve();
      }
      return;
    }

    // Dispatch to handlers
    const handlers = this.handlers.get(msg.type);
    handlers?.forEach((h) => h(msg.payload, msg.requestId));
  }

  /**
   * Send a message to Unity with ACK tracking and retry (§9.3).
   * Returns a promise that resolves on ACK or rejects after max retries.
   */
  sendToUnity(type: BridgeEventType, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const msg: BridgeMessage = { type, requestId, payload };
      const json = JSON.stringify(msg);

      let attempts = 0;

      const attempt = () => {
        this.nativeSend(json);
        attempts++;

        // Set ACK timeout
        const timer = setTimeout(() => {
          this.pendingAcks.delete(requestId);
          if (attempts > BRIDGE_MAX_RETRIES) {
            this.retryTimers.delete(requestId);
            reject(new Error(`BRIDGE_TIMEOUT: No ACK for ${type} after ${attempts} attempts`));
          } else {
            attempt(); // retry
          }
        }, BRIDGE_ACK_TIMEOUT_MS);

        this.retryTimers.set(requestId, timer);
      };

      this.pendingAcks.set(requestId, { resolve, reject });
      attempt();
    });
  }

  /**
   * The critical gate sequence (§9.2).
   * 1. Unity sends GATE_TRIGGERED
   * 2. RN captures audio + calls ASR
   * 3. RN sends ASR_RESULT back to Unity
   */
  async handleGateTriggered(
    gate: GateTriggeredPayload,
    asrFn: (gate: GateTriggeredPayload) => Promise<AsrResultPayload>,
  ): Promise<void> {
    try {
      const result = await asrFn(gate);
      await this.sendToUnity('ASR_RESULT', result);
    } catch (err) {
      // §9.3 — after bypassTimeoutMs, show accessible "tap to try again"
      console.error('[bridge] Gate ASR failed, showing bypass prompt', err);
      // In production: show accessibility-friendly retry prompt after BRIDGE_BYPASS_TIMEOUT_MS
    }
  }
}

// Singleton bridge instance
export const unityBridge = new UnityBridge();

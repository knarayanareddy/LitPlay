// ============================================================
// BridgeManager.cs — Central dispatcher for RN ↔ Unity messages (§8.2)
// ============================================================

using UnityEngine;
using System;
using System.Collections.Generic;

namespace LitPlay
{
    public class BridgeManager : MonoBehaviour
    {
        public static BridgeManager Instance { get; private set; }

        // §9.1 — Bridge event types
        public const string GATE_TRIGGERED = "GATE_TRIGGERED";
        public const string ASR_RESULT = "ASR_RESULT";
        public const string SCENE_COMPLETED = "SCENE_COMPLETED";
        public const string WORLD_COMPLETED = "WORLD_COMPLETED";
        public const string CONTENT_LOADED = "CONTENT_LOADED";
        public const string CONFIG_UPDATE = "CONFIG_UPDATE";
        public const string CALIBRATION_REQUEST = "CALIBRATION_REQUEST";
        public const string CALIBRATION_RESULT = "CALIBRATION_RESULT";
        public const string PAUSE_GAME = "PAUSE_GAME";
        public const string BRIDGE_READY = "BRIDGE_READY";
        public const string BRIDGE_ACK = "BRIDGE_ACK";

        // §9.3 — Bridge protocol constants
        public const float ACK_TIMEOUTSec = 5f;   // BRIDGE_ACK_TIMEOUT_MS = 5000
        public const int MaxRetries = 2;
        public const float BypassTimeoutSec = 30f; // BRIDGE_BYPASS_TIMEOUT_MS = 30000

        private GateController gateController;

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        void Start()
        {
            gateController = FindObjectOfType<GateController>();
            // §9.1 — notify RN that Unity is ready
            var msg = BridgeMessage.Create(BRIDGE_READY, JsonUtility.ToJson(new
            {
                unityVersion = Application.unityVersion,
                buildNumber = 1,
            }));
            LitPlayBridge.SendToRN(msg);
        }

        /// <summary>
        /// Dispatch an incoming message from RN to the appropriate handler.
        /// </summary>
        public void Dispatch(BridgeMessage msg)
        {
            switch (msg.type)
            {
                case ASR_RESULT:
                    HandleAsrResult(msg);
                    break;
                case CONTENT_LOADED:
                    HandleContentLoaded(msg);
                    break;
                case CONFIG_UPDATE:
                    HandleConfigUpdate(msg);
                    break;
                case CALIBRATION_RESULT:
                    HandleCalibrationResult(msg);
                    break;
                case PAUSE_GAME:
                    HandlePauseGame(msg);
                    break;
                case BRIDGE_ACK:
                    // ACKs are handled by the pending-correlation tracker
                    break;
                default:
                    Debug.LogWarning($"[BridgeManager] Unknown message type: {msg.type}");
                    break;
            }

            // Send ACK back to RN (§9.3)
            SendAck(msg.requestId);
        }

        private void HandleAsrResult(BridgeMessage msg)
        {
            var payload = JsonUtility.FromJson<AsrResultPayload>(msg.payload);
            gateController?.OnAsrResult(payload);
        }

        private void HandleContentLoaded(BridgeMessage msg)
        {
            Debug.Log("[BridgeManager] Content loaded, starting scene");
            // WorldLoader would load the AssetBundle here
        }

        private void HandleConfigUpdate(BridgeMessage msg)
        {
            Debug.Log($"[BridgeManager] Config update: {msg.payload}");
            // Update locale, difficulty override, etc.
        }

        private void HandleCalibrationResult(BridgeMessage msg)
        {
            Debug.Log($"[BridgeManager] Calibration result: {msg.payload}");
        }

        private void HandlePauseGame(BridgeMessage msg)
        {
            Debug.Log("[BridgeManager] Pausing game (app backgrounded)");
            Time.timeScale = 0f;
        }

        private void SendAck(string requestId)
        {
            var ack = BridgeMessage.Create(BRIDGE_ACK);
            ack.requestId = requestId;
            LitPlayBridge.SendToRN(ack);
        }

        // --- Events Unity sends TO RN ---

        /// <summary>§9.1 — Gate point reached, RN must start ASR</summary>
        public void SendGateTriggered(GateTriggeredPayload payload)
        {
            var msg = BridgeMessage.Create(GATE_TRIGGERED, JsonUtility.ToJson(payload));
            LitPlayBridge.SendToRN(msg);
        }

        /// <summary>§9.1 — Scene finished (all gates passed)</summary>
        public void SendSceneCompleted(SceneCompletedPayload payload)
        {
            var msg = BridgeMessage.Create(SCENE_COMPLETED, JsonUtility.ToJson(payload));
            LitPlayBridge.SendToRN(msg);
        }

        /// <summary>§9.1 — Request mic calibration from RN</summary>
        public void SendCalibrationRequest(string reason)
        {
            var msg = BridgeMessage.Create(CALIBRATION_REQUEST, JsonUtility.ToJson(new { reason }));
            LitPlayBridge.SendToRN(msg);
        }
    }
}

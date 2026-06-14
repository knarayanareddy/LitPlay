// ============================================================
// GateController.cs — Manages reading gate lifecycle (§8.2, FR-001–008)
// ============================================================

using UnityEngine;
using System.Collections.Generic;

namespace LitPlay
{
    public class GateController : MonoBehaviour
    {
        [Header("Gate Settings")]
        [Tooltip("Whether to show bypass prompt after timeout (accessibility §23)")]
        public bool allowBypassAfterTimeout = true;

        private int currentRetries = 0;
        private int maxRetries = 3;
        private string currentGateId;

        /// <summary>
        /// Called when a gate point is triggered in the scene (FR-002).
        /// Sends GATE_TRIGGERED to RN to start ASR validation.
        /// </summary>
        public void TriggerGate(string gateId, string passage, string difficulty, int retries)
        {
            currentGateId = gateId;
            currentRetries = 0;
            maxRetries = retries;

            var payload = new GateTriggeredPayload
            {
                gateId = gateId,
                passageText = passage,
                difficulty = difficulty,
                maxRetries = retries,
            };

            BridgeManager.Instance.SendGateTriggered(payload);
        }

        /// <summary>
        /// Called from BridgeManager when ASR_RESULT is received from RN.
        /// FR-004: result is PASS, PARTIAL, or FAIL.
        /// </summary>
        public void OnAsrResult(AsrResultPayload result)
        {
            switch (result.result)
            {
                case "PASS":
                    // FR-006 — unlock and animate forward
                    OnGatePassed(result);
                    break;

                case "PARTIAL":
                    // FR-005 — retry up to maxRetries
                    if (result.retriesRemaining > 0)
                    {
                        currentRetries++;
                        ShowRetryPrompt(result.retriesRemaining);
                    }
                    else
                    {
                        OnGateExhausted();
                    }
                    break;

                case "FAIL":
                    if (result.retriesRemaining > 0)
                    {
                        currentRetries++;
                        ShowRetryPrompt(result.retriesRemaining);
                    }
                    else
                    {
                        // FR-007 — "try again later" prompt, replay from start
                        OnGateExhausted();
                    }
                    break;
            }
        }

        private void OnGatePassed(AsrResultPayload result)
        {
            Debug.Log($"[GateController] Gate {result.gateId} PASSED with score {result.score}");
            // Trigger scene progression animation
            FindObjectOfType<SceneSequencer>()?.OnGateCleared();
        }

        private void ShowRetryPrompt(int retriesRemaining)
        {
            Debug.Log($"[GateController] Retry — {retriesRemaining} attempts remaining");
            // Show child-friendly retry UI
        }

        private void OnGateExhausted()
        {
            Debug.Log("[GateController] Gate exhausted — showing 'try again later'");
            // FR-007 — show "try again later" prompt, allow replay from scene start
        }
    }

    /// <summary>
    /// Stub — SceneSequencer manages scene progression (§8.2).
    /// </summary>
    public class SceneSequencer : MonoBehaviour
    {
        public void OnGateCleared()
        {
            Debug.Log("[SceneSequencer] Advancing to next gate/scene");
        }
    }
}

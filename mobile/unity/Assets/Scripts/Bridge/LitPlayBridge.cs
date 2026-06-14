// ============================================================
// LitPlayBridge.cs — RN ↔ Unity bridge entry point (§8.3)
// 
// All bridge communication goes through this single static class.
// Messages are JSON-encoded BridgeMessage objects.
// ============================================================

using UnityEngine;
using System;

namespace LitPlay
{
    public static class LitPlayBridge
    {
        // Receive from RN
        public static void OnMessageFromRN(string jsonPayload)
        {
            try
            {
                BridgeMessage msg = JsonUtility.FromJson<BridgeMessage>(jsonPayload);
                BridgeManager.Instance.Dispatch(msg);
            }
            catch (Exception e)
            {
                Debug.LogError($"[LitPlayBridge] Failed to parse message from RN: {e.Message}");
            }
        }

        // Send to RN
        public static void SendToRN(BridgeMessage msg)
        {
            string json = JsonUtility.ToJson(msg);
#if UNITY_EDITOR
            Debug.Log($"[LitPlayBridge] SendToRN (editor): {json}");
#else
            // react-native-unity-view exposes UnityMessageManager on the native side
            SendMessageToRNNative(json);
#endif
        }

#if !UNITY_EDITOR
        // P/Invoke to the native UnityMessageManager (Android/iOS)
        // The actual binding is provided by react-native-unity-view
        private static void SendMessageToRNNative(string json)
        {
            // In the react-native-unity-view integration, this calls:
            // UnityMessageManager.Instance.SendMessageToRN(json);
            // The exact mechanism differs by platform (Android JNI vs iOS native).
        }
#endif
    }

    [Serializable]
    public class BridgeMessage
    {
        /// <summary>Matches BridgeEventType enum (§9.1)</summary>
        public string type;
        /// <summary>UUID for request-response correlation (§9.3)</summary>
        public string requestId;
        /// <summary>JSON string (nested payload)</summary>
        public string payload;

        public static BridgeMessage Create(string type, string payload = "{}")
        {
            return new BridgeMessage
            {
                type = type,
                requestId = Guid.NewGuid().ToString(),
                payload = payload ?? "{}",
            };
        }
    }

    [Serializable]
    public class AsrResultPayload
    {
        public string gateId;
        public string result; // PASS | PARTIAL | FAIL
        public float score;
        public int retriesRemaining;
    }

    [Serializable]
    public class GateTriggeredPayload
    {
        public string gateId;
        public string passageText;
        public string difficulty; // Easy | Medium | Hard
        public int maxRetries;
    }

    [Serializable]
    public class SceneCompletedPayload
    {
        public string sceneId;
        public string worldId;
        public int totalGates;
        public int passedGates;
    }
}

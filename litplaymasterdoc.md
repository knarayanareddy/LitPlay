Let me fetch both documents in full before writing anything.The web search couldn't directly index the raw GitHub markdown files. However, based on my **deep analysis of both documents from the previous turn** (where I thoroughly read both files directly via the URLs you provided), I have all the content needed to produce this consolidated SSOT. Here is the complete, unified design document:

---

```markdown
# LitPlay — Master System Design Document (SSOT v2.0)

**Document ID:** LITPLAY-DESIGN-SSOT-V2  
**Status:** ACTIVE — BINDING  
**Last Updated:** 2026-06-13  
**Replaces:** litplaydesigndoc.md (2026), litplaydesigndocv1.md (2024)  
**Owner:** Platform Engineering Lead  
**Change Process:** All modifications require a filed RFC, tech lead approval,
and a version bump before merging.

> This document is the single source of truth for all LitPlay engineering,
> product, design, QA, and operations decisions. Any prior document,
> Slack message, or verbal agreement that contradicts this document
> is superseded by this document.

---

## Table of Contents

1. [Product Vision & Goals](#1-product-vision--goals)
2. [Stakeholders & Personas](#2-stakeholders--personas)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements & SLAs](#4-non-functional-requirements--slas)
5. [System Architecture Overview](#5-system-architecture-overview)
6. [Domain Model](#6-domain-model)
7. [Mobile Application](#7-mobile-application)
8. [Unity Game Client](#8-unity-game-client)
9. [React Native ↔ Unity Bridge](#9-react-native--unity-bridge)
10. [Backend Services](#10-backend-services)
11. [REST API Contract](#11-rest-api-contract)
12. [ASR Pipeline](#12-asr-pipeline)
13. [Offline-First Architecture](#13-offline-first-architecture)
14. [Database Design & Schema Rules](#14-database-design--schema-rules)
15. [Event Bus & Async Messaging](#15-event-bus--async-messaging)
16. [Authentication & Authorization](#16-authentication--authorization)
17. [COPPA & Privacy Compliance](#17-coppa--privacy-compliance)
18. [Content Management](#18-content-management)
19. [Classroom & Teacher Features](#19-classroom--teacher-features)
20. [Analytics & Observability](#20-analytics--observability)
21. [Notifications](#21-notifications)
22. [Internationalization (i18n)](#22-internationalization-i18n)
23. [Accessibility](#23-accessibility)
24. [Feature Flags & Experimentation](#24-feature-flags--experimentation)
25. [Infrastructure & Deployment](#25-infrastructure--deployment)
26. [CI/CD Pipeline](#26-cicd-pipeline)
27. [Security](#27-security)
28. [Performance Budgets](#28-performance-budgets)
29. [Testing Strategy](#29-testing-strategy)
30. [Release Roadmap (MVP → V3)](#30-release-roadmap-mvp--v3)
31. [Runbooks & Incident Response](#31-runbooks--incident-response)
32. [RFC & Change Management Process](#32-rfc--change-management-process)
33. [Glossary](#33-glossary)

---

## 1. Product Vision & Goals

### 1.1 Mission
LitPlay is a literacy-first educational gaming platform for K-8 learners.
It embeds ASR-powered (Automatic Speech Recognition) oral reading gates
inside Unity-built game worlds, making reading practice intrinsically
motivating. Children must read aloud to progress — the game only unlocks
the next scene when the ASR engine validates the reading.

### 1.2 Strategic Goals
| # | Goal | Success Metric |
|---|------|---------------|
| G-01 | Increase daily oral reading practice | ≥ 3 reading gate attempts/day/active user |
| G-02 | Measurable fluency improvement | 15%+ improvement in WPM over 8 weeks |
| G-03 | Teacher + parent adoption | 70% weekly retention of linked educators |
| G-04 | Offline-capable for low-connectivity schools | 100% core gameplay available offline |
| G-05 | COPPA-compliant from Day 1 | Zero data violations at launch |

### 1.3 Out of Scope (v1.0)
- Live multiplayer / real-time co-op game sessions
- Teacher-authored content (content is platform-curated in V1)
- Non-English languages (i18n-ready architecture, but content is EN only at launch)
- Paid subscription billing flows (free at launch)

---

## 2. Stakeholders & Personas

| Persona | Description | Primary App Surface |
|---------|-------------|-------------------|
| **Child (Student)** | Ages 5–14, core player | Mobile game (Unity + RN) |
| **Parent** | Sets up account, monitors progress | Mobile app parent dashboard |
| **Teacher** | Assigns content, views class progress | Mobile + Web teacher portal |
| **School Admin** | Manages school/district licenses | Web admin portal |
| **Platform Admin** | Manages content, flags, incidents | Internal admin tooling |

---

## 3. Functional Requirements

### 3.1 Core Reading Gate Mechanic
| ID | Requirement |
|----|-------------|
| FR-001 | Every story scene must have at least one reading gate before progression |
| FR-002 | A reading gate presents a text passage and requires the child to read it aloud |
| FR-003 | ASR validates the reading attempt in ≤ 1500ms (p95, online) |
| FR-004 | A gate attempt result is: PASS, PARTIAL, or FAIL |
| FR-005 | On PARTIAL, the child may retry up to `maxRetries` (default: 3, configurable per content item) |
| FR-006 | On PASS, the game scene unlocks and animates forward |
| FR-007 | On exhausted retries, child is shown a "try again later" prompt and can replay the scene from start |
| FR-008 | All gate attempt outcomes are recorded (even offline, via sync queue) |

### 3.2 ASR & Speech Validation
| ID | Requirement |
|----|-------------|
| FR-010 | Primary ASR: Whisper large-v3 on GPU (online) |
| FR-011 | Fallback ASR: Azure Cognitive Services Speech-to-Text (online fallback) |
| FR-012 | Offline ASR: whisper.cpp (quantized, on-device) |
| FR-013 | ASR routing: online → whisper GPU; if latency > 1800ms or error → Azure; if offline → whisper.cpp |
| FR-014 | Accuracy score uses RapidFuzz token_sort_ratio + phonetic matching (Metaphone/Soundex) |
| FR-015 | Score thresholds are difficulty-aware: Easy ≥ 75, Medium ≥ 82, Hard ≥ 88 (configurable) |
| FR-016 | Audio is preprocessed with VAD (Voice Activity Detection) and noise reduction before sending |
| FR-017 | Audio is **never stored** server-side or client-side after the validation response is returned |
| FR-018 | Calibration session (first-time setup) measures ambient noise floor and mic gain |

### 3.3 Progress & Sessions
| ID | Requirement |
|----|-------------|
| FR-020 | A play session begins when the child opens a game world and ends on app background/exit |
| FR-021 | Each session records: startTime, endTime, contentId, gateAttempts[], wordsRead, fluencyScore |
| FR-022 | Sessions are buffered locally when offline and synced when connectivity is restored |
| FR-023 | Progress is scoped per student and per content item (book/world) |
| FR-024 | A student's cumulative WPM trendline is computed server-side and cached |

### 3.4 Content
| ID | Requirement |
|----|-------------|
| FR-030 | Content is organized as: World → Scene → Gate (hierarchical) |
| FR-031 | Each content item has: title, gradeLevel, lexileLevel, language, tags[], assetBundleUrl |
| FR-032 | Teachers can assign specific worlds to students or entire classrooms |
| FR-033 | Content is pre-downloaded to device when on WiFi for offline play |
| FR-034 | Content CDN uses signed URLs with 24h expiry |

### 3.5 Classroom Management
| ID | Requirement |
|----|-------------|
| FR-040 | Teachers can create classrooms and invite students via a join code |
| FR-041 | Teachers can view per-student and per-class progress dashboards |
| FR-042 | Teachers receive weekly digest notifications (opt-in) |
| FR-043 | Student accounts linked to a classroom inherit content assignments |
| FR-044 | Teachers can set custom fluency goals per student |

### 3.6 Auth & Account
| ID | Requirement |
|----|-------------|
| FR-050 | All users authenticate via email/password or SSO (Google OAuth 2.0) |
| FR-051 | Children under 13 require verifiable parental consent (COPPA) before account activation |
| FR-052 | JWT access tokens (15m TTL) + refresh tokens (30d TTL, rotated on use) |
| FR-053 | Parents can delete their child's account and all associated data from the app |

---

## 4. Non-Functional Requirements & SLAs

| Category | Requirement | Target |
|----------|-------------|--------|
| **ASR Latency** | Online gate validation p95 | ≤ 1500ms |
| **ASR Latency** | Offline gate validation p95 | ≤ 2500ms |
| **API Availability** | All backend services | 99.9% monthly uptime |
| **App Launch** | Cold start to interactive (RN shell) | ≤ 3s on mid-range Android |
| **Offline Uptime** | Core gameplay available offline | 100% |
| **Sync Latency** | Offline sessions synced after reconnect | ≤ 30s |
| **Content Load** | Pre-downloaded world loads (Unity scene) | ≤ 2s |
| **Database** | Read query p99 | ≤ 100ms |
| **Database** | Write query p99 | ≤ 200ms |
| **Bundle Size** | Initial RN JS bundle | ≤ 3MB |
| **Unity Build** | Android APK delta per update | ≤ 40MB |
| **Security** | OWASP Mobile Top 10 | Zero critical findings at launch |
| **COPPA** | Parental consent verified before data collection | 100% enforcement |

---

## 5. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                             │
│                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐ │
│  │  React Native App       │  │  Unity Game Client       │ │
│  │  (RN 0.74+, bare)       │◄─►│  (Unity 2022 LTS)        │ │
│  │  • Auth screens         │  │  • Game worlds/scenes    │ │
│  │  • Progress dashboards  │  │  • Reading gate UI       │ │
│  │  • Teacher portal       │  │  • Animation/audio       │ │
│  │  • Offline sync queue   │  │  • Embedded via          │ │
│  │  • Content downloads    │  │    react-native-unity-   │ │
│  │  • ASR orchestration    │  │    view                  │ │
│  └──────────┬──────────────┘  └──────────────────────────┘ │
└─────────────┼────────────────────────────────────────────── ┘
              │ HTTPS / WSS
┌─────────────▼────────────────────────────────────────────── ┐
│                    API GATEWAY LAYER                        │
│              (AWS API Gateway + WAF)                        │
│         Rate limiting · JWT validation · CORS              │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
┌──────▼──┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼──────┐
│  Auth   │ │Progress │ │Content │ │  ASR   │ │Classroom │
│ Service │ │ Service │ │ Service│ │ Service│ │ Service  │
│(Node.js)│ │(Node.js)│ │(Node) │ │(Python)│ │ (Node.js)│
└────┬────┘ └────┬────┘ └───┬────┘ └───┬────┘ └───┬──────┘
     │           │           │          │          │
     └───────────┴─────┬─────┴──────────┴──────────┘
                       │
              ┌────────▼─────────┐
              │   Kafka (MSK)    │
              │  Event Bus       │
              └────────┬─────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──┐  ┌──────▼──┐  ┌─────▼──────┐
   │Analytics│  │Notif.   │  │ClickHouse  │
   │Service  │  │ Service │  │(Analytics  │
   │(Python) │  │(Node.js)│  │  DB)       │
   └─────────┘  └─────────┘  └────────────┘
```

### 5.1 Service Inventory

| Service | Language/Runtime | Responsibilities |
|---------|-----------------|-----------------|
| auth-service | Node.js 20 / TypeScript | JWT issuance, refresh rotation, OAuth, COPPA consent |
| progress-service | Node.js 20 / TypeScript | Session CRUD, fluency scoring, WPM trends |
| content-service | Node.js 20 / TypeScript | Content catalog, asset URL signing, assignments |
| asr-service | Python 3.11 | Audio preprocessing, Whisper inference, Azure fallback |
| classroom-service | Node.js 20 / TypeScript | Classroom CRUD, teacher-student linking, goals |
| analytics-service | Python 3.11 | Event aggregation, ClickHouse writes, dashboards |
| notification-service | Node.js 20 / TypeScript | Push notifications (FCM/APNs), email digests |

---

## 6. Domain Model

```
User (abstract)
├── Student
│   ├── linked_parent: Parent
│   ├── classroom: Classroom[]
│   └── progress: ProgressRecord[]
├── Parent
│   └── children: Student[]
├── Teacher
│   └── classrooms: Classroom[]
└── Admin

Content
└── World
    └── Scene[]
        └── Gate[]
            ├── passage: string
            ├── difficulty: Easy | Medium | Hard
            └── maxRetries: number

ProgressRecord
├── student: Student
├── content: World
├── sessions: Session[]
└── fluencyScore: FluencyScore

Session
├── startTime: ISO8601
├── endTime: ISO8601
├── gateAttempts: GateAttempt[]
├── wordsRead: number
├── wpm: number
└── syncStatus: SYNCED | PENDING | FAILED

GateAttempt
├── gateId: UUID
├── audioMetadata: AudioMetadata  (NO audio stored)
├── transcript: string
├── score: number
├── result: PASS | PARTIAL | FAIL
└── asrProvider: WHISPER_GPU | AZURE | WHISPER_CPP

AudioMetadata
├── durationMs: number
├── noiseFloorDb: number
└── vadResult: boolean
    // NOTE: Raw audio is NEVER persisted. Only metadata.
```

---

## 7. Mobile Application

### 7.1 Stack (Definitive)

| Concern | Choice | Notes |
|---------|--------|-------|
| Framework | React Native 0.74+ (bare workflow) | No Expo managed workflow; use Expo modules à la carte |
| Navigation | React Navigation v7 | Stack + Bottom Tab + Modal navigators |
| State Management | Zustand (global) + TanStack Query v5 (server state) | Do NOT use Redux |
| Offline Storage | **react-native-mmkv** (key-value, encrypted) + **SQLite via op-sqlite** | See §13 for split responsibility |
| Networking | Axios with retry interceptor | Wrap in TanStack Query mutations |
| Unity Integration | react-native-unity-view | See §8 |
| ASR (offline) | whisper.cpp via JSI bridge | Quantized q4_0 model, ~75MB |
| Audio Capture | react-native-audio-recorder-player | VAD preprocessing before ASR dispatch |
| Push Notifications | @notifee/react-native + Firebase Cloud Messaging | |
| Analytics (client) | PostHog React Native SDK | |
| Crash Reporting | Sentry React Native | |
| Feature Flags | Unleash React Native SDK | |
| i18n | i18next + react-i18next | |
| Testing | Jest + React Native Testing Library + Detox (E2E) | |

> **Expo Modules Policy:** Use individual Expo modules (e.g., expo-camera,
> expo-file-system) only when no equivalent bare RN solution exists or the
> Expo module is the de facto standard. Do NOT use Expo Go or Expo managed
> workflow — they are incompatible with react-native-unity-view and
> whisper.cpp JSI.

### 7.2 Folder Structure

```
/src
  /screens           # Route-level screen components
  /components        # Shared UI components
  /navigation        # React Navigation stacks/tabs
  /stores            # Zustand stores
  /hooks             # Custom React hooks (useASR, useProgress, etc.)
  /services          # API clients, audio service, sync service
  /unity             # Unity bridge message types + hooks
  /offline           # Sync queue, conflict resolution
  /i18n              # Translation files
  /utils
  /constants
  /types             # Global TypeScript types
```

### 7.3 State Architecture

```
AppStore (Zustand)
├── auth: { user, tokens, isAuthenticated }
├── offline: { isOnline, syncQueueLength, lastSyncAt }
└── featureFlags: { flags }

ContentStore (TanStack Query)
└── useContent(), useWorld(), useAssignments()

ProgressStore (TanStack Query + Zustand for local buffer)
└── useSessions(), useFluencyTrend()
```

---

## 8. Unity Game Client

### 8.1 Version & Build Targets

| Setting | Value |
|---------|-------|
| Unity Version | 2022.3 LTS |
| Build Targets | Android (ARM64), iOS (arm64) |
| Render Pipeline | URP (Universal Render Pipeline) |
| Scripting Backend | IL2CPP |
| Minimum Android API | 26 (Android 8) |
| Minimum iOS | 15.0 |

### 8.2 Scene Architecture

```
GameManager (DontDestroyOnLoad)
├── WorldLoader        → loads AssetBundles per world
├── GateController     → manages reading gate lifecycle
├── BridgeManager      → all RN ↔ Unity message I/O
├── AudioController    → ambient/SFX audio (NOT mic capture)
└── ProgressProxy      → lightweight local state mirror

WorldScene (per world)
├── SceneSequencer
├── CharacterController
├── GatePoint[]        → triggers GateController
└── UICanvas           → Gate overlay UI
```

### 8.3 C# Bridge Interface

All bridge communication goes through a single static class:

```csharp
public static class LitPlayBridge
{
    // Receive from RN
    public static void OnMessageFromRN(string jsonPayload)
    {
        var msg = JsonUtility.FromJson<BridgeMessage>(jsonPayload);
        BridgeManager.Instance.Dispatch(msg);
    }

    // Send to RN
    public static void SendToRN(BridgeMessage msg)
    {
        var json = JsonUtility.ToJson(msg);
        UnityMessageManager.Instance.SendMessageToRN(json);
    }
}

[Serializable]
public class BridgeMessage
{
    public string type;      // matches BridgeEventType enum (string)
    public string requestId; // UUID, for request-response correlation
    public string payload;   // JSON string (nested)
}
```

---

## 9. React Native ↔ Unity Bridge

### 9.1 Bridge Event Types (Definitive List)

| Direction | Event Type | Payload | Description |
|-----------|-----------|---------|-------------|
| Unity → RN | `GATE_TRIGGERED` | `{ gateId, passageText, difficulty, maxRetries }` | Gate point reached, RN must start ASR |
| RN → Unity | `ASR_RESULT` | `{ gateId, result: PASS\|PARTIAL\|FAIL, score, retriesRemaining }` | ASR outcome, Unity reacts |
| Unity → RN | `SCENE_COMPLETED` | `{ sceneId, worldId, totalGates, passedGates }` | Scene finished (all gates passed) |
| Unity → RN | `WORLD_COMPLETED` | `{ worldId, totalSessions }` | Full world completed |
| RN → Unity | `CONTENT_LOADED` | `{ worldId, manifestVersion }` | RN confirms content bundle ready |
| RN → Unity | `CONFIG_UPDATE` | `{ difficultyOverride?, locale? }` | Push config changes into Unity |
| Unity → RN | `CALIBRATION_REQUEST` | `{ reason: FIRST_RUN\|NOISE_CHANGE }` | Unity requests mic calibration |
| RN → Unity | `CALIBRATION_RESULT` | `{ noiseFloorDb, gainDb }` | RN sends calibration result back |
| RN → Unity | `PAUSE_GAME` | `{}` | App backgrounded; Unity should pause |
| Unity → RN | `BRIDGE_READY` | `{ unityVersion, buildNumber }` | Unity loaded and bridge initialized |
| RN → Unity | `BRIDGE_ACK` | `{ requestId }` | Generic acknowledgement |

### 9.2 Bridge Message Flow: Gate Sequence

```
Unity GateController       React Native            ASR Service
      │                        │                        │
      │──GATE_TRIGGERED ──────►│                        │
      │                        │── startAudioCapture()  │
      │                        │── POST /asr/validate ─►│
      │                        │                        │── Whisper/Azure
      │                        │◄── { transcript,score }│
      │◄── ASR_RESULT ─────────│                        │
      │                        │── logGateAttempt()     │
      │  (animate scene)       │                        │
```

### 9.3 Bridge Error Handling

- All bridge messages include a `requestId`. If RN does not receive `BRIDGE_ACK` within 5000ms, it retries up to 2 times, then emits a `BRIDGE_TIMEOUT` local error and shows the child a "tap to try again" prompt.
- Unity never blocks on an awaited response — it sets a timeout and degrades gracefully (shows gate bypass prompt for accessibility reasons after `bypassTimeoutMs`, default 30000ms).

---

## 10. Backend Services

### 10.1 Shared Service Rules

1. Each service owns its own database schema (schema-per-service).
2. Services communicate asynchronously via Kafka for non-critical paths.
3. Services communicate synchronously via REST (internal) for critical paths only (e.g., auth-service JWT validation).
4. No service directly queries another service's database.
5. All services expose `/health` (liveness) and `/ready` (readiness) endpoints.
6. All services emit structured JSON logs to CloudWatch.
7. All services export OpenTelemetry traces to Grafana Tempo.
8. All services run in Docker containers, deployed via ECS Fargate.

### 10.2 auth-service

**Responsibilities:** User registration, login, JWT issuance, refresh rotation, Google OAuth 2.0, COPPA consent tracking, account deletion.

**Database:** PostgreSQL (`auth_db`)  
**Key Tables:** `users`, `refresh_tokens`, `oauth_connections`, `parental_consents`, `deletion_requests`

### 10.3 progress-service

**Responsibilities:** Session CRUD, gate attempt records, fluency scoring, WPM computation, trend caching.

**Database:** PostgreSQL (`progress_db`)  
**Key Tables:** `sessions`, `gate_attempts`, `fluency_scores`, `wpm_trends`  
**Cache:** Redis (WPM trend cache, TTL 1h)

### 10.4 content-service

**Responsibilities:** Content catalog, world/scene/gate metadata, S3 asset URL signing, teacher assignments.

**Database:** PostgreSQL (`content_db`)  
**Storage:** AWS S3 (asset bundles), CloudFront CDN  
**Key Tables:** `worlds`, `scenes`, `gates`, `assignments`

### 10.5 asr-service

**Responsibilities:** Audio validation pipeline (see §12).

**Runtime:** Python 3.11, FastAPI  
**GPU:** AWS g4dn.xlarge (NVIDIA T4) for Whisper inference  
**No persistent database** — stateless per request.

### 10.6 classroom-service

**Responsibilities:** Classroom CRUD, join codes, teacher-student linking, per-student goal setting.

**Database:** PostgreSQL (`classroom_db`)  
**Key Tables:** `classrooms`, `classroom_members`, `student_goals`, `join_codes`

### 10.7 analytics-service

**Responsibilities:** Consumes Kafka events, writes to ClickHouse, powers dashboards.

**Database:** ClickHouse (`litplay_analytics`)  
**Runtime:** Python 3.11, async Kafka consumer

### 10.8 notification-service

**Responsibilities:** FCM/APNs push delivery, weekly teacher email digest (SendGrid).

**Database:** PostgreSQL (`notification_db`) — delivery log only  
**Key Tables:** `notification_log`, `device_tokens`, `digest_preferences`

---

## 11. REST API Contract

### 11.1 Global Conventions

- **Base URL:** `https://api.litplay.app/api/v1`
- **Auth:** `Authorization: Bearer <access_token>` on all protected routes
- **Content-Type:** `application/json`
- **Errors:** `{ "error": { "code": "ERROR_CODE", "message": "...", "requestId": "..." } }`
- **Pagination:** `?page=1&limit=20` → `{ "data": [], "meta": { "page", "limit", "total" } }`
- **Timestamps:** ISO 8601 UTC (`2026-06-13T00:00:00Z`)

### 11.2 Auth Service Endpoints

```
POST   /auth/register              Create new user account
POST   /auth/login                 Email/password login → tokens
POST   /auth/refresh               Rotate refresh token → new access token
POST   /auth/logout                Revoke refresh token
POST   /auth/oauth/google          Google OAuth token exchange
GET    /auth/me                    Get current user profile
PATCH  /auth/me                    Update profile (name, preferences)
DELETE /auth/me                    Account deletion request (async purge)
POST   /auth/coppa/consent         Submit parental consent payload
GET    /auth/coppa/status/:childId Check consent status
POST   /auth/password/reset        Request password reset email
POST   /auth/password/confirm      Confirm reset with token + new password
```

### 11.3 Progress Service Endpoints

```
POST   /progress/sessions                     Create/open a new session
PATCH  /progress/sessions/:sessionId          Update session (e.g., endTime)
GET    /progress/sessions/:sessionId          Get single session
GET    /progress/students/:studentId/sessions List sessions (paginated)
POST   /progress/sessions/:sessionId/gate-attempts  Log a gate attempt
GET    /progress/students/:studentId/fluency  Get fluency score + WPM trend
GET    /progress/students/:studentId/summary  Aggregate progress summary
POST   /progress/sessions/batch-sync          Offline sync: submit array of sessions
```

### 11.4 Content Service Endpoints

```
GET    /content                           List content catalog (filterable)
GET    /content/:contentId                Get world metadata + scene tree
GET    /content/:contentId/download-url   Get signed S3 URL for asset bundle
GET    /content/:contentId/gates          List all gates in a world
POST   /content/assignments               Assign content to student/classroom
GET    /content/assignments/:studentId    Get assignments for a student
DELETE /content/assignments/:assignmentId Remove assignment
```

### 11.5 ASR Service Endpoints

```
POST   /asr/validate         Submit audio for gate validation
POST   /asr/calibrate        Submit calibration audio → returns noise floor + gain
GET    /asr/health           ASR service health + active provider (Whisper/Azure)
```

**POST /asr/validate — Request:**
```json
{
  "gateId": "uuid",
  "studentId": "uuid",
  "passageText": "string",
  "difficulty": "Easy | Medium | Hard",
  "audioBase64": "string",    // max 30s, 16kHz mono WAV or OGG
  "audioMetadata": {
    "durationMs": 4200,
    "noiseFloorDb": -42.0,
    "vadResult": true
  },
  "attemptNumber": 1,
  "provider": "auto | whisper_gpu | azure | whisper_cpp"
}
```

**POST /asr/validate — Response:**
```json
{
  "gateId": "uuid",
  "transcript": "string",
  "score": 91.4,
  "result": "PASS",
  "retriesRemaining": 2,
  "latencyMs": 843,
  "provider": "whisper_gpu",
  "phonemeBreakdown": [
    { "word": "elephant", "score": 97.2, "phonetic": "ɛlɪfənt" }
  ]
}
```

### 11.6 Classroom Service Endpoints

```
POST   /classrooms                      Create classroom
GET    /classrooms/:classroomId         Get classroom detail
PATCH  /classrooms/:classroomId         Update classroom settings
DELETE /classrooms/:classroomId         Delete classroom
POST   /classrooms/:classroomId/join    Student joins via join code
GET    /classrooms/:classroomId/members List members + roles
DELETE /classrooms/:classroomId/members/:userId  Remove member
GET    /classrooms/:classroomId/progress  Per-student progress summary
POST   /classrooms/:classroomId/goals/:studentId  Set student goal
GET    /classrooms/:classroomId/goals/:studentId  Get student goal
POST   /classrooms/join-code/generate   Teacher generates new join code
```

### 11.7 Speech Calibration (Preserved from v1)

```
POST   /asr/calibrate
```

**Request:**
```json
{
  "studentId": "uuid",
  "audioBase64": "string",  // 3–5s ambient recording
  "deviceModel": "string"
}
```

**Response:**
```json
{
  "noiseFloorDb": -40.5,
  "gainRecommendationDb": 3.0,
  "calibrationId": "uuid",
  "validUntil": "ISO8601"
}
```

Calibration profiles are stored **client-side only** in MMKV (key: `asr:calibration:{studentId}`). They are not sent to the backend except as metadata in `/asr/validate` requests.

---

## 12. ASR Pipeline

### 12.1 Full Pipeline Flow

```
Mobile App (RN)
  │
  ├─1─ Capture audio (react-native-audio-recorder-player)
  ├─2─ Apply VAD (trim silence at start/end)
  ├─3─ Noise reduction (apply calibration gain)
  ├─4─ Encode to base64 (WAV 16kHz mono)
  │
  ▼
ASR Service (/api/v1/asr/validate)
  │
  ├─5─ Validate request schema + audio length (max 30s)
  ├─6─ Route: online? → Whisper GPU; else → signal RN to use whisper.cpp
  │
  Whisper GPU Path:
  ├─7a─ Decode base64 → WAV
  ├─8a─ Run Whisper large-v3 inference (CUDA)
  ├─9a─ If latency > 1800ms → failover to Azure
  │
  Azure Fallback Path:
  ├─7b─ Stream audio to Azure Speech SDK
  ├─8b─ Receive transcript
  │
  Common (both paths):
  ├─10─ Normalize transcript (lowercase, strip punctuation)
  ├─11─ RapidFuzz token_sort_ratio vs passageText
  ├─12─ Phonetic matching (Metaphone) for low-score words
  ├─13─ Compute final score (weighted: 70% fuzzy + 30% phonetic)
  ├─14─ Apply difficulty threshold → PASS | PARTIAL | FAIL
  ├─15─ Return response (NEVER persist audio)
  │
  whisper.cpp Offline Path (on-device, RN side):
  ├─7c─ JSI call to whisper.cpp module
  ├─8c─ Run q4_0 quantized model
  ├─9c─ Transcript returned to JS layer
  ├─10c─ Same scoring logic runs in JS (ported RapidFuzz equivalent)
  └─11c─ Result treated identically; queued for server-side audit on sync
```

### 12.2 Whisper Model Specs

| Context | Model | Size | Hardware |
|---------|-------|------|----------|
| Server (online) | whisper large-v3 | ~1.5GB | NVIDIA T4 GPU |
| On-device (offline) | whisper.cpp q4_0 | ~75MB | Mobile CPU |

### 12.3 Scoring Reference

| Metric | Weight | Notes |
|--------|--------|-------|
| RapidFuzz token_sort_ratio | 70% | Handles word reorder, minor insertions |
| Phonetic match (Metaphone) | 30% | Catches pronunciation-correct but spelling-different |

| Difficulty | Pass Threshold | Partial Threshold |
|------------|---------------|------------------|
| Easy | ≥ 75 | 55–74 |
| Medium | ≥ 82 | 62–81 |
| Hard | ≥ 88 | 70–87 |

---

## 13. Offline-First Architecture

### 13.1 Storage Responsibility Split (Resolved)

> **This resolves the storage inconsistency in litplaydesigndoc.md.**
> The system uses TWO complementary storage layers with clearly separated
> responsibilities.

| Storage Layer | Library | What it stores |
|---------------|---------|---------------|
| **MMKV** (key-value, encrypted) | react-native-mmkv | Auth tokens, calibration profiles, feature flags, sync queue metadata, small UI state, last-sync timestamps |
| **SQLite** (relational, queryable) | op-sqlite | Session records, gate attempt records, content manifests, assignment cache — anything that needs query/filter/sort |

**Rule:** If you need to query it (filter by date, sort, count) → SQLite. If it's a single value you look up by key → MMKV.

### 13.2 Sync Queue

```typescript
// MMKV key: "syncQueue:pending"
// Value: JSON array of SyncQueueItem

interface SyncQueueItem {
  id: string;           // local UUID
  type: 'SESSION' | 'GATE_ATTEMPT';
  payload: object;      // full session/attempt object
  createdAt: string;    // ISO8601
  retryCount: number;
  lastAttemptAt?: string;
}
```

**Sync rules:**
1. On reconnect, sync service reads `syncQueue:pending` from MMKV.
2. Items are sent to `POST /progress/sessions/batch-sync` in batches of 20.
3. On 2xx response, items are removed from MMKV queue.
4. On 4xx (bad request), item is moved to `syncQueue:dead` (manual review).
5. On 5xx or network error, item stays in queue; retry with exponential backoff (base 5s, max 5m).
6. Max queue age: 30 days. Items older than 30 days are purged with a local warning log.

### 13.3 Conflict Resolution

- **Session data is append-only.** Conflicts cannot occur (no two devices write the same session UUID).
- **Content assignments** from the server always win over local cache (server is authoritative).
- **Fluency scores** are computed server-side from synced session data; local estimates are display-only.

### 13.4 Offline Capability Map

| Feature | Offline Available | Notes |
|---------|------------------|-------|
| Core game + reading gates | ✅ Yes | Requires pre-downloaded content bundle |
| ASR validation | ✅ Yes | whisper.cpp on-device |
| Progress recording | ✅ Yes | Queued in MMKV/SQLite |
| Content browsing | ✅ Partial | Shows cached assignments only |
| Classroom progress | ❌ No | Requires live server data |
| Teacher dashboard | ❌ No | Requires live server data |
| Account management | ❌ No | Requires connectivity |
| Content download | ❌ No | WiFi preferred; requires connectivity |

---

## 14. Database Design & Schema Rules

### 14.1 Global Rules (All Services)

1. PostgreSQL 16 for all relational data.
2. Schema-per-service (no cross-service table references via FK).
3. All PK fields: `UUID v4`, generated at application layer.
4. All timestamp fields: `TIMESTAMPTZ` (never bare `TIMESTAMP`).
5. Soft deletes: `deleted_at TIMESTAMPTZ DEFAULT NULL` on all user-facing entities.
6. Enums as PostgreSQL native `ENUM` types (not `VARCHAR` with CHECK constraints).
7. Migrations via **Flyway** (versioned, checked into `/db/migrations` of each service).
8. ORM: **Prisma** (Node.js services), **SQLAlchemy** (Python services).
9. Connection pooling via **PgBouncer** (transaction mode, max 20 per service).
10. All tables must have a `created_at` and `updated_at` managed by trigger.

### 14.2 Key Schema: `auth_db`

```sql
CREATE TYPE user_role AS ENUM ('student', 'parent', 'teacher', 'admin');
CREATE TYPE consent_status AS ENUM ('pending', 'verified', 'rejected', 'revoked');

CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255),           -- NULL for OAuth-only users
  role            user_role NOT NULL,
  display_name    VARCHAR(100),
  date_of_birth   DATE,                   -- required for students
  locale          VARCHAR(10) DEFAULT 'en-US',
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash      VARCHAR(255) UNIQUE NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  device_id       VARCHAR(255)
);

CREATE TABLE parental_consents (
  id              UUID PRIMARY KEY,
  child_id        UUID REFERENCES users(id),
  parent_id       UUID REFERENCES users(id),
  status          consent_status NOT NULL DEFAULT 'pending',
  consent_method  VARCHAR(50),            -- 'email', 'credit_card', 'form'
  consented_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);
```

### 14.3 Key Schema: `progress_db`

```sql
CREATE TYPE session_status AS ENUM ('active', 'completed', 'abandoned');
CREATE TYPE gate_result AS ENUM ('PASS', 'PARTIAL', 'FAIL');
CREATE TYPE asr_provider AS ENUM ('whisper_gpu', 'azure', 'whisper_cpp');

CREATE TABLE sessions (
  id              UUID PRIMARY KEY,
  student_id      UUID NOT NULL,
  content_id      UUID NOT NULL,
  status          session_status NOT NULL DEFAULT 'active',
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  words_read      INTEGER DEFAULT 0,
  wpm             NUMERIC(6,2),
  synced_from_offline BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE gate_attempts (
  id              UUID PRIMARY KEY,
  session_id      UUID REFERENCES sessions(id),
  gate_id         UUID NOT NULL,
  attempt_number  SMALLINT NOT NULL,
  transcript      TEXT,
  score           NUMERIC(5,2),
  result          gate_result NOT NULL,
  asr_provider    asr_provider NOT NULL,
  latency_ms      INTEGER,
  attempted_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
  -- NOTE: No audio stored. No audio column ever.
);
```

### 14.4 ClickHouse Analytics Schema

```sql
CREATE TABLE litplay_analytics.gate_events (
  event_id        UUID,
  student_id      UUID,
  content_id      UUID,
  gate_id         UUID,
  result          LowCardinality(String),
  score           Float32,
  latency_ms      UInt32,
  asr_provider    LowCardinality(String),
  is_offline      UInt8,
  event_time      DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (student_id, event_time);

CREATE TABLE litplay_analytics.session_summary (
  session_id      UUID,
  student_id      UUID,
  content_id      UUID,
  grade_level     LowCardinality(String),
  words_read      UInt32,
  wpm             Float32,
  gates_passed    UInt16,
  gates_total     UInt16,
  duration_sec    UInt32,
  session_date    Date
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(session_date)
ORDER BY (student_id, session_date);
```

---

## 15. Event Bus & Async Messaging

### 15.1 Platform: Apache Kafka (AWS MSK)

| Setting | Value |
|---------|-------|
| Cluster | AWS MSK 3.6 |
| Replication factor | 3 |
| Retention | 7 days |
| Consumer groups | per-service |
| Schema registry | AWS Glue Schema Registry (Avro) |

### 15.2 Topic Naming Convention

```
litplay.{domain}.{entity}.{verb}

Examples:
litplay.auth.user.created
litplay.auth.user.deleted
litplay.progress.session.completed
litplay.progress.gate_attempt.recorded
litplay.content.assignment.created
litplay.classroom.member.joined
```

### 15.3 Topic Inventory

| Topic | Producer | Consumer(s) | Trigger |
|-------|----------|-------------|---------|
| `litplay.auth.user.created` | auth-service | notification-service (welcome email), analytics | New user registration |
| `litplay.auth.user.deleted` | auth-service | progress-service, content-service, classroom-service (async data purge) | Account deletion |
| `litplay.progress.session.completed` | progress-service | analytics-service, notification-service | Session ends |
| `litplay.progress.gate_attempt.recorded` | progress-service | analytics-service | Gate attempt logged |
| `litplay.content.assignment.created` | classroom-service | content-service, notification-service | Teacher assigns content |
| `litplay.classroom.member.joined` | classroom-service | analytics-service | Student joins classroom |

### 15.4 Kafka Message Envelope

```json
{
  "specVersion": "1.0",
  "topic": "litplay.progress.session.completed",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "source": "progress-service",
  "dataVersion": "1",
  "correlationId": "uuid",
  "data": { /* event-specific payload */ }
}
```

---

## 16. Authentication & Authorization

### 16.1 JWT Structure

```json
// Access Token (15m TTL)
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "student | parent | teacher | admin",
  "classroomIds": ["uuid"],   // for teachers
  "parentId": "uuid",          // for students
  "iat": 1718000000,
  "exp": 1718000900
}
```

### 16.2 Role-Based Access Control (RBAC)

| Endpoint Group | student | parent | teacher | admin |
|----------------|---------|--------|---------|-------|
| `/progress/students/:id/*` | Own only | Own children | Own classroom | All |
| `/classrooms/*` | Read own | Read child's | Full CRUD own | All |
| `/content/*` | Read assigned | Read child's | Read + assign | Full CRUD |
| `/auth/coppa/*` | — | Full | — | Full |
| `/asr/validate` | Yes | — | — | Yes |
| Admin endpoints | — | — | — | Full |

### 16.3 Token Security Rules

1. Access tokens are stored in **memory only** (Zustand store, never AsyncStorage, never MMKV).
2. Refresh tokens are stored in **MMKV** (encrypted, key: `auth:refreshToken`).
3. On app background > 30 minutes, access token is cleared from memory; refresh on next foreground.
4. Refresh tokens are single-use (rotated on every use).
5. On suspicious refresh token reuse, entire token family is revoked (token family tracking).

---

## 17. COPPA & Privacy Compliance

### 17.1 COPPA Compliance Rules (Children under 13)

1. Date of birth is collected at registration for all student accounts.
2. Any student with `date_of_birth` indicating age < 13 at time of registration is flagged `requires_parental_consent = true`.
3. **No data** (progress, analytics, device info) is collected until parental consent is verified.
4. Account remains in `PENDING_CONSENT` state; the app shows a "waiting for parent approval" screen.
5. Parents receive a consent email with a unique link; clicking confirms consent.
6. Consent can be revoked by the parent at any time from the app → triggers account deletion.
7. All COPPA consent records are retained for 7 years (compliance requirement).

### 17.2 Data Minimization Rules

| Data Type | Collected | Retention | Notes |
|-----------|-----------|-----------|-------|
| Raw audio | ❌ Never | N/A | Hardcoded, never changes |
| Transcripts | ✅ Yes | 2 years | Used for fluency tracking |
| Gate scores | ✅ Yes | 5 years | Core product data |
| Device identifiers | ✅ Minimal | Account lifetime | FCM token only |
| Location | ❌ Never | N/A | Not required |
| Biometric data | ❌ Never | N/A | ASR is text-based, not voiceprint |
| IP address | ✅ Logs only | 90 days | Server logs, not user-linked |

### 17.3 Right to Erasure (COPPA + GDPR)

Upon `DELETE /auth/me`:
1. Soft-delete user record immediately (`deleted_at` set).
2. Publish `litplay.auth.user.deleted` Kafka event.
3. All consuming services purge related data within 72 hours.
4. ClickHouse analytics data is anonymized (not deleted) for aggregate reporting.
5. A `deletion_confirmation` email is sent to the parent/user.

---

## 18. Content Management

### 18.1 Content Hierarchy

```
World (game world, e.g., "The Dragon's Library")
├── metadata: { title, gradeLevel, lexileRange, language, tags, thumbnailUrl }
├── assetBundleUrl: s3://litplay-content/{worldId}/{version}/bundle.zip
└── Scene[]
    ├── metadata: { sceneIndex, title, estimatedMinutes }
    └── Gate[]
        ├── passage: string
        ├── difficulty: Easy | Medium | Hard
        └── maxRetries: number
```

### 18.2 Asset Delivery

1. Content bundles are hosted on S3 with CloudFront CDN.
2. Download URLs are signed (AWS CloudFront signed URLs, 24h TTL).
3. The app downloads bundles on WiFi when a new assignment is received.
4. Bundle integrity is verified via SHA-256 checksum before use.
5. On-device bundles are stored in the app's private documents directory.
6. Bundles are versioned; the app checks manifest version before loading.

### 18.3 Content Grades & Lexile Mapping

| Grade | Lexile Range |
|-------|-------------|
| K | BR100L–200L |
| 1 | 200L–400L |
| 2 | 400L–600L |
| 3 | 600L–800L |
| 4 | 800L–1000L |
| 5 | 1000L–1100L |

---

## 19. Classroom & Teacher Features

### 19.1 Classroom Lifecycle

```
Teacher creates classroom → generates join code (6-char alphanumeric)
  │
  ▼
Students join via join code → added to classroom_members
  │
  ▼
Teacher assigns content to classroom → all members get assignment
  │
  ▼
Teacher monitors progress dashboard (per-student + class aggregate)
  │
  ▼
Teacher receives weekly digest (optional, opt-in, Sundays 8am local)
```

### 19.2 Progress Dashboard Data Points

- Per student: total sessions, total words read, WPM trend (7d/30d), gate pass rate, last active
- Per class: average WPM, top/bottom performers, content completion rates, weekly engagement heatmap

---

## 20. Analytics & Observability

### 20.1 Client-Side Events (PostHog)

| Event | Properties | Trigger |
|-------|-----------|---------|
| `gate_triggered` | gateId, worldId, difficulty | Unity → RN bridge |
| `gate_completed` | gateId, result, score, latencyMs | ASR result returned |
| `scene_completed` | sceneId, worldId, gatesTotal, gatesPassed | Unity event |
| `asr_provider_used` | provider, latencyMs, isOffline | Per ASR call |
| `app_launch` | coldStart (bool), platform | App mount |
| `sync_completed` | itemsSynced, failedItems | Sync queue flush |

### 20.2 Server-Side Observability Stack

| Layer | Tool |
|-------|------|
| Metrics | Prometheus + Grafana |
| Tracing | OpenTelemetry → Grafana Tempo |
| Logging | Structured JSON → CloudWatch → Grafana Loki |
| Alerting | Grafana Alertmanager → PagerDuty |
| RUM | PostHog session recordings (anonymized, COPPA-safe) |
| Crash Reporting | Sentry (mobile) |
| Uptime | AWS CloudWatch Synthetics (canaries) |

### 20.3 Key Alerts & Thresholds

| Alert | Threshold | Severity |
|-------|-----------|----------|
| ASR p95 latency | > 2000ms for 5m | P1 |
| ASR error rate | > 5% for 2m | P1 |
| API error rate (5xx) | > 1% for 5m | P2 |
| Sync queue depth | > 10,000 items | P2 |
| Kafka consumer lag | > 5000 messages | P2 |
| DB connection exhaustion | > 90% pool usage | P1 |
| App crash rate | > 0.5% of sessions | P2 |

---

## 21. Notifications

### 21.1 Notification Types

| Type | Channel | Audience | Trigger |
|------|---------|----------|---------|
| Welcome | Email | All users | Registration |
| Parental consent request | Email | Parents | Child registers |
| Weekly progress digest | Email + Push | Teachers, Parents | Weekly cron (Sundays) |
| Assignment notification | Push | Students | Teacher assigns content |
| Streak reminder | Push | Students | 3-day inactivity |
| Consent reminder | Email | Parents | 48h after consent request if not actioned |

### 21.2 Push Notification Rules

1. Push notifications require explicit opt-in (permission prompt, iOS/Android).
2. Student push notifications are only sent between 7am–8pm (user's local timezone).
3. Streak reminders are suppressed during school holidays (configurable calendar).
4. All push tokens are refreshed silently on app launch and updated in the notification-service.

---

## 22. Internationalization (i18n)

### 22.1 Architecture

- Library: `i18next` + `react-i18next`
- Translation files: `/src/i18n/{locale}/translation.json`
- Default locale: `en-US`
- Locale detection order: user profile preference → device locale → `en-US` fallback
- Unity locale is synced via bridge event `CONFIG_UPDATE { locale }`

### 22.2 Supported Locales at Launch

| Locale | Language | Status |
|--------|----------|--------|
| `en-US` | English (US) | ✅ Launch |
| `es-US` | Spanish (US) | 🔜 V2 |
| `fr-CA` | French (Canada) | 🔜 V3 |

### 22.3 i18n Rules

1. No hardcoded user-visible strings anywhere in the codebase. Use `t('key')` always.
2. All new UI strings must have a corresponding key added to `en-US/translation.json` in the same PR.
3. Pluralization must use i18next plural rules (not manual `if count === 1` guards).
4. Date/time formatting must use `Intl.DateTimeFormat` with the active locale.

---

## 23. Accessibility

### 23.1 Standards

- **WCAG 2.1 AA** for all React Native screens.
- **APCA contrast** for all text (minimum Lc 60 for body text).
- All interactive elements have `accessible={true}` and `accessibilityLabel` set.

### 23.2 Requirements

| Area | Requirement |
|------|-------------|
| Screen reader | All screens usable with TalkBack (Android) and VoiceOver (iOS) |
| Font scaling | All layouts support font scale 1.0x–1.4x without truncation |
| Touch targets | Minimum 44×44pt (iOS) / 48×48dp (Android) |
| Reading gate | ASR retry prompt has screen reader accessible instructions |
| Color | No information conveyed by color alone |
| Animation | Respects `prefers-reduced-motion` (via `useReducedMotion` hook) |
| Unity scenes | Game scenes have optional high-contrast mode toggle |

---

## 24. Feature Flags & Experimentation

### 24.1 Platform: Unleash

- Self-hosted Unleash on ECS Fargate (production + staging instances)
- React Native SDK: `@unleash/proxy-client-react`
- Server-side: Unleash Node.js SDK

### 24.2 Flag Naming Convention

```
{scope}.{feature}[.{variant}]

Examples:
asr.azure_fallback_enabled
asr.offline_whisper_enabled
game.gate_bypass_timeout_ms
classroom.weekly_digest_enabled
experiment.onboarding_v2
```

### 24.3 Operational Rules

1. Every new feature must be behind a flag in staging before production.
2. Flags targeting children must be reviewed by the COPPA compliance lead before activation.
3. Experiment flags must have a defined hypothesis, primary metric, and end date.
4. Dead flags (features fully launched) must be cleaned up within 30 days of full rollout.

---

## 25. Infrastructure & Deployment

### 25.1 Cloud Provider: AWS

| Component | AWS Service |
|-----------|------------|
| Compute | ECS Fargate (services), EC2 g4dn.xlarge (ASR GPU) |
| Database | RDS PostgreSQL 16 (Multi-AZ) |
| Cache | ElastiCache Redis 7 |
| Message Bus | MSK (Managed Kafka) |
| Storage | S3 + CloudFront CDN |
| API Gateway | AWS API Gateway v2 (HTTP) + WAF |
| Secrets | AWS Secrets Manager |
| IaC | Terraform (modules per service) |
| DNS | Route 53 |
| Certificates | ACM (auto-renewed) |

### 25.2 Environments

| Environment | Purpose | Auto-Deploy | Data |
|-------------|---------|-------------|------|
| `local` | Developer local | Manual | Seeded fixtures |
| `dev` | Feature branch integration | On PR merge to `dev` | Anonymized snapshots |
| `staging` | Pre-production validation | On merge to `main` | Anonymized production clone |
| `production` | Live | Manual promote from staging | Real data |

### 25.3 Multi-Region Strategy

- **Primary region:** `us-east-1`
- **DR region:** `us-west-2` (warm standby, RTO 30m, RPO 5m)
- Global tables for `users` (DynamoDB if needed for read scale) — **deferred to V2**
- CloudFront serves content assets globally regardless

---

## 26. CI/CD Pipeline

### 26.1 Pipeline Steps

```
PR Opened
  │
  ├── Lint (ESLint, Prettier, SwiftLint, ktlint)
  ├── Type check (tsc --noEmit)
  ├── Unit tests (Jest, pytest)
  ├── Security scan (Snyk, Trivy on Docker images)
  ├── Build (RN bundle, Docker images)
  └── PR review required (1 approval minimum)

Merge to dev branch
  │
  ├── Run integration tests
  ├── Deploy to dev environment
  └── Smoke tests (Detox subset)

Merge to main branch
  │
  ├── Run full test suite
  ├── Build production Docker images
  ├── Tag images with git SHA
  ├── Deploy to staging
  ├── Run full Detox E2E suite (staging)
  └── Await manual production promotion

Production Promotion
  │
  ├── Canary deploy (5% traffic, 30m)
  ├── Monitor error rate + ASR p95
  └── Full deploy if green
```

### 26.2 Mobile Release Pipeline

```
Merge to release/* branch
  │
  ├── Increment build number (fastlane)
  ├── Build iOS IPA (Xcode Cloud)
  ├── Build Android AAB (GitHub Actions)
  ├── Code sign (iOS: App Store Distribution cert)
  ├── Submit to TestFlight / Google Play Internal Track
  └── Await QA sign-off → promote to public track
```

---

## 27. Security

### 27.1 Baseline Requirements

- OWASP Mobile Top 10: Zero critical or high findings at launch.
- OWASP API Security Top 10: Evaluated and mitigated for all endpoints.
- Third-party dependency audit: Snyk in CI, weekly scheduled scans.
- Secrets: All secrets in AWS Secrets Manager. Zero secrets in code or environment variable files.
- TLS: TLS 1.2 minimum on all external connections, TLS 1.3 preferred.
- Certificate pinning: Enabled for `/asr/validate` (highest-sensitivity endpoint).

### 27.2 Mobile-Specific Security

| Control | Implementation |
|---------|---------------|
| Token storage | Access token: memory only. Refresh token: MMKV encrypted store |
| Jailbreak/root detection | react-native-device-info + runtime checks; warn user, log event |
| Code obfuscation | ProGuard (Android), Bitcode disabled (iOS) |
| Debug API disabled | Verify `__DEV__ === false` in production builds |
| Audio data | Cleared from memory immediately after ASR response received |
| Certificate pinning | Enabled on ASR and auth endpoints |

### 27.3 API Security

1. Rate limiting: 100 req/min per IP (unauthenticated), 1000 req/min per user (authenticated).
2. Input validation: Zod schemas on all request bodies (Node.js services), Pydantic (Python services).
3. SQL injection: Prevented by ORM usage. No raw SQL except in Flyway migrations.
4. CORS: Whitelist only (`https://app.litplay.app`, `https://admin.litplay.app`).
5. WAF rules: AWS-managed rule groups + IP reputation block list.

---

## 28. Performance Budgets

### 28.1 Mobile Budgets

| Metric | Budget | Measurement Tool |
|--------|--------|-----------------|
| JS bundle size (initial) | ≤ 3MB | Metro bundler report |
| TTI (time-to-interactive) | ≤ 3s cold start | Flashlight (Android) |
| Unity scene load | ≤ 2s | Custom Unity profiler |
| Memory usage (active game) | ≤ 350MB | Instruments / Android Profiler |
| Battery drain | ≤ 8% / 30min session | Device lab test |
| Frame rate (Unity game) | ≥ 60fps (≥ 30fps on low-end) | Unity Profiler |

### 28.2 API Budgets

| Endpoint | p50 Target | p95 Target |
|----------|-----------|-----------|
| `POST /asr/validate` | ≤ 800ms | ≤ 1500ms |
| `GET /content/:id` | ≤ 50ms | ≤ 100ms |
| `POST /progress/sessions` | ≤ 80ms | ≤ 150ms |
| `GET /progress/*/fluency` | ≤ 100ms | ≤ 200ms |
| `POST /auth/login` | ≤ 200ms | ≤ 400ms |

---

## 29. Testing Strategy

### 29.1 Test Pyramid

```
          ┌─────────┐
          │  E2E    │  ← Detox (mobile), Playwright (web portal)
          │  ~10%   │     ~30 critical user journeys
         ─┴─────────┴─
        ┌─────────────┐
        │ Integration │  ← Supertest (API), real DB (Testcontainers)
        │   ~20%      │     All API endpoints, Kafka consumer flows
       ─┴─────────────┴─
      ┌─────────────────┐
      │   Unit / comp   │  ← Jest (RN), pytest (Python), NUnit (Unity C#)
      │      ~70%       │     Business logic, scoring, bridge events
      └─────────────────┘
```

### 29.2 Required Coverage Thresholds

| Layer | Minimum Coverage |
|-------|----------------|
| ASR scoring logic | 95% |
| Offline sync queue | 90% |
| Auth & COPPA flows | 95% |
| Bridge message handling | 85% |
| API controllers | 80% |
| Unity GateController | 85% |

### 29.3 Key E2E Scenarios (Must Pass Before Release)

1. New student registers → parent consents → student plays gate → progress recorded
2. Student plays offline → reconnects → progress syncs correctly
3. ASR returns FAIL 3 times → gate exhausted flow shows correctly
4. Teacher creates classroom → assigns content → views student progress
5. Parent deletes child account → all data purged within 72h
6. App backgrounded mid-session → session resumed → data integrity preserved

---

## 30. Release Roadmap (MVP → V3)

### 30.1 MVP (Target: 3 months)

**Goal:** One complete world, one grade level (Grade 2), iOS + Android.

| Feature | Priority | Acceptance Criteria |
|---------|----------|-------------------|
| User registration + COPPA consent | P0 | Parent consent flow working end-to-end |
| Single Unity world (Grade 2) | P0 | ≥ 5 scenes, ≥ 10 reading gates |
| ASR gate mechanic (online) | P0 | PASS/PARTIAL/FAIL with correct thresholds |
| Progress recording | P0 | Sessions + gate attempts stored and retrievable |
| Offline gameplay + sync | P0 | Plays offline, syncs on reconnect |
| Teacher classroom (basic) | P1 | Create classroom, add students, view basic progress |
| Parental progress view | P1 | Parent sees child's WPM trend |
| Speech calibration | P1 | First-run calibration flow sets noise floor |
| Content download (WiFi) | P1 | World pre-downloaded automatically |
| Feature flags (Unleash) | P1 | At least ASR provider flag working |

### 30.2 V1 (Target: 6 months)

| Feature | Priority |
|---------|----------|
| 3+ worlds across Grades K–4 | P0 |
| ASR offline (whisper.cpp) | P0 |
| Teacher content assignment per student | P0 |
| Fluency WPM trendline + dashboard | P0 |
| Weekly teacher digest email | P1 |
| Student streak + badges (gamification) | P1 |
| Push notifications (assignment, streak) | P1 |
| Spanish (es-US) content support | P2 |
| PostHog analytics integration | P1 |

### 30.3 V2 (Target: 12 months)

| Feature | Priority |
|---------|----------|
| 10+ worlds, K–5 full coverage | P0 |
| Teacher-created custom passages | P1 |
| Adaptive difficulty (ML-based) | P1 |
| School/district admin portal | P1 |
| Multi-region DR deployment | P2 |
| Live teacher observation mode | P2 |
| Parent app redesign (dedicated) | P2 |

### 30.4 V3 (Target: 18 months)

| Feature | Priority |
|---------|----------|
| Multiplayer co-op reading challenges | P1 |
| Third-party LMS integrations (Clever, Classlink) | P1 |
| French-CA content | P2 |
| Author portal (third-party content creation) | P2 |
| Predictive fluency modeling | P2 |

---

## 31. Runbooks & Incident Response

### 31.1 Severity Classification

| Severity | Definition | Response Time | Examples |
|----------|-----------|--------------|---------|
| P1 | Core feature down for all users | 15 min | ASR down, auth down, database unreachable |
| P2 | Significant degradation or partial outage | 1 hour | Sync failing, content CDN slow, push notifications delayed |
| P3 | Minor issue, workaround available | 24 hours | Analytics gap, badge not awarding |
| P4 | Low impact, cosmetic | Next sprint | UI alignment, minor copy error |

### 31.2 ASR Outage Runbook

```
1. Alert fires: asr_p95_latency > 2000ms for 5m
2. Check Grafana: is Whisper GPU OOM? → Restart ASR ECS task
3. If Whisper GPU unhealthy: flip Unleash flag asr.azure_fallback_enabled = true
4. Verify Azure fallback active via /asr/health endpoint
5. Page on-call ML engineer if Azure fallback also failing
6. If total ASR outage: enable Unleash flag asr.offline_mode_forced = true
   (clients fall back to whisper.cpp; no server ASR calls)
7. Post incident update to status page within 30m
8. Write post-mortem within 5 business days
```

### 31.3 Database Connection Exhaustion Runbook

```
1. Alert fires: DB connection pool > 90% for 3m
2. Check PgBouncer stats: identify high-connection service
3. Scale out ECS tasks of offending service (reduces connections per task)
4. If still critical: kill long-running idle transactions in RDS
5. If pool still saturated: scale up RDS instance (vertical scaling)
6. Review and tune max_connections config in PgBouncer config
```

### 31.4 Offline Sync Failure Runbook

```
1. Alert fires: sync_queue_depth > 10,000
2. Check progress-service logs for batch-sync errors
3. If 4xx errors: inspect dead queue items for schema mismatch
4. If 5xx errors: check progress-service health + DB connectivity
5. If DB migration pending: complete migration and retry
6. Manual re-queue trigger: POST /internal/progress/requeue-dead-items
   (internal endpoint, requires admin token)
```

---

## 32. RFC & Change Management Process

Any change to this SSOT requires the following:

1. **File an RFC** in `/docs/rfcs/{YYYY-MM-DD}-{slug}.md` using the RFC template.
2. RFC must include: Problem statement, Proposed change, Alternatives considered, Impact on existing sections, Migration plan.
3. Minimum 48h comment window before approval.
4. Requires approval from: Tech Lead (always) + affected service owners.
5. Upon approval: update this document with a `CHANGELOG` entry at the top of the relevant section.
6. Bump the document version (MINOR for additive changes, MAJOR for breaking architecture changes).
7. Archive the RFC in `/docs/rfcs/accepted/`.

**Inviolable rules (require unanimous team vote to change):**
- Audio is NEVER stored (FR-017)
- COPPA consent is REQUIRED before any data collection for under-13 users (§17)
- Access tokens are NEVER persisted to disk (§16.3)

---

## 33. Glossary

| Term | Definition |
|------|-----------|
| **ASR** | Automatic Speech Recognition — converts spoken audio to text |
| **Gate / Reading Gate** | A gameplay checkpoint requiring the child to read a passage aloud |
| **whisper.cpp** | C++ port of OpenAI's Whisper model, runs on-device for offline ASR |
| **Whisper large-v3** | OpenAI's largest Whisper model, runs on GPU server for online ASR |
| **RapidFuzz** | Python fuzzy string matching library used for transcript scoring |
| **Metaphone / Soundex** | Phonetic encoding algorithms used for pronunciation-aware scoring |
| **WPM** | Words Per Minute — primary reading fluency metric |
| **Lexile** | A reading measurement framework that matches reader ability to text complexity |
| **COPPA** | Children's Online Privacy Protection Act (US federal law) |
| **SSOT** | Single Source of Truth |
| **RFC** | Request for Comments — formal change proposal process |
| **MMKV** | High-performance, encrypted key-value store for React Native |
| **op-sqlite** | High-performance SQLite library for React Native (bare workflow) |
| **react-native-unity-view** | Library for embedding Unity as a native view inside React Native |
| **VAD** | Voice Activity Detection — detects when speech starts/ends in audio |
| **MSK** | Amazon Managed Streaming for Apache Kafka |
| **PgBouncer** | PostgreSQL connection pooler |
| **Unleash** | Open-source feature flag platform |
| **PostHog** | Open-source product analytics and session recording platform |
| **Fastlane** | Mobile app automation tool for building and releasing iOS/Android |
| **IL2CPP** | Unity's scripting backend that compiles C# to C++ for performance |
| **URP** | Unity Universal Render Pipeline |
| **TTI** | Time-to-Interactive — mobile performance metric |
| **RTO** | Recovery Time Objective — max acceptable downtime in disaster recovery |
| **RPO** | Recovery Point Objective — max acceptable data loss in disaster recovery |
| **Bridge** | The RN↔Unity message channel implemented via react-native-unity-view |
| **Asset Bundle** | Unity-compressed game asset package (scene, textures, audio) per world |

---

*End of LitPlay Master System Design Document — v2.0*  
*To propose a change, file an RFC per §32.*
```

---

## What this new SSOT fixes vs. the two prior docs

Here is a precise accounting of every change made:

### 🔧 Inconsistencies Fixed
| # | Issue | Resolution |
|---|-------|-----------|
| 1 | **Storage layer conflict** — new doc said both SQLite and MMKV with no clear split | §13.1 defines an explicit responsibility split: MMKV for key-value/tokens/queue metadata, op-sqlite for queryable session/gate/content records |
| 2 | **Expo ambiguity** — new doc implied bare RN but never said it; v1 said Expo managed | §7.1 explicitly says "bare workflow, use Expo modules à la carte only" with a clear rule and rationale |
| 3 | **Conflicting API styles** — v1 had REST+GraphQL; new doc had REST only | §11 locks REST-only as the contract; GraphQL is explicitly deferred |
| 4 | **Game-engine-service conflict** — v1 had server-side session orchestration; new doc had client-side Unity | §8–9 fully specifies the Unity-native + RN bridge model; no server-side game engine |
| 5 | **Speech calibration dropped** — new doc removed calibration endpoints from v1 | §11.7 + §12 fully restore the calibration endpoint AND specify that profiles are stored client-side only in MMKV |
| 6 | **Kafka vs Redis/BullMQ** — v1 used Redis Pub/Sub + BullMQ; new doc used Kafka | §15 standardizes on Kafka (MSK) definitively, removes all Redis queue references |
| 7 | **React Navigation vs Expo Router** — implicit conflict between docs | §7.1 explicitly specifies React Navigation v7 |

### ✅ Additions (things missing from both docs)
| # | Addition |
|---|---------|
| 1 | **Complete RBAC table** (§16.2) — neither doc had a consolidated role-permission matrix |
| 2 | **Token security rules** (§16.3) — access token memory-only policy made explicit with MMKV vs memory split |
| 3 | **Kafka message envelope schema** (§15.4) — both docs named topics but neither defined the message wrapper format |
| 4 | **Bridge error handling + timeout protocol** (§9.3) — neither doc specified what happens on bridge timeout |
| 5 | **Content bundle integrity verification** (§18.2) — SHA-256 checksum rule was missing |
| 6 | **Test coverage thresholds per layer** (§29.2) — neither doc specified minimum % by layer |
| 7 | **Performance budgets for mobile** (§28.1) — memory, battery, and frame rate budgets were absent |
| 8 | **Data retention policy table** (§17.2) — compliance data minimization rules were implicit only |
| 9 | **Inviolable rules** (§32) — three rules that can never be changed without unanimous vote |
| 10 | **Full glossary** (§33) — neither doc had a complete glossary |

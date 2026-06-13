# 📘 LitPlay — Master System Design Document (SSOT)
**Document Class:** System Design & Architecture Specification
**Persona:** Solution Architect / Senior Software Engineer
**Version:** 1.0.0
**Status:** Living Document — Source of Truth for All Build Decisions
**Classification:** Internal Engineering — Agent Ready

---

> **AGENT INSTRUCTION:** This document is the **Single Source of Truth (SSOT)** for the LitPlay platform. Every architectural decision, data contract, service boundary, environment variable, schema definition, API shape, deployment step, and feature spec is defined here. No implementation decision should be made that contradicts this document without a formal ADR (Architecture Decision Record) appended to Section 18. When in doubt, consult this doc first.

---

## 📑 TABLE OF CONTENTS

```
01. Document Metadata & Versioning
02. Product Definition & Problem Statement
03. Core Principles & Constraints
04. System Actors & Personas
05. High-Level Architecture
06. Monorepo Structure
07. Service Definitions & Contracts
08. Speech Recognition Pipeline (Deep Dive)
09. Game Engine Architecture
10. Database Design (Full Schema)
11. API Design (REST + GraphQL)
12. Authentication & Authorization
13. Frontend Architecture
14. Infrastructure & DevOps
15. Security & Compliance
16. Testing Strategy
17. Observability & Monitoring
18. Feature Specifications (MVP → V3)
19. Architecture Decision Records (ADR)
20. Glossary
```

---

## 01. Document Metadata & Versioning

```yaml
document:
  title: "LitPlay — Master System Design Document"
  version: "1.0.0"
  created: "2024-01-01"
  last_updated: "2024-01-01"
  owner: "Platform Architecture Team"
  reviewers:
    - role: "Lead Backend Engineer"
    - role: "Lead Frontend Engineer"
    - role: "ML/Speech Engineer"
    - role: "DevOps/SRE Engineer"
    - role: "Product Manager"
    - role: "Security Engineer"

changelog:
  - version: "1.0.0"
    date: "2024-01-01"
    author: "Solution Architect"
    changes: "Initial SSOT document created"

review_cycle: "Every sprint (2 weeks) or on any architectural change"
approval_required_for_changes:
  - "Service boundary modifications"
  - "Database schema changes"
  - "ASR pipeline changes"
  - "Auth/security changes"
  - "API contract changes"
```

---

## 02. Product Definition & Problem Statement

### 2.1 Mission Statement

> LitPlay eliminates passive screen time by making reading the **only** mechanism of interaction. Learners cannot progress without their voice — every tap, unlock, and reward is gated by successful oral reading. It is the only game where **you literally read your way forward**.

### 2.2 Problem Space

```
GLOBAL LITERACY GAP (2024):
─────────────────────────────────────────────────────────────
• 773 million adults worldwide lack basic literacy skills
• 250 million children cannot read after 4 years of schooling
• EdTech solutions are largely passive (watch, tap, swipe)
• Teachers carry 100% of literacy intervention burden
• Parents have no developmental alternative to passive gaming
• Existing tools are English-centric or single-language
─────────────────────────────────────────────────────────────

ROOT CAUSE ANALYSIS:
┌─────────────────────────────────────────────────────────┐
│ Problem          │ Current State       │ LitPlay Fix     │
├─────────────────────────────────────────────────────────┤
│ Passive learning │ Watch/tap games     │ Must speak aloud│
│ Teacher overload │ Manual assessments  │ Auto-reporting  │
│ Language lock-in │ English-only tools  │ 99-lang ASR     │
│ No parent tool   │ Mindless gaming     │ Lit-gated play  │
│ No measurement   │ Anecdotal progress  │ EGRA metrics    │
│ Low retention    │ Boring drill apps   │ Adventure worlds│
└─────────────────────────────────────────────────────────┘
```

### 2.3 Success Criteria (OKRs)

```
OBJECTIVE 1: Demonstrate measurable literacy improvement
  KR1: Learners improve reading grade level by ≥0.5 GE after 60 days
  KR2: Average session accuracy rate ≥ 75% by week 4
  KR3: Average words read per session ≥ 200 by week 8

OBJECTIVE 2: Achieve product-market fit
  KR1: D7 retention ≥ 40%, D30 retention ≥ 20%
  KR2: NPS score ≥ 50 (parents), ≥ 60 (teachers)
  KR3: 10,000 DAU within 90 days of launch

OBJECTIVE 3: Scale globally
  KR1: Support 10 languages at launch, 30 within 6 months
  KR2: Serve 3 geographic regions with <200ms API latency
  KR3: Platform handles 50,000 concurrent users without degradation
```

---

## 03. Core Principles & Constraints

### 3.1 Engineering Principles

```
PRINCIPLE 1: VOICE IS THE ONLY KEY
  → Every game mechanic is gated behind a reading validation event
  → No bypass, no skip, no tap-to-pass
  → Implementation must enforce this at API level, not just UI

PRINCIPLE 2: OFFLINE-FIRST
  → Core gameplay must function with zero connectivity
  → Sync on reconnect, never block on network
  → Target: 100% of MVP features work offline after initial sync

PRINCIPLE 3: LANGUAGE AGNOSTIC BY DESIGN
  → Zero hardcoded language assumptions in game logic
  → All text content is data, never code
  → RTL/LTR handled at render layer, not component level

PRINCIPLE 4: CHILD SAFETY ABOVE ALL
  → Audio is processed, never stored without explicit opt-in
  → COPPA/FERPA compliance is non-negotiable
  → Zero advertisements to under-13 users, ever

PRINCIPLE 5: ZERO PREP FOR EDUCATORS
  → Teachers should be onboarded in < 5 minutes
  → No configuration required to get a class reading
  → Reports auto-generate, never require manual input

PRINCIPLE 6: FAIL WITH GRACE, NEVER WITH SHAME
  → The ASR pipeline must give partial credit and hints
  → Failure states must be encouraging, never punitive
  → Every error state has a recovery path

PRINCIPLE 7: HORIZONTALLY SCALABLE FROM DAY ONE
  → No stateful services (state lives in Redis or DB)
  → All services containerized and independently deployable
  → Auto-scaling configured on all compute resources
```

### 3.2 Hard Constraints

```
CONSTRAINTS:
┌─────────────────────────────────────────────────────────────┐
│ Constraint              │ Limit                             │
├─────────────────────────────────────────────────────────────┤
│ ASR response time       │ ≤ 1500ms p95 (user-perceived)    │
│ App cold start time     │ ≤ 3s on mid-range Android device  │
│ Offline storage budget  │ ≤ 150MB per language pack        │
│ API response time       │ ≤ 200ms p99 (non-ASR endpoints)  │
│ Audio recording max     │ 30 seconds per reading gate      │
│ Minimum supported OS    │ iOS 14+, Android 8+              │
│ Child data retention    │ Purge all PII within 30 days     │
│                         │ of account deletion request      │
│ Uptime SLA              │ 99.9% (production)               │
│ Max bundle size (web)   │ ≤ 500KB initial JS bundle        │
└─────────────────────────────────────────────────────────────┘
```

---

## 04. System Actors & Personas

### 4.1 Actor Definitions

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ACTORS                                │
├──────────────┬──────────────────────────────────────────────────────┤
│ Actor        │ Description                                          │
├──────────────┼──────────────────────────────────────────────────────┤
│ LEARNER      │ Primary user. Age 3–18 (and adult learners).         │
│              │ Plays game, reads aloud, earns rewards.              │
│              │ May be pre-literate (age 3–5) up to teen reader.     │
├──────────────┼──────────────────────────────────────────────────────┤
│ PARENT       │ Account owner for under-13 learners.                 │
│              │ Views dashboards, sets limits, manages profiles.     │
│              │ Provides COPPA consent.                              │
├──────────────┼──────────────────────────────────────────────────────┤
│ TEACHER      │ Creates classrooms, assigns content, views           │
│              │ class-level and individual learner reports.          │
│              │ Requires zero technical literacy to operate.         │
├──────────────┼──────────────────────────────────────────────────────┤
│ SCHOOL ADMIN │ Manages district/school licenses, SSO, rosters.     │
│              │ Accesses aggregate analytics across classrooms.      │
├──────────────┼──────────────────────────────────────────────────────┤
│ CONTENT ED.  │ Uploads/edits reading content via CMS.              │
│              │ Assigns difficulty, tags, language, genre.          │
├──────────────┼──────────────────────────────────────────────────────┤
│ NGO/GOVT     │ Accesses impact dashboards. May white-label.        │
│              │ Integrates via Analytics API.                        │
├──────────────┼──────────────────────────────────────────────────────┤
│ SYSTEM       │ Automated actors: ASR pipeline, AI tutor engine,    │
│              │ scheduler (streaks, digests), analytics aggregator.  │
└──────────────┴──────────────────────────────────────────────────────┘
```

### 4.2 Permission Matrix

```
┌───────────────────────────────────────────────────────────────────────┐
│ ACTION                    │ Learner │ Parent │ Teacher │ Admin │ NGO  │
├───────────────────────────────────────────────────────────────────────┤
│ Play game / read aloud    │  ✅    │  ❌   │  ❌    │  ❌  │  ❌ │
│ View own progress         │  ✅    │  ✅*  │  ✅*   │  ✅  │  ❌ │
│ Edit own profile          │  ✅    │  ✅   │  ✅    │  ✅  │  ✅ │
│ Create classroom          │  ❌    │  ❌   │  ✅    │  ✅  │  ❌ │
│ View class analytics      │  ❌    │  ❌   │  ✅    │  ✅  │  ❌ │
│ View district analytics   │  ❌    │  ❌   │  ❌    │  ✅  │  ✅ │
│ Upload content            │  ❌    │  ❌   │  ✅**  │  ✅  │  ❌ │
│ Approve content           │  ❌    │  ❌   │  ❌    │  ✅  │  ❌ │
│ Manage licenses           │  ❌    │  ❌   │  ❌    │  ✅  │  ❌ │
│ Access Analytics API      │  ❌    │  ❌   │  ❌    │  ✅  │  ✅ │
│ Delete learner data       │  ❌    │  ✅   │  ❌    │  ✅  │  ❌ │
├───────────────────────────────────────────────────────────────────────┤
│ * = only for their linked learners / classroom members                │
│ ** = teacher-uploaded content requires admin approval before publish  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 05. High-Level Architecture

### 5.1 System Context Diagram (C4 Level 1)

```
                        ┌─────────────────────┐
                        │    External World    │
                        └─────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
   ┌──────▼──────┐        ┌───────▼───────┐      ┌───────▼───────┐
   │   Learner   │        │    Parent/    │      │   Teacher/    │
   │   (Mobile   │        │  Guardian     │      │    Admin      │
   │    or Web)  │        │  (Web/Mobile) │      │   (Web App)   │
   └──────┬──────┘        └───────┬───────┘      └───────┬───────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  │ HTTPS/WSS
                        ┌─────────▼─────────┐
                        │                   │
                        │   LitPlay Platform│
                        │                   │
                        │  ┌─────────────┐  │
                        │  │ API Gateway  │  │
                        │  └─────────────┘  │
                        │                   │
                        │  ┌─────────────┐  │
                        │  │ Microservice │  │
                        │  │  Mesh       │  │
                        │  └─────────────┘  │
                        │                   │
                        │  ┌─────────────┐  │
                        │  │  Data Layer  │  │
                        │  └─────────────┘  │
                        └─────────┬─────────┘
                                  │
          ┌───────────────────────┼──────────────────────┐
          │                       │                      │
   ┌──────▼──────┐        ┌───────▼───────┐     ┌───────▼──────┐
   │ OpenAI      │        │   Firebase    │     │  Clever /    │
   │ Whisper API │        │   (Push       │     │  ClassLink   │
   │ (ASR)       │        │    Notif.)    │     │  (Rostering) │
   └─────────────┘        └───────────────┘     └──────────────┘
```

### 5.2 Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          LITPLAY PLATFORM                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      CLIENT APPLICATIONS                        │   │
│  │                                                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │ React Native │  │  Next.js PWA │  │ Unity/Godot WebGL    │  │   │
│  │  │ Mobile App   │  │  Web App     │  │ Game Client          │  │   │
│  │  │ iOS + Android│  │  (Dashboard) │  │ (Embedded in app)    │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │   │
│  └─────────┼─────────────────┼─────────────────────┼──────────────┘   │
│            └─────────────────┼─────────────────────┘                  │
│                              │ HTTPS / WSS / gRPC                      │
│  ┌───────────────────────────▼─────────────────────────────────────┐   │
│  │                        API GATEWAY                              │   │
│  │              Kong Gateway (self-hosted on EKS)                  │   │
│  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │   │JWT Auth  │ │Rate Limit│ │  CORS    │ │ Request Logging  │  │   │
│  │   │Plugin    │ │Plugin    │ │  Plugin  │ │ Plugin           │  │   │
│  │   └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │   │
│  └───────────────────────────┬─────────────────────────────────────┘   │
│                              │                                          │
│  ┌───────────────────────────▼─────────────────────────────────────┐   │
│  │                     MICROSERVICES MESH                          │   │
│  │                    (Kubernetes + Istio)                         │   │
│  │                                                                 │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │   │
│  │  │   Auth     │ │   Game     │ │   Speech   │ │  Content   │  │   │
│  │  │  Service   │ │  Engine    │ │  Service   │ │  Service   │  │   │
│  │  │ :3001      │ │  Service   │ │  :3003     │ │  :3004     │  │   │
│  │  │            │ │  :3002     │ │            │ │            │  │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │   │
│  │                                                                 │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │   │
│  │  │ Progress / │ │ Analytics  │ │  AI Tutor  │ │  Notif.    │  │   │
│  │  │  Gamifi-   │ │  Service   │ │  Service   │ │  Service   │  │   │
│  │  │  cation    │ │  :3006     │ │  :3007     │ │  :3008     │  │   │
│  │  │  :3005     │ │            │ │            │ │            │  │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │   │
│  │                                                                 │   │
│  │  ┌────────────┐ ┌────────────┐                                  │   │
│  │  │  i18n /    │ │  Billing   │                                  │   │
│  │  │  L10n      │ │  Service   │                                  │   │
│  │  │  Service   │ │  :3010     │                                  │   │
│  │  │  :3009     │ │            │                                  │   │
│  │  └────────────┘ └────────────┘                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│  ┌───────────────────────────▼─────────────────────────────────────┐   │
│  │                        DATA LAYER                               │   │
│  │                                                                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────┐  │   │
│  │  │Postgres  │ │  Redis   │ │  S3 /    │ │Click-  │ │Pine-  │  │   │
│  │  │  (RDS)   │ │Cluster   │ │  R2      │ │House   │ │cone   │  │   │
│  │  │Primary   │ │          │ │  Media   │ │Analyti.│ │Vector │  │   │
│  │  │  DB      │ │Sessions/ │ │  Store   │ │  DB    │ │  DB   │  │   │
│  │  │          │ │  Cache   │ │          │ │        │ │       │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ └───────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 06. Monorepo Structure

### 6.1 Repository Layout

```
litplay/                                    ← Monorepo root
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                          ← PR checks (lint, test, build)
│   │   ├── cd-staging.yml                  ← Deploy to staging on merge to main
│   │   ├── cd-production.yml               ← Deploy to prod (manual approval gate)
│   │   ├── security-scan.yml               ← Weekly Snyk + OWASP scan
│   │   └── dependency-update.yml           ← Dependabot auto-PRs
│   └── CODEOWNERS                          ← Per-directory ownership rules
│
├── apps/
│   ├── mobile/                             ← React Native (Expo)
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginScreen.tsx
│   │   │   │   │   ├── SignupScreen.tsx
│   │   │   │   │   └── ParentalConsentScreen.tsx
│   │   │   │   ├── game/
│   │   │   │   │   ├── WorldMapScreen.tsx
│   │   │   │   │   ├── GameScreen.tsx      ← WebView → Unity/Godot
│   │   │   │   │   └── ReadingGateScreen.tsx
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── LearnerDashboard.tsx
│   │   │   │   │   └── ParentDashboard.tsx
│   │   │   │   └── settings/
│   │   │   ├── components/
│   │   │   │   ├── voice/
│   │   │   │   │   ├── VoiceRecorder.tsx   ← Core ASR trigger component
│   │   │   │   │   ├── WaveformVisualizer.tsx
│   │   │   │   │   └── ReadingPrompt.tsx
│   │   │   │   ├── game/
│   │   │   │   └── shared/
│   │   │   ├── services/
│   │   │   │   ├── asr.service.ts          ← Wraps Speech Service API
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── game.service.ts
│   │   │   │   └── offline.service.ts      ← Offline sync logic
│   │   │   ├── store/                      ← Zustand stores
│   │   │   │   ├── auth.store.ts
│   │   │   │   ├── game.store.ts
│   │   │   │   ├── progress.store.ts
│   │   │   │   └── offline.store.ts
│   │   │   ├── hooks/
│   │   │   ├── utils/
│   │   │   ├── constants/
│   │   │   │   ├── languages.ts            ← ISO 639-1 language registry
│   │   │   │   ├── routes.ts
│   │   │   │   └── config.ts
│   │   │   └── types/                      ← Shared TypeScript types (symlinked)
│   │   ├── assets/
│   │   │   ├── sounds/
│   │   │   ├── images/
│   │   │   └── fonts/
│   │   │       └── OpenDyslexic-Regular.ttf ← Accessibility font
│   │   ├── app.config.ts                   ← Expo config
│   │   └── package.json
│   │
│   ├── web/                                ← Next.js 14 (App Router)
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (teacher)/
│   │   │   │   ├── classroom/
│   │   │   │   ├── reports/
│   │   │   │   └── content/
│   │   │   ├── (parent)/
│   │   │   │   ├── progress/
│   │   │   │   └── settings/
│   │   │   ├── (admin)/
│   │   │   └── api/                        ← Next.js API routes (BFF layer)
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── game/                               ← Unity 2D Project
│       ├── Assets/
│       │   ├── Scripts/
│       │   │   ├── ReadingGate/
│       │   │   │   ├── ReadingGateController.cs ← CORE: gates all progression
│       │   │   │   ├── TextDisplayManager.cs
│       │   │   │   └── GateResultHandler.cs
│       │   │   ├── ASRBridge/
│       │   │   │   ├── ASRBridge.cs         ← Calls native mobile ASR
│       │   │   │   └── WebASRBridge.cs      ← Web Speech API (browser)
│       │   │   ├── GameEngine/
│       │   │   │   ├── SceneManager.cs
│       │   │   │   ├── DifficultyAdapter.cs
│       │   │   │   └── RewardEngine.cs
│       │   │   └── Analytics/
│       │   │       └── GameAnalyticsService.cs
│       │   ├── Scenes/
│       │   │   ├── World_1_EnchantedForest/
│       │   │   ├── World_2_SpaceStation/
│       │   │   └── World_3_AncientTemple/
│       │   ├── Prefabs/
│       │   └── StreamingAssets/
│       │       └── content/                ← Offline-cached reading content
│       └── ProjectSettings/
│
├── services/
│   ├── auth-service/                       ← NestJS
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── strategies/
│   │   │   │   │   ├── jwt.strategy.ts
│   │   │   │   │   ├── google.strategy.ts
│   │   │   │   │   └── microsoft.strategy.ts
│   │   │   │   └── guards/
│   │   │   │       ├── jwt-auth.guard.ts
│   │   │   │       └── roles.guard.ts
│   │   │   ├── users/
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── users.repository.ts
│   │   │   │   └── entities/
│   │   │   │       └── user.entity.ts
│   │   │   ├── coppa/
│   │   │   │   ├── parental-consent.service.ts ← COPPA consent workflows
│   │   │   │   └── age-verification.service.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── speech-service/                     ← Python FastAPI (GPU-capable)
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── routes/
│   │   │   │   │   └── transcribe.py       ← POST /transcribe
│   │   │   │   └── dependencies.py
│   │   │   ├── core/
│   │   │   │   ├── config.py
│   │   │   │   └── logging.py
│   │   │   ├── services/
│   │   │   │   ├── whisper_service.py      ← Whisper ASR wrapper
│   │   │   │   ├── validation_service.py   ← Fuzzy match + scoring
│   │   │   │   ├── audio_processor.py      ← Noise cancel, normalize
│   │   │   │   └── language_detector.py    ← ISO 639-1 auto-detect
│   │   │   ├── models/
│   │   │   │   ├── transcription.py        ← Pydantic models
│   │   │   │   └── validation_result.py
│   │   │   └── main.py
│   │   ├── tests/
│   │   ├── requirements.txt
│   │   ├── Dockerfile.gpu                  ← GPU-enabled container
│   │   └── Dockerfile.cpu                  ← CPU fallback
│   │
│   ├── game-engine-service/                ← NestJS
│   │   ├── src/
│   │   │   ├── sessions/
│   │   │   │   ├── sessions.controller.ts  ← Game session lifecycle
│   │   │   │   ├── sessions.service.ts
│   │   │   │   └── entities/
│   │   │   │       └── reading-session.entity.ts
│   │   │   ├── gates/
│   │   │   │   ├── gates.controller.ts     ← Reading gate event processing
│   │   │   │   ├── gates.service.ts
│   │   │   │   └── gate-result.processor.ts
│   │   │   ├── difficulty/
│   │   │   │   ├── difficulty-adapter.service.ts
│   │   │   │   └── flesch-kincaid.util.ts
│   │   │   └── events/
│   │   │       └── game-events.gateway.ts  ← WebSocket for real-time game state
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── content-service/                    ← NestJS
│   │   ├── src/
│   │   │   ├── content/
│   │   │   │   ├── content.controller.ts
│   │   │   │   ├── content.service.ts
│   │   │   │   └── entities/
│   │   │   │       └── content-item.entity.ts
│   │   │   ├── cms/
│   │   │   │   └── sanity.adapter.ts       ← Sanity.io CMS integration
│   │   │   ├── search/
│   │   │   │   └── content-search.service.ts ← Pinecone semantic search
│   │   │   └── localization/
│   │   │       └── locale-packs.service.ts ← Language pack generation
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── progress-service/                   ← NestJS
│   │   ├── src/
│   │   │   ├── progress/
│   │   │   ├── gamification/
│   │   │   │   ├── xp.service.ts
│   │   │   │   ├── badges.service.ts
│   │   │   │   ├── streaks.service.ts
│   │   │   │   └── leaderboard.service.ts  ← Redis sorted sets
│   │   │   └── reports/
│   │   │       ├── learner-report.service.ts
│   │   │       └── class-report.service.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── analytics-service/                  ← Python FastAPI
│   │   ├── app/
│   │   │   ├── ingestion/                  ← Event ingestion pipeline
│   │   │   ├── aggregation/                ← ClickHouse query layer
│   │   │   ├── egra/                       ← EGRA-aligned scoring models
│   │   │   └── exports/                    ← PDF/CSV report generation
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   ├── ai-tutor-service/                   ← Python FastAPI
│   │   ├── app/
│   │   │   ├── tutor/
│   │   │   │   ├── hint_generator.py       ← GPT-4o hint generation
│   │   │   │   ├── pronunciation_coach.py  ← Phoneme-level feedback
│   │   │   │   └── story_generator.py      ← Personalized story gen
│   │   │   └── prompts/                    ← Prompt templates (versioned)
│   │   │       ├── hint_prompt.txt
│   │   │       ├── story_prompt.txt
│   │   │       └── coach_prompt.txt
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── notification-service/               ← NestJS
│       ├── src/
│       │   ├── push/                       ← FCM/APNs push notifications
│       │   ├── email/                      ← SendGrid weekly digest
│       │   └── scheduler/                  ← Streak reminder jobs
│       ├── Dockerfile
│       └── package.json
│
├── packages/                               ← Shared packages (internal)
│   ├── types/                              ← Shared TypeScript interfaces
│   │   ├── src/
│   │   │   ├── user.types.ts
│   │   │   ├── game.types.ts
│   │   │   ├── speech.types.ts
│   │   │   ├── content.types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── validation/                         ← Shared Zod schemas
│   │   ├── src/
│   │   │   ├── auth.schema.ts
│   │   │   ├── game.schema.ts
│   │   │   └── content.schema.ts
│   │   └── package.json
│   │
│   ├── ui/                                 ← Shared React component library
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Button/
│   │   │   │   ├── ProgressBar/
│   │   │   │   ├── Badge/
│   │   │   │   └── ReadingText/            ← Karaoke-highlight component
│   │   │   └── themes/
│   │   │       ├── default.ts
│   │   │       └── dyslexia.ts             ← Accessibility theme
│   │   └── package.json
│   │
│   └── logger/                             ← Shared Winston/Pino logger
│       └── package.json
│
├── infrastructure/
│   ├── terraform/
│   │   ├── environments/
│   │   │   ├── staging/
│   │   │   └── production/
│   │   ├── modules/
│   │   │   ├── eks/                        ← EKS cluster definition
│   │   │   ├── rds/                        ← PostgreSQL RDS
│   │   │   ├── elasticache/                ← Redis cluster
│   │   │   ├── s3/                         ← Media storage buckets
│   │   │   ├── cloudfront/                 ← CDN distribution
│   │   │   └── vpc/                        ← Network topology
│   │   └── main.tf
│   │
│   ├── kubernetes/
│   │   ├── base/
│   │   │   ├── namespaces.yaml
│   │   │   ├── network-policies.yaml
│   │   │   └── service-accounts.yaml
│   │   ├── services/
│   │   │   ├── auth-service/
│   │   │   │   ├── deployment.yaml
│   │   │   │   ├── service.yaml
│   │   │   │   └── hpa.yaml                ← Horizontal Pod Autoscaler
│   │   │   ├── speech-service/
│   │   │   │   ├── deployment-gpu.yaml     ← GPU node selector
│   │   │   │   ├── service.yaml
│   │   │   │   └── hpa.yaml
│   │   │   └── [all other services]/
│   │   ├── ingress/
│   │   │   └── kong-ingress.yaml
│   │   └── monitoring/
│   │       ├── prometheus/
│   │       ├── grafana/
│   │       └── alertmanager/
│   │
│   └── helm/
│       └── litplay/                        ← Umbrella Helm chart
│           ├── Chart.yaml
│           ├── values.yaml
│           ├── values.staging.yaml
│           └── values.production.yaml
│
├── docs/
│   ├── SSOT.md                             ← THIS DOCUMENT
│   ├── adr/                                ← Architecture Decision Records
│   │   └── ADR-001-monorepo.md
│   ├── api/                                ← Auto-generated API docs
│   ├── runbooks/                           ← Operational runbooks
│   └── onboarding/
│
├── scripts/
│   ├── setup.sh                            ← Local dev bootstrap
│   ├── seed-db.ts                          ← Database seeding
│   ├── generate-types.sh                   ← Types from DB schema
│   └── load-test.js                        ← k6 load test scripts
│
├── turbo.json                              ← Turborepo pipeline config
├── pnpm-workspace.yaml                     ← PNPM workspace config
├── .env.example                            ← All env vars documented
├── .env.staging
├── docker-compose.yml                      ← Full local stack
├── docker-compose.test.yml                 ← Test environment
└── README.md
```

---

## 07. Service Definitions & Contracts

### 7.1 Service Registry

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SERVICE REGISTRY                               │
├──────────────────────┬──────────┬──────────┬───────────┬───────────┤
│ Service              │ Port     │ Language │ Protocol  │ Replicas  │
├──────────────────────┼──────────┼──────────┼───────────┼───────────┤
│ auth-service         │ 3001     │ Node.js  │ REST/JWT  │ 3 (min)   │
│ game-engine-service  │ 3002     │ Node.js  │ REST/WSS  │ 5 (min)   │
│ speech-service       │ 3003     │ Python   │ REST      │ 4 GPU     │
│ content-service      │ 3004     │ Node.js  │ REST/GQL  │ 3 (min)   │
│ progress-service     │ 3005     │ Node.js  │ REST/GQL  │ 3 (min)   │
│ analytics-service    │ 3006     │ Python   │ REST      │ 2 (min)   │
│ ai-tutor-service     │ 3007     │ Python   │ REST      │ 3 (min)   │
│ notification-service │ 3008     │ Node.js  │ REST      │ 2 (min)   │
│ i18n-service         │ 3009     │ Node.js  │ REST      │ 2 (min)   │
│ billing-service      │ 3010     │ Node.js  │ REST      │ 2 (min)   │
├──────────────────────┼──────────┼──────────┼───────────┼───────────┤
│ kong-gateway         │ 8000     │ Go       │ HTTP/TCP  │ 3 (min)   │
│ postgres (primary)   │ 5432     │ -        │ TCP       │ 1+1 (RR)  │
│ redis-cluster        │ 6379     │ -        │ TCP       │ 3 nodes   │
│ clickhouse           │ 9000     │ -        │ TCP/HTTP  │ 2 (min)   │
└──────────────────────┴──────────┴──────────┴───────────┴───────────┘
```

### 7.2 Inter-Service Communication Contracts

```
EVENT BUS: Redis Pub/Sub (for real-time events)
MESSAGE QUEUE: BullMQ on Redis (for async jobs)
SYNC CALLS: REST via internal Kubernetes DNS

INTERNAL DNS PATTERN:
  http://[service-name].litplay.svc.cluster.local:[port]

EVENTS PUBLISHED (topic → publisher → subscribers):
─────────────────────────────────────────────────────────────
  reading.gate.passed     → game-engine → progress, analytics
  reading.gate.failed     → game-engine → ai-tutor, analytics
  session.started         → game-engine → analytics
  session.ended           → game-engine → progress, analytics
  user.registered         → auth        → notification, analytics
  streak.at.risk          → progress    → notification
  streak.broken           → progress    → notification, analytics
  achievement.unlocked    → progress    → notification
  content.completed       → game-engine → progress, analytics
  class.report.requested  → web-bff     → analytics
─────────────────────────────────────────────────────────────

ASYNC JOBS (BullMQ queues):
  queue: asr-processing       → speech-service workers
  queue: report-generation    → analytics-service workers
  queue: email-digest         → notification-service workers
  queue: content-indexing     → content-service workers
  queue: streak-check         → progress-service (cron: 0 18 * * *)
```

---

## 08. Speech Recognition Pipeline (Deep Dive)

### 8.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              SPEECH RECOGNITION PIPELINE v1.0                       │
│                                                                     │
│  STEP 1: CAPTURE                                                    │
│  ─────────────                                                      │
│  Mobile (Native):                                                   │
│    iOS  → AVAudioSession → PCM float32 → base64 encode             │
│    Android → AudioRecord → PCM float32 → base64 encode             │
│                                                                     │
│  Browser (Web):                                                     │
│    Web Audio API → MediaRecorder → WebM/Opus → base64 encode        │
│                                                                     │
│  Format spec: 16kHz, 16-bit, mono PCM (Whisper optimal)            │
│  Max duration: 30 seconds                                           │
│  Min duration: 0.5 seconds (reject shorter)                         │
│                                                                     │
│  STEP 2: TRANSPORT                                                  │
│  ─────────────────                                                  │
│  POST /api/v1/speech/transcribe                                     │
│  Body: multipart/form-data                                          │
│  Fields:                                                            │
│    audio_data: base64 string                                        │
│    audio_format: "pcm_16k" | "webm_opus"                           │
│    language_code: ISO 639-1 (or "auto" for detection)              │
│    target_text: string (the text learner should have read)         │
│    session_id: UUID                                                 │
│    gate_id: UUID                                                    │
│                                                                     │
│  STEP 3: PRE-PROCESSING (audio_processor.py)                        │
│  ───────────────────────────────────────────                        │
│  a) Decode base64 → raw audio bytes                                 │
│  b) Convert to WAV if not already PCM                               │
│  c) Noise reduction (noisereduce library)                           │
│  d) Silence trimming (pydub: silence_thresh=-40dBFS)                │
│  e) Normalize amplitude (-20 LUFS target)                           │
│  f) Validate: duration 0.5s–30s, else reject 400                    │
│                                                                     │
│  STEP 4: LANGUAGE DETECTION (language_detector.py)                  │
│  ──────────────────────────────────────────────────                 │
│  IF language_code == "auto":                                        │
│    Run Whisper detect_language() on first 30s                       │
│    Confidence threshold: ≥ 0.70 (else fallback to user profile)    │
│  ELSE:                                                              │
│    Use provided language_code directly                              │
│                                                                     │
│  STEP 5: ASR TRANSCRIPTION (whisper_service.py)                     │
│  ─────────────────────────────────────────────                      │
│                                                                     │
│  Primary: Whisper large-v3 (self-hosted on GPU pods)                │
│    Model load: at container startup (warm)                          │
│    Inference: FP16 on NVIDIA T4/A10G                                │
│    Expected latency: 800ms–1200ms for 30s audio                     │
│                                                                     │
│  Fallback chain (on timeout >2000ms or GPU unavailable):            │
│    1. Whisper medium (faster, slightly less accurate)               │
│    2. Azure Cognitive Speech API (external, SLA-backed)             │
│    3. Web Speech API (client-side, browser-only fallback)           │
│                                                                     │
│  STEP 6: VALIDATION ENGINE (validation_service.py)                  │
│  ──────────────────────────────────────────────────                 │
│                                                                     │
│  Input:  transcript (ASR output), target_text (expected)            │
│  Output: ValidationResult                                           │
│                                                                     │
│  NORMALIZATION (both strings before comparison):                    │
│    - Lowercase                                                      │
│    - Strip punctuation                                              │
│    - Normalize unicode (NFD → NFC)                                  │
│    - Collapse whitespace                                             │
│    - Handle contractions (language-specific map)                    │
│                                                                     │
│  SCORING ALGORITHM (composite):                                     │
│                                                                     │
│  score = (                                                          │
│    levenshtein_similarity  × 0.40  +                               │
│    phonetic_similarity     × 0.35  +  ← Soundex / Metaphone        │
│    word_order_score        × 0.15  +  ← WER-based                  │
│    fluency_score           × 0.10     ← Words per minute           │
│  )                                                                  │
│                                                                     │
│  RESULT ROUTING:                                                    │
│  ┌────────────────┬──────────────┬──────────────────────────────┐  │
│  │  Score Range   │  Status      │  Action                      │  │
│  ├────────────────┼──────────────┼──────────────────────────────┤  │
│  │  ≥ 0.90        │  PASS        │  Unlock gate, award XP       │  │
│  │  0.75 – 0.89   │  PASS_PARTIAL│  Unlock, flag for review     │  │
│  │  0.60 – 0.74   │  RETRY       │  Show hint, highlight errors │  │
│  │  0.40 – 0.59   │  RETRY_COACH │  Activate AI tutor           │  │
│  │  < 0.40        │  COACH_MODE  │  Word-by-word breakdown      │  │
│  └────────────────┴──────────────┴──────────────────────────────┘  │
│                                                                     │
│  STEP 7: RESPONSE CONSTRUCTION                                      │
│  ──────────────────────────────                                     │
│  Return ValidationResult (see API section §11.3)                   │
│  Total pipeline SLA: ≤ 1500ms p95                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Speech Service Environment Variables

```bash
# speech-service/.env
WHISPER_MODEL_SIZE=large-v3          # Options: tiny, base, small, medium, large-v3
WHISPER_DEVICE=cuda                  # Options: cuda, cpu
WHISPER_COMPUTE_TYPE=float16         # Options: float16, int8 (CPU only)
WHISPER_BEAM_SIZE=5
WHISPER_LANGUAGE_DETECTION_THRESHOLD=0.70
AUDIO_MAX_DURATION_SECONDS=30
AUDIO_MIN_DURATION_SECONDS=0.5
AUDIO_NOISE_REDUCTION_ENABLED=true
AUDIO_TARGET_LUFS=-20
VALIDATION_PASS_THRESHOLD=0.90
VALIDATION_PARTIAL_THRESHOLD=0.75
VALIDATION_RETRY_THRESHOLD=0.60
VALIDATION_COACH_THRESHOLD=0.40
LEVENSHTEIN_WEIGHT=0.40
PHONETIC_WEIGHT=0.35
WORD_ORDER_WEIGHT=0.15
FLUENCY_WEIGHT=0.10
AZURE_SPEECH_KEY=<secret>            # Fallback ASR
AZURE_SPEECH_REGION=eastus
PIPELINE_TIMEOUT_MS=2000             # Trigger fallback after this
REDIS_URL=redis://redis:6379
SENTRY_DSN=<secret>
```

### 8.3 Offline ASR (On-Device)

```
OFFLINE STRATEGY:
─────────────────
Technology: whisper.cpp (C++ port, runs on-device)
iOS:        CoreML-accelerated whisper.cpp via Swift wrapper
Android:    NNAPI-accelerated whisper.cpp via JNI wrapper

Model sizes for offline:
  Language pack < 5 languages:  whisper-tiny (39MB)  → fast, lower accuracy
  Language pack 5–10 languages: whisper-base (74MB)  → balanced
  Premium offline:               whisper-small (244MB)→ near-server accuracy

Offline content cache:
  - Downloaded per language pack
  - Stored in app's Documents directory
  - Encrypted with AES-256 (device key)
  - Max 150MB per language pack (see §03.2)

Sync behavior:
  - Game state synced on next connection
  - Reading session data queued in SQLite (local)
  - Conflict resolution: server wins for progress, local wins for offline sessions
  - Max offline queue: 500 sessions before mandatory sync
```

---

## 09. Game Engine Architecture

### 9.1 Reading Gate State Machine

```
                    ┌─────────────────┐
                    │   GATE_IDLE     │ ← Player approaches gate trigger
                    └────────┬────────┘
                             │ onTriggerEnter()
                             ▼
                    ┌─────────────────┐
                    │  GATE_ACTIVE    │ ← Text displayed, mic enabled
                    │                 │   Timer starts (30s max)
                    └────────┬────────┘
                             │ onRecordingStart()
                             ▼
                    ┌─────────────────┐
                    │   RECORDING     │ ← Waveform visualizer active
                    │                 │   VAD detects end of speech
                    └────────┬────────┘
                             │ onRecordingEnd() / silence > 1.5s
                             ▼
                    ┌─────────────────┐
                    │   PROCESSING    │ ← Spinner shown, audio sent to ASR
                    │                 │   Timeout: 2000ms
                    └────────┬────────┘
                             │ onValidationResult()
                    ┌────────▼──────────────────────────────────┐
                    │           RESULT ROUTING                   │
                    └────────┬──────────────┬────────────────────┘
                             │              │              │
                    score≥0.75          0.40–0.74        <0.40
                             │              │              │
                    ┌────────▼────┐  ┌──────▼──────┐  ┌───▼──────────┐
                    │ GATE_OPEN   │  │ GATE_RETRY  │  │  COACH_MODE  │
                    │             │  │             │  │              │
                    │ ✅ Confetti │  │ Show hint   │  │ Word-by-word │
                    │ XP awarded  │  │ Highlight   │  │ AI tutor     │
                    │ Scene unlocks│  │ wrong words │  │ activated    │
                    └─────────────┘  └──────┬──────┘  └──────┬───────┘
                                            │                 │
                                     max 3 retries?     max 3 coached?
                                            │                 │
                                          YES               YES
                                            └────────┬────────┘
                                                     ▼
                                          ┌─────────────────┐
                                          │  GATE_ASSISTED  │
                                          │                 │
                                          │ Simplify text   │
                                          │ Lower threshold │
                                          │ (never block    │
                                          │  completely)    │
                                          └─────────────────┘
```

### 9.2 Difficulty Adaptation Engine

```
FLESCH-KINCAID GRADE LEVEL FORMULA:
  FK = 0.39 × (words/sentences) + 11.8 × (syllables/words) − 15.59

ADAPTATION ALGORITHM:
─────────────────────
Every 5 reading gates, DifficultyAdapter evaluates:

  if (rolling_accuracy_5_gates >= 0.88 AND avg_wpm > grade_target_wpm):
    increase_difficulty(+0.5 FK grade)

  if (rolling_accuracy_5_gates < 0.65 OR coach_mode_triggers >= 2):
    decrease_difficulty(-0.5 FK grade)

  else:
    maintain_current_difficulty()

CONTENT SELECTION QUERY:
  SELECT * FROM content_library
  WHERE language_code = :lang
  AND flesch_kincaid_grade BETWEEN :current_fk - 0.3 AND :current_fk + 0.3
  AND id NOT IN (SELECT content_id FROM learner_completed WHERE user_id = :uid)
  AND (genre IN (:preferred_genres) OR random() < 0.2)  ← 20% exploration
  ORDER BY random()
  LIMIT 1;

PHONICS PROGRESSION MAP:
  Level 1: CVC words (cat, dog, run)           → FK 0.5–1.0
  Level 2: Consonant blends (ship, frog)       → FK 1.0–1.5
  Level 3: Long vowels (cake, bike, home)      → FK 1.5–2.0
  Level 4: Digraphs (chair, whale, phone)      → FK 2.0–2.5
  Level 5: Multi-syllable words               → FK 2.5–4.0
  Level 6: Complex sentences                  → FK 4.0–6.0
  Level 7: Academic vocabulary               → FK 6.0+

SIGHT WORD INTEGRATION:
  Dolch sight words injected into every 3rd content piece
  Tracked separately from FK score
  Mastery threshold: 3 correct reads of same word across different texts
```

### 9.3 Game Worlds Specification

```
WORLD 1: THE ENCHANTED FOREST (FK 0.5 – 2.0)
────────────────────────────────────────────
  Target:     Ages 4–7, early readers
  Theme:      Fantasy, animals, nature
  Gates:      40 reading gates across 8 zones
  Gate types:
    - Locked doors (speak spell to open)
    - Sleeping animals (read a lullaby to wake them)
    - Bridges (read the bridge inscription to cross)
  Boss gate:  Read a full paragraph to defeat the Sleep Dragon
  Languages:  All supported languages
  Assets:     2D illustrated, warm colors, large text (48pt min)
  Font size:  48pt minimum (readability for young learners)

WORLD 2: SPACE STATION SIGMA (FK 2.0 – 5.0)
─────────────────────────────────────────────
  Target:     Ages 7–11, developing readers
  Theme:      Sci-fi, science, discovery
  Gates:      60 reading gates across 12 zones
  Gate types:
    - Airlock codes (read technical instructions)
    - Robot commands (read command sequences)
    - Mission logs (read narrative passages)
  Boss gate:  Read a 3-paragraph mission briefing
  Assets:     2D pixel art, cool colors, medium text (32pt min)

WORLD 3: ANCIENT TEMPLE OF WORDS (FK 5.0 – 9.0)
─────────────────────────────────────────────────
  Target:     Ages 10+, fluent readers
  Theme:      History, mythology, mystery
  Gates:      80 reading gates across 16 zones
  Gate types:
    - Ancient inscriptions (complex passages)
    - Scholar challenges (debate and argue text)
    - Prophecy chambers (read poetry aloud)
  Boss gate:  Read a 1-page historical excerpt
  Assets:     2D gothic art, dramatic colors, smaller text (24pt)
```

### 9.4 Unity/Game Bridge Protocol

```
UNITY ↔ REACT NATIVE COMMUNICATION:
  Protocol: JavaScript Bridge (react-native-webview postMessage)

MESSAGES FROM UNITY → REACT NATIVE:
  {
    type: "GATE_TRIGGERED",
    payload: {
      gateId: string,
      targetText: string,
      languageCode: string,
      difficultyLevel: number,
      gateType: "door" | "animal" | "bridge" | "boss"
    }
  }

  {
    type: "SESSION_EVENT",
    payload: {
      eventType: "start" | "checkpoint" | "world_complete",
      sessionId: string,
      worldId: string,
      zoneId: string
    }
  }

MESSAGES FROM REACT NATIVE → UNITY:
  {
    type: "GATE_RESULT",
    payload: {
      gateId: string,
      status: "PASS" | "PASS_PARTIAL" | "RETRY" | "RETRY_COACH" | "COACH_MODE",
      score: number,         // 0.0 – 1.0
      xpAwarded: number,
      transcript: string,
      wordErrors: string[]   // Words that didn't match
    }
  }

  {
    type: "COACH_HINT",
    payload: {
      gateId: string,
      hint: string,          // From AI tutor service
      highlightWords: string[]
    }
  }
```

---

## 10. Database Design (Full Schema)

### 10.1 PostgreSQL Schema (Primary Database)

```sql
-- ═══════════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- Composite indexes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- Encryption functions

-- ═══════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════
CREATE TYPE user_role AS ENUM (
  'learner', 'parent', 'teacher', 'school_admin', 'content_editor',
  'ngo_viewer', 'system_admin'
);

CREATE TYPE age_group AS ENUM (
  'pre_k',        -- 3–5
  'early',        -- 6–8
  'middle',       -- 9–12
  'teen',         -- 13–17
  'adult'         -- 18+
);

CREATE TYPE gate_status AS ENUM (
  'PASS', 'PASS_PARTIAL', 'RETRY', 'RETRY_COACH', 'COACH_MODE', 'SKIPPED'
);

CREATE TYPE content_genre AS ENUM (
  'adventure', 'sci_fi', 'folklore', 'nonfiction', 'poetry',
  'humor', 'mystery', 'history', 'science', 'mythology'
);

CREATE TYPE subscription_tier AS ENUM (
  'free', 'family', 'classroom', 'district', 'ngo'
);

CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms');

-- ═══════════════════════════════════════════════════════════
-- CORE USER TABLES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             VARCHAR(320) UNIQUE,         -- NULL for child accounts
  email_verified    BOOLEAN DEFAULT FALSE,
  phone             VARCHAR(20),
  phone_verified    BOOLEAN DEFAULT FALSE,
  role              user_role NOT NULL,
  display_name      VARCHAR(100) NOT NULL,
  avatar_url        VARCHAR(500),
  language_code     CHAR(2) NOT NULL DEFAULT 'en', -- ISO 639-1
  country_code      CHAR(2),                       -- ISO 3166-1 alpha-2
  age_group         age_group NOT NULL,
  date_of_birth     DATE,                          -- Stored for COPPA logic
  is_under_13       BOOLEAN GENERATED ALWAYS AS (
                      date_of_birth > CURRENT_DATE - INTERVAL '13 years'
                    ) STORED,
  coppa_consent_at  TIMESTAMPTZ,                   -- NULL = not given
  coppa_consented_by UUID REFERENCES users(id),   -- Parent user ID
  timezone          VARCHAR(50) DEFAULT 'UTC',
  is_active         BOOLEAN DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ,                   -- Soft delete
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_language ON users(language_code);

-- ─────────────────────────────────────────────────────────
CREATE TABLE user_auth_providers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      VARCHAR(50) NOT NULL,   -- 'google', 'microsoft', 'apple', 'email'
  provider_uid  VARCHAR(200) NOT NULL,  -- Provider's user ID
  access_token  TEXT,                   -- Encrypted at app level
  refresh_token TEXT,                   -- Encrypted at app level
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_uid)
);

-- ─────────────────────────────────────────────────────────
CREATE TABLE parent_child_links (
  parent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (parent_id, child_id)
);

-- ═══════════════════════════════════════════════════════════
-- LEARNER PROGRESS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE learner_progress (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_world_id        UUID,                        -- FK set after worlds table
  current_fk_grade        DECIMAL(4,2) DEFAULT 0.50,  -- Flesch-Kincaid grade
  words_read_total        INTEGER DEFAULT 0,
  sessions_total          INTEGER DEFAULT 0,
  reading_time_seconds    INTEGER DEFAULT 0,
  accuracy_rate_rolling   DECIMAL(5,4) DEFAULT 0,      -- Last 20 sessions avg
  wpm_rolling             DECIMAL(6,2) DEFAULT 0,      -- Words per minute avg
  xp_total                INTEGER DEFAULT 0,
  xp_this_week            INTEGER DEFAULT 0,
  streak_days             INTEGER DEFAULT 0,
  streak_longest          INTEGER DEFAULT 0,
  last_played_at          TIMESTAMPTZ,
  last_streak_check_at    DATE,
  egra_oral_reading_score DECIMAL(5,2),               -- EGRA assessment score
  egra_assessed_at        TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learner_progress_user ON learner_progress(user_id);
CREATE INDEX idx_learner_progress_xp ON learner_progress(xp_total DESC);

-- ─────────────────────────────────────────────────────────
CREATE TABLE phonics_mastery (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phonics_pattern VARCHAR(50) NOT NULL,    -- e.g. 'CVC', 'consonant_blend_sh'
  language_code   CHAR(2) NOT NULL,
  attempts        INTEGER DEFAULT 0,
  correct         INTEGER DEFAULT 0,
  mastery_level   SMALLINT DEFAULT 0,      -- 0: introduced, 1: practiced, 2: mastered
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  mastered_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, phonics_pattern, language_code)
);

-- ─────────────────────────────────────────────────────────
CREATE TABLE sight_word_mastery (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word            VARCHAR(100) NOT NULL,
  language_code   CHAR(2) NOT NULL,
  correct_reads   INTEGER DEFAULT 0,
  is_mastered     BOOLEAN DEFAULT FALSE,
  mastered_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, word, language_code)
);

CREATE INDEX idx_sight_word_user_lang ON sight_word_mastery(user_id, language_code);

-- ═══════════════════════════════════════════════════════════
-- READING SESSIONS & GATES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE reading_sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  world_id            UUID,
  zone_id             UUID,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  duration_seconds    INTEGER GENERATED ALWAYS AS (
                        EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
                      ) STORED,
  gates_attempted     INTEGER DEFAULT 0,
  gates_passed        INTEGER DEFAULT 0,
  words_read          INTEGER DEFAULT 0,
  xp_earned           INTEGER DEFAULT 0,
  avg_accuracy        DECIMAL(5,4),
  avg_wpm             DECIMAL(6,2),
  language_code       CHAR(2) NOT NULL,
  device_type         VARCHAR(20),             -- 'ios', 'android', 'web'
  is_offline_session  BOOLEAN DEFAULT FALSE,
  synced_at           TIMESTAMPTZ              -- NULL = not yet synced
);

CREATE INDEX idx_sessions_user ON reading_sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_date ON reading_sessions(started_at DESC);

-- ─────────────────────────────────────────────────────────
CREATE TABLE gate_attempts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  content_id          UUID NOT NULL,                     -- FK to content_library
  gate_id             VARCHAR(100) NOT NULL,             -- Unity gate identifier
  attempt_number      SMALLINT NOT NULL DEFAULT 1,       -- 1, 2, 3 (max per gate)
  target_text         TEXT NOT NULL,
  transcript_returned TEXT,
  levenshtein_score   DECIMAL(5,4),
  phonetic_score      DECIMAL(5,4),
  word_order_score    DECIMAL(5,4),
  fluency_score       DECIMAL(5,4),
  composite_score     DECIMAL(5,4),
  gate_status         gate_status NOT NULL,
  words_correct       INTEGER,
  words_incorrect     INTEGER,
  error_words         JSONB,                             -- [{word, position}]
  wpm                 DECIMAL(6,2),
  audio_duration_ms   INTEGER,
  asr_latency_ms      INTEGER,                           -- Pipeline perf tracking
  asr_engine_used     VARCHAR(50),                       -- 'whisper-large-v3' etc
  coach_hint_given    BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gate_attempts_session ON gate_attempts(session_id);
CREATE INDEX idx_gate_attempts_user ON gate_attempts(user_id, created_at DESC);
CREATE INDEX idx_gate_attempts_content ON gate_attempts(content_id);
-- NOTE: Audio recordings NOT stored in DB. 
-- If parent opts-in: URL stored in S3, reference stored here
CREATE TABLE audio_recordings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gate_attempt_id UUID NOT NULL REFERENCES gate_attempts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  s3_key          VARCHAR(500) NOT NULL,
  s3_bucket       VARCHAR(100) NOT NULL,
  duration_ms     INTEGER,
  file_size_bytes INTEGER,
  parent_opted_in BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at      TIMESTAMPTZ NOT NULL,               -- Auto-purge after 90 days
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- CONTENT LIBRARY
-- ═══════════════════════════════════════════════════════════
CREATE TABLE content_library (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_cms_id     VARCHAR(100) UNIQUE,              -- Sanity document ID
  language_code       CHAR(2) NOT NULL,
  title               VARCHAR(200) NOT NULL,
  text_content        TEXT NOT NULL,
  word_count          INTEGER NOT NULL,
  sentence_count      INTEGER NOT NULL,
  syllable_count      INTEGER NOT NULL,
  flesch_kincaid_grade DECIMAL(4,2) NOT NULL,
  difficulty_level    SMALLINT NOT NULL CHECK (difficulty_level BETWEEN 1 AND 10),
  genre               content_genre NOT NULL,
  age_group_min       SMALLINT DEFAULT 3,
  age_group_max       SMALLINT DEFAULT 99,
  tags                JSONB DEFAULT '[]',
  phonics_patterns    JSONB DEFAULT '[]',               -- Patterns present in text
  sight_words         JSONB DEFAULT '[]',               -- Sight words in text
  audio_example_s3    VARCHAR(500),                     -- Human read-aloud reference
  is_published        BOOLEAN DEFAULT FALSE,
  is_community        BOOLEAN DEFAULT FALSE,            -- Teacher-uploaded
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_language ON content_library(language_code, is_published);
CREATE INDEX idx_content_fk ON content_library(flesch_kincaid_grade);
CREATE INDEX idx_content_difficulty ON content_library(difficulty_level);
CREATE INDEX idx_content_search ON content_library USING gin(to_tsvector('english', text_content));

-- ─────────────────────────────────────────────────────────
CREATE TABLE learner_completed_content (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id      UUID NOT NULL REFERENCES content_library(id) ON DELETE CASCADE,
  completed_at    TIMESTAMPTZ DEFAULT NOW(),
  best_score      DECIMAL(5,4),
  PRIMARY KEY (user_id, content_id)
);

-- ═══════════════════════════════════════════════════════════
-- GAME WORLDS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE worlds (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  internal_key        VARCHAR(50) UNIQUE NOT NULL,    -- 'enchanted_forest' etc
  display_name        VARCHAR(100) NOT NULL,
  description         TEXT,
  fk_grade_min        DECIMAL(4,2) NOT NULL,
  fk_grade_max        DECIMAL(4,2) NOT NULL,
  sort_order          SMALLINT NOT NULL,
  is_active           BOOLEAN DEFAULT TRUE,
  unlock_condition    JSONB,                         -- e.g. {type: 'xp', value: 500}
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE world_zones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  world_id        UUID NOT NULL REFERENCES worlds(id),
  internal_key    VARCHAR(100) NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  sort_order      SMALLINT NOT NULL,
  gate_count      SMALLINT NOT NULL,
  UNIQUE(world_id, internal_key)
);

CREATE TABLE learner_world_progress (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id        UUID NOT NULL REFERENCES worlds(id),
  zone_id         UUID REFERENCES world_zones(id),
  gates_passed    INTEGER DEFAULT 0,
  gates_total     INTEGER DEFAULT 0,
  is_completed    BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, world_id)
);

-- ═══════════════════════════════════════════════════════════
-- GAMIFICATION
-- ═══════════════════════════════════════════════════════════
CREATE TABLE badges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  internal_key    VARCHAR(100) UNIQUE NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  icon_s3_key     VARCHAR(500),
  xp_value        INTEGER DEFAULT 0,
  trigger_type    VARCHAR(50) NOT NULL,              -- 'words_read', 'streak', 'world_complete'
  trigger_value   INTEGER NOT NULL,
  language_code   CHAR(2),                           -- NULL = all languages
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE learner_badges (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id        UUID NOT NULL REFERENCES badges(id),
  earned_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- ═══════════════════════════════════════════════════════════
-- CLASSROOM & EDUCATOR TABLES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE classrooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id      UUID NOT NULL REFERENCES users(id),
  school_id       UUID,                              -- FK to schools table
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  language_code   CHAR(2) NOT NULL,
  grade_level     SMALLINT,                          -- K=0, 1–12
  join_code       VARCHAR(8) UNIQUE NOT NULL,        -- Teacher shares this
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_classrooms_teacher ON classrooms(teacher_id);
CREATE INDEX idx_classrooms_join_code ON classrooms(join_code);

-- ─────────────────────────────────────────────────────────
CREATE TABLE classroom_members (
  classroom_id    UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (classroom_id, learner_id)
);

-- ─────────────────────────────────────────────────────────
CREATE TABLE classroom_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classroom_id    UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  world_id        UUID REFERENCES worlds(id),
  content_ids     JSONB DEFAULT '[]',                -- Specific content items
  due_date        DATE,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- SCHOOLS & ORGANIZATIONS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(200) NOT NULL,
  type                VARCHAR(50),                   -- 'school', 'district', 'ngo'
  country_code        CHAR(2),
  subscription_tier   subscription_tier NOT NULL DEFAULT 'free',
  subscription_start  DATE,
  subscription_end    DATE,
  max_seats           INTEGER,
  clever_id           VARCHAR(100),                  -- Clever rostering ID
  classlink_id        VARCHAR(100),
  sso_domain          VARCHAR(200),                  -- e.g. 'school.edu'
  lti_consumer_key    VARCHAR(200),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_members (
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_role    VARCHAR(50) NOT NULL DEFAULT 'member', -- 'admin', 'teacher', 'member'
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS & PREFERENCES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE notification_preferences (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak_reminders        BOOLEAN DEFAULT TRUE,
  weekly_digest           BOOLEAN DEFAULT TRUE,
  achievement_alerts      BOOLEAN DEFAULT TRUE,
  class_updates           BOOLEAN DEFAULT TRUE,
  preferred_channel       notification_channel DEFAULT 'push',
  quiet_hours_start       TIME DEFAULT '21:00',
  quiet_hours_end         TIME DEFAULT '08:00',
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════════════════════
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,              -- 'user.delete', 'content.approve'
  resource_type   VARCHAR(100),
  resource_id     UUID,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- FOREIGN KEY BACK-REFERENCES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE learner_progress ADD CONSTRAINT fk_lp_world
  FOREIGN KEY (current_world_id) REFERENCES worlds(id);

ALTER TABLE gate_attempts ADD CONSTRAINT fk_ga_content
  FOREIGN KEY (content_id) REFERENCES content_library(id);
```

### 10.2 Redis Data Structures

```
REDIS KEY CONVENTIONS:
  Prefix all keys: litplay:{env}:{service}:{type}:{id}

SESSION TOKENS:
  Key:    litplay:prod:auth:session:{user_id}
  Type:   Hash
  Fields: { token, refresh_token, expires_at, device_id }
  TTL:    86400s (24h), refresh extends to 30d

LEADERBOARD (Global XP):
  Key:    litplay:prod:progress:leaderboard:global:weekly
  Type:   Sorted Set
  Score:  xp_this_week (integer)
  Member: user_id
  TTL:    Reset every Monday 00:00 UTC (via cron job)

LEADERBOARD (Classroom):
  Key:    litplay:prod:progress:leaderboard:classroom:{classroom_id}
  Type:   Sorted Set
  Score:  xp_this_week
  TTL:    Reset weekly

RATE LIMITING (per user):
  Key:    litplay:prod:api:ratelimit:{user_id}:{endpoint}
  Type:   String (counter)
  TTL:    60s sliding window

ASR QUEUE POSITION:
  Key:    litplay:prod:speech:queue_depth
  Type:   String (counter, atomic INCR/DECR)

ACTIVE GAME SESSION:
  Key:    litplay:prod:game:session:{session_id}
  Type:   Hash
  Fields: { user_id, world_id, zone_id, gates_passed, started_at }
  TTL:    3600s (1 hour, extended on activity)

STREAK CACHE:
  Key:    litplay:prod:progress:streak:{user_id}
  Type:   Hash
  Fields: { current_streak, last_play_date, at_risk }
  TTL:    86400s

OFFLINE SYNC QUEUE:
  Key:    litplay:prod:sync:queue:{user_id}
  Type:   List (LPUSH on offline, RPOP on sync)
  TTL:    None (persistent until synced)

CONTENT CACHE:
  Key:    litplay:prod:content:item:{content_id}:{lang}
  Type:   JSON string
  TTL:    3600s (1 hour)
```

### 10.3 ClickHouse Analytics Schema

```sql
-- ClickHouse tables for high-volume analytics events
-- Partitioned by month for efficient querying

CREATE TABLE reading_events (
  event_id        UUID,
  event_type      LowCardinality(String),  -- 'gate_pass', 'gate_fail', 'session_start'
  user_id         UUID,
  session_id      UUID,
  content_id      UUID,
  world_id        UUID,
  language_code   LowCardinality(String),
  composite_score Float32,
  wpm             Float32,
  words_read      UInt32,
  gate_status     LowCardinality(String),
  device_type     LowCardinality(String),
  country_code    LowCardinality(String),
  age_group       LowCardinality(String),
  asr_engine      LowCardinality(String),
  asr_latency_ms  UInt32,
  event_at        DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_at)
ORDER BY (event_type, user_id, event_at)
TTL event_at + INTERVAL 2 YEAR;

CREATE TABLE daily_learner_aggregates (
  date            Date,
  user_id         UUID,
  words_read      UInt32,
  sessions_count  UInt16,
  gates_passed    UInt16,
  gates_attempted UInt16,
  reading_minutes Float32,
  avg_accuracy    Float32,
  avg_wpm         Float32,
  xp_earned       UInt32,
  language_code   LowCardinality(String)
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, user_id);
```

---

## 11. API Design

### 11.1 API Conventions

```
BASE URL:           https://api.litplay.io/api/v1
AUTHENTICATION:     Bearer {JWT} in Authorization header
CONTENT TYPE:       application/json (except file uploads)
VERSIONING:         URI versioning (/v1, /v2)
PAGINATION:         Cursor-based (cursor + limit params)
ERROR FORMAT:       RFC 7807 Problem Details

STANDARD RESPONSE ENVELOPE:
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO8601",
    "version": "1.0.0"
  }
}

ERROR RESPONSE:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [...],
    "request_id": "uuid"
  }
}

HTTP STATUS CODES USED:
  200 OK             → Successful GET, PUT, PATCH
  201 Created        → Successful POST (resource created)
  204 No Content     → Successful DELETE
  400 Bad Request    → Validation error
  401 Unauthorized   → Missing/invalid auth token
  403 Forbidden      → Insufficient permissions
  404 Not Found      → Resource doesn't exist
  409 Conflict       → Duplicate resource
  422 Unprocessable  → Business logic rejection
  429 Too Many Req.  → Rate limit exceeded
  500 Internal Error → Unexpected server error
  503 Unavailable    → Service unavailable (ASR timeout)
```

### 11.2 Auth Service Endpoints

```
POST   /api/v1/auth/register
  Body: {
    email: string,
    password: string,           // min 8 chars, 1 upper, 1 number
    display_name: string,
    role: "learner" | "parent" | "teacher",
    language_code: string,
    date_of_birth: string,      // YYYY-MM-DD
    country_code: string
  }
  Returns: { user: UserDTO, tokens: TokenPairDTO }
  Notes: If dob indicates under-13, triggers COPPA consent flow

POST   /api/v1/auth/login
  Body: { email: string, password: string, device_id: string }
  Returns: { user: UserDTO, tokens: TokenPairDTO }

POST   /api/v1/auth/refresh
  Body: { refresh_token: string }
  Returns: { tokens: TokenPairDTO }

POST   /api/v1/auth/logout
  Auth: Required
  Body: { refresh_token: string }
  Returns: 204

POST   /api/v1/auth/oauth/{provider}
  provider: "google" | "microsoft" | "apple" | "clever"
  Body: { code: string, redirect_uri: string }
  Returns: { user: UserDTO, tokens: TokenPairDTO }

POST   /api/v1/auth/coppa/consent
  Auth: Required (parent)
  Body: { child_user_id: string, consent: true }
  Returns: { child: UserDTO }

POST   /api/v1/auth/child-account
  Auth: Required (parent)
  Body: { display_name: string, date_of_birth: string, language_code: string }
  Returns: { child: UserDTO, pin: string }  // PIN for child login

DELETE /api/v1/auth/account
  Auth: Required
  Body: { confirmation: "DELETE MY ACCOUNT", reason?: string }
  Returns: 204
  Notes: Triggers GDPR/COPPA data deletion pipeline (async, 30-day window)
```

### 11.3 Speech Service Endpoints

```
POST   /api/v1/speech/transcribe
  Auth: Required
  Content-Type: multipart/form-data
  Fields:
    audio_data: File (WAV/WebM, max 5MB)
    language_code: string (ISO 639-1 or "auto")
    target_text: string (max 2000 chars)
    session_id: string (UUID)
    gate_id: string
    attempt_number: integer (1–3)
  Returns:
    {
      "data": {
        "gate_status": "PASS" | "PASS_PARTIAL" | "RETRY" | "RETRY_COACH" | "COACH_MODE",
        "composite_score": 0.87,
        "breakdown": {
          "levenshtein": 0.92,
          "phonetic": 0.85,
          "word_order": 0.88,
          "fluency": 0.75
        },
        "transcript": "the cat sat on the mat",
        "target_text": "The cat sat on the mat.",
        "words_correct": 6,
        "words_incorrect": 0,
        "error_words": [],
        "wpm": 85.3,
        "xp_awarded": 50,
        "hint": null,          // Populated if status requires hint
        "coach_message": null  // Populated if COACH_MODE
      }
    }
  Rate limit: 30 req/min per user
  SLA: ≤ 1500ms p95

GET    /api/v1/speech/languages
  Auth: None
  Returns: Array of supported language objects
    [{
      "code": "es",
      "name": "Spanish",
      "native_name": "Español",
      "rtl": false,
      "asr_confidence": "high",  // high | medium | low
      "offline_available": true
    }]

POST   /api/v1/speech/calibrate
  Auth: Required
  Description: User reads 5 calibration sentences; adjusts
               phonetic model to user's accent/dialect
  Body: { language_code: string }
  Returns: { calibration_id: string, sentences: string[] }

POST   /api/v1/speech/calibrate/{calibration_id}/complete
  Body: { audio_samples: File[] }  // 5 audio files
  Returns: { calibration_score: number, model_updated: boolean }
```

### 11.4 Game Engine Service Endpoints

```
POST   /api/v1/game/sessions/start
  Auth: Required (learner)
  Body: { world_id: string, device_type: string }
  Returns: { session: SessionDTO, first_gate: GateDTO }

PUT    /api/v1/game/sessions/{session_id}/end
  Auth: Required
  Body: { ended_at: string }
  Returns: { session: SessionSummaryDTO, rewards: RewardDTO[] }

POST   /api/v1/game/sessions/{session_id}/gates/{gate_id}/attempt
  Auth: Required
  Body: {
    content_id: string,
    attempt_number: integer,
    validation_result_id: string   // From speech service response
  }
  Returns: { gate_result: GateResultDTO, next_gate?: GateDTO }

GET    /api/v1/game/worlds
  Auth: Required
  Returns: Array<WorldDTO> with learner unlock status

GET    /api/v1/game/worlds/{world_id}/zones
  Auth: Required
  Returns: Array<ZoneDTO> with completion status

GET    /api/v1/game/content/next
  Auth: Required
  Query: { language_code, world_id, zone_id }
  Returns: ContentItemDTO (next appropriate content for learner)
  Notes: Uses difficulty adapter to select appropriate FK level

WebSocket: wss://api.litplay.io/api/v1/game/live
  Auth: token in query string (?token=JWT)
  Events published by server:
    game.state.updated
    gate.result.ready
    reward.unlocked
    session.timeout.warning
```

### 11.5 Progress Service Endpoints

```
GET    /api/v1/progress/me
  Auth: Required
  Returns: LearnerProgressDTO (full profile)

GET    /api/v1/progress/users/{user_id}
  Auth: Required (parent of user, teacher of user, admin)
  Returns: LearnerProgressDTO

GET    /api/v1/progress/me/sessions
  Auth: Required
  Query: { limit: 20, cursor: string, from: date, to: date }
  Returns: Paginated<SessionSummaryDTO>

GET    /api/v1/progress/me/badges
  Auth: Required
  Returns: Array<BadgeDTO> (earned and unearned, for display)

GET    /api/v1/progress/me/phonics
  Auth: Required
  Returns: PhonicsProfileDTO { mastered: [], practicing: [], not_started: [] }

GET    /api/v1/progress/leaderboard/global
  Auth: Required
  Query: { period: "weekly" | "alltime", limit: 50 }
  Returns: Array<LeaderboardEntryDTO>

GET    /api/v1/progress/leaderboard/classroom/{classroom_id}
  Auth: Required
  Returns: Array<LeaderboardEntryDTO>

GET    /api/v1/progress/classroom/{classroom_id}/summary
  Auth: Required (teacher of classroom, admin)
  Returns: ClassroomProgressSummaryDTO
    {
      classroom_id, name,
      learner_count: 28,
      avg_accuracy: 0.79,
      avg_words_per_session: 145,
      at_risk_learners: [{ user_id, display_name, accuracy_rate, last_active }],
      top_performers: [...],
      words_read_total: 45230,
      reading_time_minutes_total: 1240
    }

GET    /api/v1/progress/reports/learner/{user_id}
  Auth: Required (parent, teacher, admin)
  Query: { format: "json" | "pdf", period: "week" | "month" | "custom" }
  Returns: LearnerReportDTO or PDF binary
```

### 11.6 Content Service Endpoints

```
GET    /api/v1/content
  Auth: Required
  Query: {
    language_code: string,
    difficulty_min?: number,
    difficulty_max?: number,
    genre?: string,
    age_group_min?: number,
    age_group_max?: number,
    search?: string,         // Full-text search
    limit: 20,
    cursor?: string
  }
  Returns: Paginated<ContentItemDTO>

GET    /api/v1/content/{content_id}
  Auth: Required
  Returns: ContentItemDTO (includes full text, metadata)

POST   /api/v1/content
  Auth: Required (content_editor, teacher, admin)
  Body: ContentCreateDTO
  Returns: ContentItemDTO (status: pending_review if teacher-uploaded)

PUT    /api/v1/content/{content_id}/approve
  Auth: Required (admin only)
  Returns: ContentItemDTO (status: published)

GET    /api/v1/content/language-packs/{language_code}
  Auth: Required
  Description: Download offline language pack manifest
  Returns: {
    language_code: string,
    content_count: integer,
    pack_size_bytes: integer,
    download_url: string,     // Signed S3 URL, 1hr TTL
    checksum: string          // SHA-256
  }
```

---

## 12. Authentication & Authorization

### 12.1 Token Architecture

```
JWT STRUCTURE:
Header: { alg: "RS256", typ: "JWT" }
Payload: {
  sub: "user_uuid",
  email: "user@example.com",
  role: "teacher",
  org_id: "org_uuid",              // If member of org
  classroom_ids: ["uuid1"],        // Cached for teachers
  child_ids: ["uuid1"],            // Cached for parents
  is_under_13: false,
  iat: 1704067200,
  exp: 1704153600,                 // 24 hours
  jti: "unique_token_id"           // For revocation
}

ACCESS TOKEN TTL:   24 hours
REFRESH TOKEN TTL:  30 days (rotating refresh tokens)
ALGORITHM:          RS256 (asymmetric — public key verifiable by all services)

KEY MANAGEMENT:
  Private key: AWS Secrets Manager (auth-service only)
  Public key:  Published at https://api.litplay.io/.well-known/jwks.json
  Rotation:    Every 90 days (zero-downtime key rotation)
```

### 12.2 COPPA Flow

```
COPPA COMPLIANCE FLOW:
─────────────────────────────────────────────────────────────

1. User registers with date_of_birth
2. System calculates is_under_13
3. IF is_under_13 = TRUE:
   a. Create account in UNVERIFIED state
   b. Collect parent email (cannot be same as child)
   c. Send parent verification email (tokenized link)
   d. Parent clicks link → shown consent form (COPPA-compliant language)
   e. Parent consents → account activated
   f. Parent linked as guardian (parent_child_links)
   g. coppa_consent_at timestamp recorded

4. IF parent does not consent within 7 days:
   a. Send reminder email
   b. If 14 days total → soft-delete unverified account

5. WHAT CHILD ACCOUNTS CAN NEVER DO:
   - Provide personal information in free-text fields
   - See other users' personal information
   - Participate in any social features
   - Have audio stored without parent opt-in
   - Receive marketing communications

6. PARENT CONTROLS (always available):
   - Delete child account + all data
   - Download all child data (GDPR Article 20)
   - Revoke audio storage consent
   - Set daily time limits
   - Review session history
```

### 12.3 Rate Limiting Rules

```
RATE LIMIT RULES (enforced at Kong Gateway):
─────────────────────────────────────────────────────────────
Endpoint                    │ Limit          │ Window
─────────────────────────────────────────────────────────────
POST /auth/register          │ 5 req          │ 1 hour / IP
POST /auth/login             │ 10 req         │ 15 min / IP
POST /speech/transcribe      │ 30 req         │ 1 min / user
GET  /content                │ 100 req        │ 1 min / user
POST /game/sessions/start    │ 10 req         │ 1 hour / user
All other authenticated      │ 300 req        │ 1 min / user
All unauthenticated          │ 20 req         │ 1 min / IP
─────────────────────────────────────────────────────────────
Rate limit headers returned:
  X-RateLimit-Limit
  X-RateLimit-Remaining
  X-RateLimit-Reset
```

---

## 13. Frontend Architecture

### 13.1 Mobile App (React Native / Expo)

```
STATE MANAGEMENT ARCHITECTURE:
  Global State:  Zustand (lightweight, no boilerplate)
  Server State:  React Query (TanStack Query v5)
  Navigation:    Expo Router (file-based, like Next.js)
  Forms:         React Hook Form + Zod validation
  Animations:    Reanimated 3 + Moti

STORE DEFINITIONS:

// auth.store.ts
interface AuthStore {
  user: UserDTO | null;
  tokens: TokenPairDTO | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginDTO) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

// game.store.ts
interface GameStore {
  currentSession: SessionDTO | null;
  activeGate: GateDTO | null;
  currentWorld: WorldDTO | null;
  isRecording: boolean;
  isProcessingASR: boolean;
  lastGateResult: GateResultDTO | null;
  startSession: (worldId: string) => Promise<void>;
  endSession: () => Promise<void>;
  submitReading: (audioBase64: string) => Promise<void>;
}

// offline.store.ts
interface OfflineStore {
  isOnline: boolean;
  pendingSyncQueue: SyncEvent[];
  downloadedLanguages: string[];
  syncQueue: () => Promise<void>;
  downloadLanguagePack: (langCode: string) => Promise<void>;
}

VOICE RECORDER COMPONENT SPEC:
// components/voice/VoiceRecorder.tsx
Props: {
  targetText: string;
  languageCode: string;
  onResult: (result: GateResultDTO) => void;
  onError: (error: ASRError) => void;
  maxDuration?: number; // default: 30
  showWaveform?: boolean; // default: true
}

State machine:
  IDLE → COUNTDOWN (3-2-1) → RECORDING → PROCESSING → RESULT

Accessibility:
  - Haptic feedback on recording start/stop
  - VoiceOver/TalkBack support
  - Large tap targets (min 44px × 44px)
  - Color-blind safe result states (not just red/green)

READING TEXT DISPLAY SPEC:
// components/voice/ReadingPrompt.tsx
Props: {
  text: string;
  fontFamily?: "default" | "opendyslexic";
  fontSize?: "small" | "medium" | "large";
  highlightWords?: string[];     // Words to highlight (error words)
  kaoraoke?: boolean;           // Highlight word-by-word as user speaks
  languageCode: string;
  rtl?: boolean;                // Auto-detected from languageCode
}
```

### 13.2 Web App (Next.js 14)

```
ROUTING STRUCTURE (App Router):
  /                          → Marketing / landing
  /login                     → Auth
  /register                  → Auth (role selector)
  /app/                      → Authenticated zone
  /app/teacher/              → Teacher layout
  /app/teacher/dashboard     → Class overview
  /app/teacher/classroom/[id]→ Specific class
  /app/teacher/reports/[id]  → Learner report
  /app/teacher/content       → Content library browser
  /app/parent/               → Parent layout
  /app/parent/dashboard      → Children overview
  /app/parent/child/[id]     → Child progress
  /app/parent/settings       → Time limits, consent mgmt
  /app/admin/                → Admin layout (org-level)
  /app/admin/analytics       → Impact dashboard
  /app/admin/classrooms      → All classrooms
  /app/admin/users           → User management

RENDERING STRATEGY:
  Marketing pages:     Static (SSG)
  Dashboard pages:     Server Components + Client Islands
  Real-time pages:     Client Components (WebSocket)
  Reports:             SSR with streaming

DATA FETCHING PATTERN (Server Components):
  // app/teacher/classroom/[id]/page.tsx
  export default async function ClassroomPage({ params }) {
    const classroom = await getClassroom(params.id);  // Direct DB query
    const progress = await getClassProgress(params.id);
    return <ClassroomDashboard data={{ classroom, progress }} />;
  }
```

### 13.3 Design System

```
DESIGN TOKENS:
  Primary:      #4F46E5  (Indigo 600)
  Secondary:    #10B981  (Emerald 500)
  Accent:       #F59E0B  (Amber 500)
  Danger:       #EF4444  (Red 500)
  Success:      #22C55E  (Green 500)
  Warning:      #F97316  (Orange 500)
  Background:   #FAFAFA
  Surface:      #FFFFFF
  Text Primary: #111827
  Text Muted:   #6B7280

TYPOGRAPHY:
  Font (default):     Nunito (child-friendly, rounded)
  Font (dyslexia):    OpenDyslexic
  Font (mono):        JetBrains Mono (code/data displays)
  Scale:              Tailwind default (text-sm → text-4xl)
  Min game text size: 24pt (age 10+), 32pt (age 7–9), 48pt (age 3–6)

COMPONENT LIBRARY:
  Base: Radix UI (headless, accessible primitives)
  Styling: TailwindCSS + class-variance-authority (cva)
  Animation: Framer Motion (web), Reanimated (mobile)
  Charts: Recharts (teacher/parent dashboards)
  Icons: Lucide React

ACCESSIBILITY STANDARDS:
  Target:     WCAG 2.1 AA
  Color contrast ratio: ≥ 4.5:1 (text), ≥ 3:1 (UI components)
  Focus indicators: Visible ring on all interactive elements
  Motion:     Respect prefers-reduced-motion
  Screen readers: Full ARIA labeling on game elements
```

---

## 14. Infrastructure & DevOps

### 14.1 Environment Definitions

```
ENVIRONMENTS:
─────────────────────────────────────────────────────────────
Environment │ Purpose              │ Data        │ Deploy trigger
────────────┼──────────────────────┼─────────────┼───────────────
local       │ Developer machines   │ Synthetic   │ Manual
development │ Feature branches     │ Synthetic   │ PR auto-deploy
staging     │ Pre-prod validation  │ Anonymized  │ Merge to main
production  │ Live users           │ Real        │ Manual approval
────────────┴──────────────────────┴─────────────┴───────────────

ENVIRONMENT VARIABLE MANAGEMENT:
  Local:      .env.local (gitignored)
  Dev/Staging: AWS Secrets Manager → injected via Kubernetes secrets
  Production: AWS Secrets Manager + KMS encryption
  Never:      Hardcoded in code or committed to git
```

### 14.2 Kubernetes Configuration

```yaml
# kubernetes/services/speech-service/deployment-gpu.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: speech-service
  namespace: litplay-prod
  labels:
    app: speech-service
    version: "1.0.0"
spec:
  replicas: 4
  selector:
    matchLabels:
      app: speech-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0       # Zero-downtime deploys
  template:
    metadata:
      labels:
        app: speech-service
    spec:
      nodeSelector:
        node.kubernetes.io/instance-type: g4dn.xlarge  # GPU node
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
      containers:
        - name: speech-service
          image: litplay/speech-service:{{ .Values.image.tag }}
          ports:
            - containerPort: 3003
          resources:
            requests:
              memory: "4Gi"
              cpu: "2"
              nvidia.com/gpu: "1"
            limits:
              memory: "8Gi"
              cpu: "4"
              nvidia.com/gpu: "1"
          env:
            - name: WHISPER_MODEL_SIZE
              value: "large-v3"
            - name: WHISPER_DEVICE
              value: "cuda"
          envFrom:
            - secretRef:
                name: speech-service-secrets
          readinessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 60   # Model load time
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 90
            periodSeconds: 30
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 15"]  # Drain in-flight requests
---
# HPA for speech-service
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: speech-service-hpa
  namespace: litplay-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: speech-service
  minReplicas: 4
  maxReplicas: 16
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: External
      external:
        metric:
          name: litplay_asr_queue_depth
        target:
          type: AverageValue
          averageValue: "10"     # Scale out if queue > 10 per pod
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300   # 5min before scale-down
```

### 14.3 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint
      - run: pnpm turbo type-check

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test:unit --parallel
      - uses: codecov/codecov-action@v3
        with:
          threshold: 80%   # Fail if coverage drops below 80%

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: litplay_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo build
      - run: docker-compose -f docker-compose.test.yml up -d
      - run: pnpm turbo test:e2e
      - run: docker-compose down

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      - run: pnpm audit --audit-level=high

  build-and-push:
    needs: [lint-and-type-check, unit-tests, integration-tests]
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker images
        run: |
          docker build -t litplay/auth-service:${{ github.sha }} ./services/auth-service
          docker build -t litplay/speech-service:${{ github.sha }} \
            -f ./services/speech-service/Dockerfile.gpu ./services/speech-service
          # ... all services
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS \
            --password-stdin ${{ secrets.ECR_REGISTRY }}
          docker push litplay/auth-service:${{ github.sha }}
          # ... all services

  deploy-staging:
    needs: [build-and-push]
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        run: |
          helm upgrade --install litplay ./infrastructure/helm/litplay \
            --namespace litplay-staging \
            --values ./infrastructure/helm/litplay/values.staging.yaml \
            --set global.imageTag=${{ github.sha }} \
            --wait --timeout=10m
      - name: Run smoke tests
        run: pnpm run test:smoke --env=staging

  deploy-production:
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    environment: production    # Requires manual approval in GitHub
    steps:
      - name: Deploy canary (5%)
        run: |
          helm upgrade litplay ./infrastructure/helm/litplay \
            --set canary.enabled=true \
            --set canary.weight=5 \
            --set global.imageTag=${{ github.sha }}
      - name: Monitor canary (15 min)
        run: ./scripts/monitor-canary.sh 900 0.1  # 15min, <10% error rate
      - name: Full rollout
        run: |
          helm upgrade litplay ./infrastructure/helm/litplay \
            --set canary.enabled=false \
            --set global.imageTag=${{ github.sha }}
      - name: Notify Slack
        run: ./scripts/notify-deploy.sh "Production deploy complete"
```

### 14.4 Terraform Infrastructure

```hcl
# infrastructure/terraform/modules/eks/main.tf

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "litplay-${var.environment}"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true

  eks_managed_node_groups = {
    # General purpose nodes
    general = {
      instance_types = ["m6i.xlarge"]
      min_size       = 3
      max_size       = 20
      desired_size   = 5
      labels = {
        role = "general"
      }
    }

    # GPU nodes for ASR
    gpu = {
      instance_types = ["g4dn.xlarge"]
      min_size       = 2
      max_size       = 8
      desired_size   = 4
      ami_type       = "AL2_x86_64_GPU"
      labels = {
        role = "gpu"
      }
      taints = [{
        key    = "nvidia.com/gpu"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  tags = {
    Environment = var.environment
    Project     = "litplay"
    ManagedBy   = "terraform"
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier              = "litplay-${var.environment}-postgres"
  engine                  = "postgres"
  engine_version          = "16.1"
  instance_class          = var.environment == "production" ? "db.r6g.xlarge" : "db.t3.medium"
  allocated_storage       = 100
  max_allocated_storage   = 1000       # Auto-scaling storage
  storage_encrypted       = true
  kms_key_id             = aws_kms_key.rds.arn

  db_name  = "litplay"
  username = "litplay_admin"
  password = random_password.db_password.result

  multi_az               = var.environment == "production"
  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  deletion_protection    = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"

  performance_insights_enabled = true

  tags = local.common_tags
}
```

### 14.5 Multi-Region Strategy

```
REGION DEPLOYMENT:

PRIMARY:   us-east-1 (N. Virginia)    → Americas
SECONDARY: eu-west-1 (Ireland)        → Europe, Africa
TERTIARY:  ap-southeast-1 (Singapore) → Asia Pacific

ROUTING: AWS Route53 Latency-based routing
  → User routed to lowest-latency region automatically

DATA RESIDENCY:
  EU users: Data stored in eu-west-1 (GDPR compliance)
  All others: us-east-1 primary

DATABASE REPLICATION:
  PostgreSQL: Primary in us-east-1, read replicas in eu-west-1 + ap-southeast-1
  Redis:      Regional clusters, no cross-region replication (session data local)
  S3:         Cross-region replication enabled (media/audio)

CONTENT DELIVERY:
  CloudFront with edge locations in 200+ cities
  Game assets served from edge (< 50ms globally)
  Language packs cached at edge (invalidated on update)
```

---

## 15. Security & Compliance

### 15.1 Security Architecture

```
DEFENSE IN DEPTH LAYERS:
─────────────────────────────────────────────────────────────

LAYER 1: NETWORK
  - VPC with private subnets for all services
  - Public subnets: only API Gateway (Kong) and Load Balancer
  - Security Groups: least-privilege ingress/egress rules
  - No direct database access from internet (ever)
  - WAF (AWS WAF v2) on CloudFront:
      Rules: OWASP Top 10, SQL injection, XSS, Rate limiting

LAYER 2: TRANSPORT
  - TLS 1.3 minimum (TLS 1.2 for older clients, TLS 1.1 rejected)
  - HSTS with preloading
  - Certificate: ACM with auto-renewal
  - Certificate pinning: Mobile apps pin to root CA

LAYER 3: APPLICATION
  - JWT with RS256 (asymmetric, not HS256)
  - Short-lived access tokens (24h)
  - Refresh token rotation (old token invalidated on use)
  - CSRF protection: SameSite=Strict cookies + Origin header check
  - Input validation: Zod schemas on all endpoints (API layer)
  - SQL injection: Parameterized queries only (TypeORM/SQLAlchemy)
  - XSS: Content Security Policy headers, output encoding
  - Sensitive fields: PII encrypted at application level (AES-256)
    (email, date_of_birth, device identifiers)

LAYER 4: DATA
  - Database encryption at rest (AES-256, AWS KMS)
  - S3 encryption: SSE-KMS
  - Redis encryption: in-transit and at-rest
  - Database credentials: AWS Secrets Manager (rotated every 30 days)
  - PII masked in logs (regex redaction in logger)

LAYER 5: OPERATIONAL
  - Principle of least privilege (IAM roles per service)
  - No shared credentials between services
  - Secrets Manager for all credentials (zero .env in prod)
  - CloudTrail for all AWS API calls
  - GuardDuty for threat detection
```

### 15.2 Compliance Matrix

```
┌──────────────────────────────────────────────────────────────────────┐
│                     COMPLIANCE REQUIREMENTS                          │
├──────────────┬────────────────────────────────────────────────────── │
│ Regulation   │ Implementation                                        │
├──────────────┼────────────────────────────────────────────────────── │
│ COPPA (US)   │ • Parental consent gate for under-13                 │
│              │ • No behavioral advertising to children              │
│              │ • Data minimization (collect only what's needed)     │
│              │ • Parental access/deletion rights                    │
│              │ • No sharing of child data with 3rd parties          │
│              │ • Privacy Policy in plain language                   │
├──────────────┼────────────────────────────────────────────────────── │
│ FERPA (US)   │ • Teacher/school owns student educational records    │
│              │ • Students can request their data                    │
│              │ • Annual notification of FERPA rights                │
│              │ • School consent required for disclosure             │
├──────────────┼────────────────────────────────────────────────────── │
│ GDPR (EU)    │ • Legal basis documented for all processing          │
│              │ • Right to access (download all data)                │
│              │ • Right to erasure (delete all data in 30 days)      │
│              │ • Data portability (export in JSON/CSV)              │
│              │ • DPA (Data Processing Agreement) for EU schools     │
│              │ • Data retention limits enforced (automated purge)   │
│              │ • GDPR rep in EU (required for non-EU companies)     │
├──────────────┼────────────────────────────────────────────────────── │
│ WCAG 2.1 AA  │ • 4.5:1 contrast ratio (text)                       │
│              │ • Keyboard navigable (all interactions)              │
│              │ • Screen reader support (ARIA)                       │
│              │ • No seizure-inducing animations                     │
│              │ • Dyslexia font option                               │
│              │ • Captions for audio content                         │
├──────────────┼────────────────────────────────────────────────────── │
│ SOC 2 Type 2 │ Target: 12 months post-launch                        │
│              │ Controls: Security, Availability, Confidentiality    │
└──────────────┴────────────────────────────────────────────────────── │
```

### 15.3 Data Retention Policy

```
DATA RETENTION SCHEDULE:
─────────────────────────────────────────────────────────────
Data Type                    │ Retention    │ Auto-delete?
─────────────────────────────────────────────────────────────
Active user account          │ Until deleted│ No
Anonymized analytics         │ 3 years      │ Yes (ClickHouse TTL)
Audio recordings (opted-in)  │ 90 days      │ Yes (S3 lifecycle)
Audio recordings (default)   │ 0 days       │ Never stored
Session logs                 │ 1 year       │ Yes (PostgreSQL job)
Raw gate_attempts            │ 1 year       │ Yes
Aggregated progress          │ Account life │ No
Audit logs                   │ 3 years      │ Yes
Deleted account PII          │ 30 days      │ Yes (hard delete)
Email logs                   │ 30 days      │ Yes
IP addresses in logs         │ 7 days       │ Yes (log pipeline)
─────────────────────────────────────────────────────────────

AUTOMATED PURGE JOBS (cron, daily at 02:00 UTC):
  purge_expired_audio_recordings()
  purge_old_session_logs()
  purge_deleted_account_pii()
  purge_expired_audit_logs()
```

---

## 16. Testing Strategy

### 16.1 Testing Pyramid

```
                        ┌─────────────┐
                        │     E2E     │  ← 10% of tests
                        │  (Playwright│    Full user journeys
                        │  / Detox)   │    Runs: pre-deploy
                        └──────┬──────┘
                               │
                    ┌──────────▼──────────┐
                    │    INTEGRATION      │ ← 30% of tests
                    │  (Service contracts,│   API tests, DB tests
                    │   API endpoint tests│   Runs: every PR
                    └──────────┬──────────┘
                               │
           ┌───────────────────▼───────────────────┐
           │              UNIT TESTS                │ ← 60% of tests
           │  (Jest / Vitest / Pytest)              │   Business logic
           │  Validation engine, ASR scoring,       │   Runs: every commit
           │  Difficulty adapter, Auth logic         │
           └───────────────────────────────────────┘

COVERAGE TARGETS:
  Overall:          ≥ 80%
  speech-service:   ≥ 90% (critical path)
  auth-service:     ≥ 90%
  game-engine:      ≥ 85%
  All others:       ≥ 75%
```

### 16.2 Critical Test Cases

```
SPEECH SERVICE TEST SUITE (must pass 100%):

Test: Perfect match
  Input:  target="The cat sat on the mat"
          transcript="The cat sat on the mat"
  Expect: score ≥ 0.95, status=PASS

Test: Minor mispronunciation (phonetic similarity)
  Input:  target="Elephant"
          transcript="Elefant"
  Expect: score ≥ 0.75, status=PASS or RETRY
  Rationale: Phonetic score should compensate for spelling difference

Test: Word substitution (different word)
  Input:  target="The big brown fox"
          transcript="The big red fox"
  Expect: score ≈ 0.70–0.80, status=RETRY

Test: Missing words (partial reading)
  Input:  target="She sells seashells by the seashore"
          transcript="She sells seashells"
  Expect: score < 0.60, status=RETRY_COACH

Test: Empty transcript (silence)
  Input:  target="Hello world"
          transcript=""
  Expect: score = 0, status=COACH_MODE

Test: Different language transcript
  Input:  target="Hello" (language=en)
          transcript="Hola" (ASR returned Spanish)
  Expect: score < 0.40, status=COACH_MODE

Test: Arabic RTL text
  Input:  target="مرحبا" (Arabic)
          transcript="مرحبا"
  Expect: score ≥ 0.90, status=PASS

Test: ASR timeout → fallback
  Condition: Whisper large-v3 times out at 2000ms
  Expect: System falls back to Whisper medium, returns result

COPPA TEST SUITE:
  Test: Under-13 cannot access adult content endpoints
  Test: Under-13 cannot send messages or view other profiles
  Test: Child account created without parent consent stays unverified
  Test: Parent deletion request wipes all child PII within 30 days
  Test: Audio not stored without explicit parent opt-in
```

### 16.3 Load Testing Specs

```bash
# scripts/load-test.js (k6)
# Run: k6 run --env ENV=staging scripts/load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    // Simulate 50,000 concurrent users (peak load)
    peak_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 1000 },   // Ramp up
        { duration: '10m', target: 5000 },  // Sustained load
        { duration: '5m', target: 10000 },  // Peak
        { duration: '5m', target: 0 },      // Ramp down
      ],
    },
    // ASR-specific spike test
    asr_spike: {
      executor: 'constant-arrival-rate',
      rate: 500,                    // 500 transcriptions per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p95<200', 'p99<500'],        // Non-ASR endpoints
    'http_req_duration{endpoint:transcribe}': ['p95<1500'],  // ASR endpoint
    http_req_failed: ['rate<0.01'],                   // <1% error rate
  },
};
```

---

## 17. Observability & Monitoring

### 17.1 Metrics Architecture

```
METRICS STACK:
  Collection:  Prometheus (pull-based, scrapes all services)
  Storage:     Prometheus + Thanos (long-term, S3-backed)
  Dashboards:  Grafana (self-hosted on EKS)
  Alerting:    Alertmanager → PagerDuty + Slack

KEY DASHBOARDS (Grafana):
  1. System Health        → Pod status, CPU, memory, error rates
  2. ASR Performance      → Latency p50/p95/p99, throughput, fallback rate
  3. Game Engagement      → Active sessions, gates/min, completion rates
  4. Business Metrics     → DAU, MRR, churn, new registrations
  5. Literacy Outcomes    → Avg FK grade Δ, accuracy trends, words read
  6. Infrastructure Cost  → AWS spend by service, GPU utilization

PROMETHEUS CUSTOM METRICS (per service):

speech-service:
  litplay_asr_requests_total{status, language, engine}
  litplay_asr_latency_ms{quantile, engine}
  litplay_asr_fallback_total{from_engine, to_engine, reason}
  litplay_asr_queue_depth
  litplay_validation_score_histogram{status}

game-engine-service:
  litplay_gate_attempts_total{status, world, language}
  litplay_sessions_active
  litplay_sessions_started_total
  litplay_gates_per_session_histogram

progress-service:
  litplay_xp_awarded_total
  litplay_badges_earned_total
  litplay_streaks_active_gauge
```

### 17.2 Alerting Rules

```yaml
# prometheus/alerts/critical.yaml
groups:
  - name: litplay.critical
    rules:
      - alert: ASRHighErrorRate
        expr: |
          rate(litplay_asr_requests_total{status="error"}[5m]) /
          rate(litplay_asr_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "ASR error rate above 5% for 2 minutes"
          runbook: "https://docs.litplay.io/runbooks/asr-errors"
          action: "Check speech-service pods, Whisper model health, GPU status"

      - alert: ASRLatencyHigh
        expr: |
          histogram_quantile(0.95, litplay_asr_latency_ms) > 2000
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "ASR p95 latency exceeds 2000ms"

      - alert: DatabaseConnectionPoolExhausted
        expr: |
          pg_stat_activity_count > pg_settings_max_connections * 0.85
        for: 1m
        labels:
          severity: critical

      - alert: PodCrashLooping
        expr: |
          rate(kube_pod_container_status_restarts_total[15m]) > 3
        labels:
          severity: critical

  - name: litplay.warning
    rules:
      - alert: HighChurnRate
        expr: |
          (litplay_users_deleted_7d / litplay_users_created_7d) > 0.15
        for: 24h
        labels:
          severity: warning
          team: product

      - alert: LowASRAccuracy
        expr: |
          avg(litplay_validation_score_histogram) < 0.60
        for: 1h
        labels:
          severity: warning
          team: ml
```

### 17.3 Logging Standards

```
LOG FORMAT: Structured JSON (all services)
TRANSPORT:  Fluent Bit → CloudWatch Logs → Athena (queryable)
RETENTION:  7 days (hot), 90 days (cold in S3)

MANDATORY LOG FIELDS:
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "speech-service",
  "version": "1.0.0",
  "environment": "production",
  "request_id": "uuid",
  "user_id": "REDACTED",          ← Never log real user_id in errors
  "trace_id": "opentelemetry_trace_id",
  "span_id": "opentelemetry_span_id",
  "message": "Human readable message",
  "data": { ... }                 ← Context-specific, PII stripped
}

PII REDACTION RULES (applied in logger middleware):
  Redact: email, date_of_birth, display_name, ip_address (after 7 days)
  Mask:   user_id in error logs → "usr_***a1b2"
  Never log: passwords, tokens, audio data, COPPA consent details

DISTRIBUTED TRACING:
  Standard: OpenTelemetry
  Exporter: Jaeger (self-hosted on EKS)
  Sampling: 100% errors, 10% successful requests
  Propagation: W3C Trace Context headers between services
```

---

## 18. Feature Specifications

### 18.1 Core Reading Gate (MVP — P0)

```
FEATURE: Reading Gate
PRIORITY: P0 (MVP blocker)
OWNER: Game Engine Team
STATUS: In Development

DESCRIPTION:
  The fundamental mechanic. Every progression point in the game
  requires a successful vocal reading of displayed text.

ACCEPTANCE CRITERIA:
  AC1: Text is displayed clearly before the gate trigger
  AC2: Microphone permission requested on first gate encounter
  AC3: 3-2-1 countdown before recording starts
  AC4: Waveform visualizer active during recording
  AC5: Recording auto-stops after 1.5s of silence or 30s max
  AC6: Processing indicator shown while ASR pipeline runs
  AC7: Result displayed within 1500ms of recording end (p95)
  AC8: PASS state: animation plays, gate opens, XP awarded
  AC9: RETRY state: specific wrong words highlighted in text
  AC10: COACH_MODE: word-by-word breakdown with phonetic hints
  AC11: After 3 failed attempts: difficulty auto-reduces by 0.5 FK
  AC12: Gate NEVER permanently blocks (learner can always progress)
  AC13: Works offline (on-device Whisper fallback)
  AC14: Supports RTL text display for Arabic/Hebrew/Urdu
  AC15: Font size appropriate for learner age group

TECHNICAL NOTES:
  - Gate state machine defined in §09.1
  - ASR pipeline defined in §08.1
  - Unity↔RN bridge protocol defined in §09.4
  - Target text stored in content_library, fetched via /content/next
  - Gate attempt persisted to gate_attempts table
  - XP calculation: base_xp × (1 + (score - 0.75)) × streak_multiplier
    where streak_multiplier = 1 + (streak_days * 0.05), max 2.0

XP AWARD TABLE:
  PASS (score ≥ 0.90):         50 XP × difficulty_level
  PASS_PARTIAL (0.75–0.89):    35 XP × difficulty_level
  (anything below passes): 0 XP (but gate opens after 3 COACH attempts)
```

### 18.2 AI Tutor "Lex the Owl" (V2 — P1)

```
FEATURE: AI Tutor
PRIORITY: P1 (V2)
OWNER: AI Team
STATUS: Planned

DESCRIPTION:
  An encouraging owl character (Lex) provides real-time pronunciation
  coaching, contextual hints, and motivational feedback.
  NEVER shame-based. ALWAYS encouraging.

BEHAVIOR SPECIFICATION:

  ON RETRY (score 0.60–0.74):
    Display:  Highlight incorrect words in amber
    Message:  "[Word] — try saying it like this: [phonetic breakdown]"
    Voice:    Optional TTS of correct pronunciation
    Example:  "Almost! Try 'el-e-phant' — three parts!"

  ON RETRY_COACH (score 0.40–0.59):
    Display:  Word-by-word breakdown panel
    Lex says: "Let's try it together! I'll say it, then you!"
    Action:   Play audio example of target word
    TTS:      Lex reads correct version aloud (slow speed)

  ON COACH_MODE (score < 0.40):
    Display:  Full word map with phoneme labels
    Lex says: "Let's start with just the first word. Ready?"
    Action:   Reduce target to single word, re-trigger gate

  TONE RULES (enforced via prompt engineering):
    ✅ Always: Encouraging, specific, actionable
    ✅ Always: Celebrate partial progress
    ✅ Always: Use child's name (display_name)
    ❌ Never: "Wrong", "Incorrect", "Bad", "Failed"
    ❌ Never: Compare to other learners
    ❌ Never: Suggest the learner can't do it

AI TUTOR API CONTRACT:
  POST /api/v1/ai-tutor/hint
  Body: {
    gate_attempt_id: string,
    target_text: string,
    transcript: string,
    error_words: string[],
    language_code: string,
    age_group: string,
    attempt_number: integer
  }
  Returns: {
    hint_text: string,
    phonetic_breakdown: [{ word: string, phonemes: string[] }],
    audio_example_url: string,   // TTS-generated
    encouragement: string        // Age-appropriate motivational message
  }

GPT-4o PROMPT TEMPLATE (ai-tutor-service/prompts/hint_prompt.txt):
  System: You are Lex the Owl, a warm and encouraging reading tutor
          for children learning to read. You speak at a [age_group]
          level. Never use the words "wrong", "incorrect", or "failed".
          Always celebrate effort. Keep responses under 30 words.
  User:   The learner tried to say "[target_text]" but said "[transcript]".
          They struggled with: [error_words].
          Give a specific, encouraging hint in [language_code].
```

### 18.3 Teacher Classroom Mode (V2 — P1)

```
FEATURE: Teacher Classroom Mode
PRIORITY: P1 (V2)
OWNER: Education Product Team
STATUS: Planned

ZERO-PREP PROMISE:
  A teacher with zero technical experience can:
  1. Create a classroom: 60 seconds
  2. Share join code with students: 30 seconds
  3. Students join: 2 minutes
  4. Class is reading: 5 minutes total from sign-up

CLASSROOM DASHBOARD WIDGETS:
  Widget 1: Class Reading Heatmap
    - Grid: learner × day (last 30 days)
    - Color: green (active), yellow (low), red (inactive 3+ days)
    - Click: opens individual learner profile

  Widget 2: At-Risk Learner Alerts
    - Auto-generated list: accuracy < 60% for 5+ sessions
    - OR: no activity for 7+ days
    - Action buttons: "Send reminder", "Adjust level", "Contact parent"

  Widget 3: Class Accuracy Trend
    - Line chart: average accuracy over last 8 weeks
    - Benchmark line: grade-level target

  Widget 4: Reading Time Leaderboard
    - Gamified: top 5 readers this week
    - Privacy: only visible within classroom

  Widget 5: Words Read Counter
    - Big number: total words read by class this month
    - Sub-stat: equivalent to X books read

REPORT GENERATION:
  Trigger: Teacher clicks "Export Report" on learner or classroom
  Output:  PDF (primary) or CSV
  Content: {
    summary: { name, grade, period, assessor },
    egra_scores: { oral_reading_fluency, accuracy, comprehension_proxy },
    progress_chart: { fk_grade_over_time },
    word_list: { mastered_sight_words, struggling_words },
    recommendations: [ AI-generated, 3 bullet points ],
    parent_friendly_summary: { plain_language, 1 paragraph }
  }
  Delivery: In-app download + optional email

CLEVER / CLASSLINK INTEGRATION:
  Protocol:  OAuth 2.0 with Clever/ClassLink as IdP
  Sync:      Automatic roster sync on teacher login
  Mapping:   Clever section → LitPlay classroom
  Data:      Student names, grade, teacher assignment
             (NO student personal data beyond name/grade)
```

### 18.4 Offline Mode (MVP — P0)

```
FEATURE: Offline Mode
PRIORITY: P0 (MVP blocker — critical for low-connectivity markets)
OWNER: Mobile Team
STATUS: In Development

OFFLINE CAPABILITIES (after initial setup):
  ✅ Play all downloaded worlds
  ✅ ASR validation (on-device Whisper)
  ✅ Progress tracking (local SQLite)
  ✅ XP, streaks, badges (local, synced later)
  ❌ Leaderboards (require connectivity)
  ❌ AI Tutor hints (require connectivity)
  ❌ New content download

LOCAL STORAGE ARCHITECTURE:
  Engine:  SQLite (Expo SQLite)
  Sync:    On reconnect, auto-background-sync
  Conflict: Server wins for aggregate stats; local sessions appended

LANGUAGE PACK DOWNLOAD FLOW:
  1. User selects language in settings
  2. App requests pack manifest: GET /content/language-packs/{code}
  3. Manifest shows: file count, total size, download URL
  4. User confirms download (show size warning if > 50MB)
  5. Download with progress bar + resume capability (chunked)
  6. Verify SHA-256 checksum on completion
  7. Decrypt and store in encrypted app storage
  8. Pack marked as "available offline" in offline.store

SYNC PROTOCOL:
  On reconnect (detected via NetInfo):
  1. Collect all pending gate_attempts from SQLite queue
  2. POST /api/v1/sync/sessions (batch upload, max 100 per request)
  3. Server processes, updates aggregate progress
  4. Server returns: updated XP total, new badges earned, leaderboard rank
  5. Local state updated with server response
  6. SQLite queue cleared for successfully synced items
  7. If sync fails: retry with exponential backoff (1s, 2s, 4s, max 30s)
```

### 18.5 Personalized Story Generation (V3 — P2)

```
FEATURE: AI-Generated Personalized Stories
PRIORITY: P2 (V3)
OWNER: AI Team

DESCRIPTION:
  GPT-4o generates reading content with the learner's name,
  interests, and avatar character woven into the narrative.
  Auto-leveled to current FK grade.

USER INPUT (collected during onboarding):
  - Favorite animal (dropdown, 20 options)
  - Favorite color
  - Hero name (their character's name in stories)
  - Favorite setting (forest, space, ocean, city...)
  - Reading language

GENERATION SPEC:
  POST /api/v1/ai-tutor/stories/generate
  Body: {
    user_id: string,
    language_code: string,
    target_fk_grade: decimal,
    preferences: { animal, color, hero_name, setting },
    genre: string,
    word_count_target: integer  // 50-300 based on level
  }
  Returns: ContentItemDTO (auto-saved to content_library with is_community=false)

QUALITY GATES (before story is served):
  1. FK grade verified within ±0.3 of target
  2. Profanity filter applied
  3. Age-appropriateness check
  4. Word count within ±15% of target
  5. Language verification (correct language returned)

PROMPT TEMPLATE:
  Write a [word_count] word [genre] story for a [age_group] reader
  at approximately grade [fk_grade] reading level.
  The main character is named [hero_name] who has a [animal] friend.
  Set the story in a [setting] with [color] as a prominent color.
  Use simple, clear sentences. No violence. Be playful and encouraging.
  Language: [language_code]. Return only the story text, no title.
```

---

## 19. Architecture Decision Records (ADR)

### ADR-001: Monorepo with Turborepo

```
DATE:    2024-01-01
STATUS:  Accepted
CONTEXT: Need to manage multiple apps and services with shared code
DECISION: Use Turborepo monorepo with PNPM workspaces
RATIONALE:
  - Shared types package eliminates API drift between services
  - Turborepo caching reduces CI build time by ~70%
  - Single PR for cross-cutting changes
  - Easier dependency management
CONSEQUENCES:
  - All engineers work in single repository
  - CI pipeline must be configured to run only affected packages
  - Large initial clone size (mitigated with sparse checkout)
```

### ADR-002: Python for Speech & Analytics Services

```
DATE:    2024-01-01
STATUS:  Accepted
CONTEXT: Choosing language for ML-heavy services
DECISION: Python (FastAPI) for speech-service and analytics-service
RATIONALE:
  - Whisper, Wav2Vec2, noisereduce are Python-native
  - No overhead of JS FFI for ML libraries
  - FastAPI matches NestJS performance for HTTP workloads
  - Data science ecosystem (pandas, scipy) for analytics
CONSEQUENCES:
  - Two languages in the stack (Node.js + Python)
  - Shared types must be maintained in both languages
  - Python services use Pydantic for validation (vs Zod in Node)
```

### ADR-003: Self-Hosted Whisper over API

```
DATE:    2024-01-01
STATUS:  Accepted
CONTEXT: ASR engine selection
DECISION: Self-host Whisper large-v3 on GPU pods, API as fallback
RATIONALE:
  - Cost: $0.006/min (OpenAI API) vs ~$0.0008/min (self-hosted on G4dn)
  - At 1M minutes/month: $6,000 vs $800 (7.5x cheaper)
  - Data privacy: audio never leaves our infrastructure by default
  - Customization: can fine-tune on specific languages/accents
  - Latency: local inference faster than API round-trip
CONSEQUENCES:
  - GPU infrastructure management overhead
  - Model updates require redeployment
  - Azure Speech API maintained as fallback SLA backstop
```

### ADR-004: Unity over Godot for Game Engine

```
DATE:    2024-01-01
STATUS:  Accepted
CONTEXT: Game engine selection for interactive worlds
DECISION: Unity 2D
RATIONALE:
  - Larger hiring pool for Unity developers
  - Better React Native WebView integration (documented patterns)
  - Unity Gaming Services (analytics, cloud save) as future option
  - Better iOS/Android performance optimization tools
  - More asset marketplace options for art
CONSEQUENCES:
  - Unity license costs (Unity Pro at scale)
  - Larger binary size vs Godot
  - If Unity changes licensing again: migration plan = Godot 4
  - Revisit decision at 100k MAU (cost/benefit)
```

### ADR-005: Cursor-Based Pagination over Offset

```
DATE:    2024-01-01
STATUS:  Accepted
CONTEXT: Pagination strategy for list endpoints
DECISION: Cursor-based pagination for all list endpoints
RATIONALE:
  - Consistent results when data is inserted during pagination
  - Better performance at scale (no COUNT(*) queries)
  - Required for infinite scroll / real-time feeds
CONSEQUENCES:
  - Cannot jump to arbitrary pages
  - Cursor must be opaque (base64 encoded)
  - Implement once in shared middleware, apply everywhere
```

---

## 20. Glossary

```
TERM                DEFINITION
─────────────────────────────────────────────────────────────────
ASR                 Automatic Speech Recognition — converting audio
                    to text
COPPA               Children's Online Privacy Protection Act (US)
EGRA                Early Grade Reading Assessment — standardized
                    literacy measurement tool
FERPA               Family Educational Rights and Privacy Act (US)
FK Grade            Flesch-Kincaid Grade Level — reading difficulty
                    metric (0 = pre-K, 12 = 12th grade)
GDPR                General Data Protection Regulation (EU)
Gate                A progression point in the game that requires
                    a successful reading event to unlock
Gate Status         Outcome of a reading gate attempt:
                    PASS | PASS_PARTIAL | RETRY | RETRY_COACH | COACH_MODE
HPA                 Horizontal Pod Autoscaler (Kubernetes)
LTI                 Learning Tools Interoperability — standard for
                    EdTech integrations
LUFS                Loudness Units Full Scale — audio normalization unit
NER                 Named Entity Recognition
NGO                 Non-Governmental Organization
Phoneme             Smallest unit of sound in a language
PKI                 Public Key Infrastructure
RTL                 Right-to-Left (text direction — Arabic, Hebrew, Urdu)
SIS                 Student Information System
SSOT                Single Source of Truth — this document
TTS                 Text-to-Speech — converting text to audio
VAD                 Voice Activity Detection — detecting when speech ends
WER                 Word Error Rate — ASR accuracy metric
WPM                 Words Per Minute — reading fluency metric
XP                  Experience Points — gamification reward currency
─────────────────────────────────────────────────────────────────
```

---

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DOCUMENT FOOTER                                 │
│                                                                     │
│  This document is the SSOT for the LitPlay platform.                │
│  All implementation decisions must be traceable to a section here.  │
│  Changes require PR review from at least 2 senior engineers.        │
│  ADRs must be appended for any architectural change.                │
│                                                                     │
│  Next review: Sprint 1 kickoff                                      │
│  Owner: Solution Architecture Team                                  │
│  Version: 1.0.0                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

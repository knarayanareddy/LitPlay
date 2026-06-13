LitPlay — Single Source of Truth (SSOT) Design Document
Document Class: System Design & Architecture Specification Persona: Solution Architect / Senior Software Engineer Version: 1.0.0 Status: Living Document — Authoritative Last Updated: 2026-06-13

⚠️ AGENT DIRECTIVE: This document is the absolute SSOT for all engineering, product, design, and infrastructure decisions. No implementation decision may contradict this document without a formal RFC (Request for Change) logged, reviewed, and merged. Every section is binding. When in conflict, this document supersedes verbal agreements, tickets, or PRs.

📋 TABLE OF CONTENTS
text

 1. Document Control & Governance
 2. Executive Technical Summary
 3. Product Requirements (Functional & Non-Functional)
 4. Domain Model & Bounded Contexts
 5. System Architecture (Full Diagram + Rationale)
 6. Monorepo Structure & Project Layout
 7. API Contract Specification
 8. Database Design (Full Schema + ERD)
 9. ASR Pipeline — Detailed Spec
10. Game Engine Integration Spec
11. Frontend Architecture
12. Backend Services — Each Service Fully Specced
13. AI & ML Layer
14. Auth & Identity
15. Infrastructure & DevOps
16. CI/CD Pipeline
17. Security Architecture
18. Compliance & Privacy
19. Observability & Monitoring
20. Feature Flags & Experimentation
21. Content Management System
22. Localization & i18n Architecture
23. Offline-First Architecture
24. Testing Strategy
25. Performance Budgets & SLAs
26. Error Handling & Resilience
27. Data Flow Diagrams
28. Runbooks & Operational Procedures
29. Glossary
30. Decision Log (ADRs)
SECTION 1 — DOCUMENT CONTROL & GOVERNANCE
1.1 Ownership Matrix
text

┌─────────────────────────────────────────────────────────────────────┐
│                      OWNERSHIP MATRIX                               │
├────────────────────────┬──────────────────┬────────────────────────┤
│ Domain                 │ Owner Role       │ Review Cadence         │
├────────────────────────┼──────────────────┼────────────────────────┤
│ System Architecture    │ Solution Arch.   │ Per RFC / Quarterly    │
│ Backend Services       │ Sr. Backend Eng. │ Per Sprint             │
│ Frontend / Game Client │ Sr. Frontend Eng.│ Per Sprint             │
│ ASR / ML Pipeline      │ ML Engineer      │ Per Model Update       │
│ Infrastructure         │ DevOps / SRE     │ Per Infra Change       │
│ Security               │ Security Eng.    │ Monthly + Per Release  │
│ Compliance             │ Legal + Eng.     │ Quarterly              │
│ Content CMS            │ Content Lead     │ Per Content Release    │
│ Analytics              │ Data Engineer    │ Per Sprint             │
└────────────────────────┴──────────────────┴────────────────────────┘
1.2 Change Control Process
text

CHANGE REQUEST LIFECYCLE:

  Identify Need
      │
      ▼
  Open RFC in GitHub Discussions (template: .github/RFC_TEMPLATE.md)
      │
      ▼
  Assign reviewers based on Ownership Matrix above
      │
      ▼
  72-hour comment window (blocking for security/compliance changes)
      │
      ▼
  RFC merged → SSOT updated → Changelog entry added
      │
      ▼
  Tickets created in Linear to implement change
      │
      ▼
  PR references RFC number in description
1.3 Versioning
This document follows SemVer: MAJOR.MINOR.PATCH
MAJOR = breaking architectural change
MINOR = new section or feature spec added
PATCH = clarification, typo, minor amendment
All versions tracked in /docs/CHANGELOG.md in the monorepo
SECTION 2 — EXECUTIVE TECHNICAL SUMMARY
2.1 Problem Statement
768 million adults globally are illiterate. Existing EdTech solutions rely on passive consumption — children watch, tap, and swipe without producing language. Screen time displaces literacy practice rather than enabling it. Teachers lack zero-prep, engagement-proof tools. Parents lack a developmental alternative to mindless gaming.

2.2 Solution Statement
LitPlay is a voice-gated game platform where reading aloud IS the mechanic of play. A learner cannot open a door, cast a spell, progress a storyline, or earn a reward without first correctly reading the gating text aloud. Every session is inherently active literacy practice.

2.3 Core Technical Thesis
text

┌─────────────────────────────────────────────────────────────────┐
│                     CORE TECHNICAL THESIS                       │
│                                                                 │
│  1. VOICE IS THE CONTROLLER                                     │
│     The microphone replaces the button. No reading = no input.  │
│                                                                 │
│  2. ASR ACCURACY IS PRODUCT QUALITY                             │
│     The speech recognition pipeline IS the product experience. │
│     A wrong rejection destroys trust. A wrong acceptance        │
│     destroys learning. We tune both.                            │
│                                                                 │
│  3. LANGUAGE-AGNOSTIC BY ARCHITECTURE                           │
│     No language is hardcoded anywhere in the stack. Language   │
│     is a runtime parameter passed through every layer.          │
│                                                                 │
│  4. OFFLINE-FIRST IS NON-NEGOTIABLE                             │
│     Target users include low-connectivity schools globally.     │
│     The product must function fully offline with sync on        │
│     reconnection.                                               │
│                                                                 │
│  5. PRIVACY BY DEFAULT                                          │
│     Voice data is ephemeral. We process, not store, by default.│
│     No child data is ever sold or used for advertising.         │
└─────────────────────────────────────────────────────────────────┘
2.4 Key Stakeholders & User Personas
text

┌──────────────────────────────────────────────────────────────────────┐
│                          USER PERSONAS                               │
├──────────────┬───────────────────────────────────────────────────────┤
│ PERSONA      │ DESCRIPTION + TECHNICAL IMPLICATIONS                  │
├──────────────┼───────────────────────────────────────────────────────┤
│ 🧒 Learner   │ Age 3–16. Primary user. Touch + voice only UX.        │
│              │ Cannot read onboarding copy. Needs visual-first UI.   │
│              │ May have speech impediments — ASR must be forgiving.  │
├──────────────┼───────────────────────────────────────────────────────┤
│ 👩‍👩‍👧 Parent  │ Non-technical. Wants safety, progress visibility,      │
│              │ screen time controls. Manages billing. COPPA gating.  │
│              │ Dashboard is web-first, mobile-accessible.            │
├──────────────┼───────────────────────────────────────────────────────┤
│ 👩‍🏫 Teacher  │ Time-poor. Needs zero-prep. Uses Chromebooks, tablets. │
│              │ Wants class-wide visibility and exportable reports.   │
│              │ SSO via Google Workspace / Microsoft 365.             │
├──────────────┼───────────────────────────────────────────────────────┤
│ 🏢 District  │ Procurement-driven. Needs FERPA, SIS sync, LTI 1.3,  │
│ Admin        │ usage reports, and multi-school management console.   │
├──────────────┼───────────────────────────────────────────────────────┤
│ 🌍 NGO /    │ Grant-reporting driven. Needs EGRA-aligned metrics,    │
│ Government   │ bulk offline deployment, and API-level data access.   │
└──────────────┴───────────────────────────────────────────────────────┘
SECTION 3 — PRODUCT REQUIREMENTS
3.1 Functional Requirements
FR-001: Reading Gate Mechanic
Every game progression checkpoint (door, NPC, puzzle, level transition) MUST be gated by a reading challenge.
The learner MUST read the displayed text aloud within a configurable time window (default: 30 seconds, adjustable per level difficulty).
The system MUST evaluate the spoken audio against the target text and return a pass/retry/coach response within ≤ 1500ms of the user completing speech.
Text gates MUST support single words, phrases, full sentences, and multi-sentence passages.
FR-002: Speech Recognition & Validation
The ASR pipeline MUST support a minimum of 5 languages at launch: English, Spanish, French, Arabic, Hindi.
The validation engine MUST implement fuzzy matching with configurable thresholds per difficulty level.
The system MUST provide phoneme-level feedback on failed attempts.
The system MUST distinguish between a mispronunciation and a substitution and handle each with different coaching responses.
Validation MUST complete in ≤ 1500ms (P95) under normal network conditions.
Offline ASR MUST complete in ≤ 3000ms (P95) on a device with Snapdragon 665 or equivalent.
FR-003: Learner Progress Tracking
Every reading event MUST be logged: target text, transcript returned, match score, duration, timestamp, language, difficulty level.
The system MUST derive and continuously update a Flesch-Kincaid reading grade level per learner.
The system MUST maintain streaks (daily), XP totals, and badge inventory.
Progress MUST be accessible offline and synced when online.
FR-004: Parent Dashboard
Parents MUST see: total words read, accuracy rate, reading grade trend, session history, time played per day.
Parents MUST be able to set daily time limits enforced at the client AND server level.
Parents MUST control content filters (genre, topic, difficulty ceiling).
Parents MUST receive a weekly digest (email + push notification).
FR-005: Teacher Classroom Mode
Teachers MUST be able to create a classroom, generate join codes, and roster students manually or via Clever/ClassLink.
Teachers MUST see real-time and historical progress for each student and the class aggregate.
Teachers MUST be able to assign specific content by level, language, or genre.
Reports MUST be exportable as PDF and CSV.
The teacher interface MUST function on a Chromebook in a browser with no app install required.
FR-006: Offline Mode
The app MUST function fully offline for learners: gameplay, ASR (on-device), progress tracking.
Offline progress MUST sync to the server within 60 seconds of network reconnection with conflict resolution via last-write-wins with server timestamp authority.
A minimum of 5 game worlds (approximately 150 reading challenges) MUST be pre-cached on install.
FR-007: Localization
All UI strings, content, and ASR models MUST be parameterized by language_code (ISO 639-1).
No language-specific logic MUST exist in application code. All language behavior is driven by CMS configuration and ASR model selection.
RTL languages (Arabic, Hebrew, Urdu) MUST be fully supported in UI layout, text rendering, and CMS.
FR-008: AI Tutor ("Lex")
Lex MUST appear after 2 consecutive failed reading attempts.
Lex MUST break down the failed word phoneme-by-phoneme and provide an audio example.
Lex MUST generate contextually appropriate encouragement (never shame-based language).
Lex MUST NOT be dismissible mid-coaching session by the learner.
3.2 Non-Functional Requirements
text

┌─────────────────────────────────────────────────────────────────────┐
│                  NON-FUNCTIONAL REQUIREMENTS                        │
├────────────────────┬────────────────────────────────────────────────┤
│ CATEGORY           │ REQUIREMENT                                    │
├────────────────────┼────────────────────────────────────────────────┤
│ Performance        │ API P95 response: ≤ 200ms (non-ASR endpoints) │
│                    │ ASR validation: ≤ 1500ms P95 (online)         │
│                    │ App cold start: ≤ 3s on mid-range Android     │
│                    │ Game frame rate: ≥ 60fps on target devices     │
├────────────────────┼────────────────────────────────────────────────┤
│ Availability       │ API uptime: 99.9% SLA (43min/month downtime)  │
│                    │ ASR service: 99.5% SLA                        │
│                    │ Planned maintenance: < 02:00 UTC Sunday only   │
├────────────────────┼────────────────────────────────────────────────┤
│ Scalability        │ Support 100k concurrent learners at launch     │
│                    │ Scale to 10M MAU by month 18 without re-arch  │
│                    │ Horizontal scaling on ALL services (no         │
│                    │ vertical scaling dependencies)                 │
├────────────────────┼────────────────────────────────────────────────┤
│ Security           │ OWASP Top 10 mitigated                        │
│                    │ Pen test before each major release             │
│                    │ All data encrypted at rest (AES-256)          │
│                    │ All data encrypted in transit (TLS 1.3)       │
│                    │ Zero stored voice data by default              │
├────────────────────┼────────────────────────────────────────────────┤
│ Compliance         │ COPPA, FERPA, GDPR, WCAG 2.1 AA               │
├────────────────────┼────────────────────────────────────────────────┤
│ Accessibility      │ VoiceOver / TalkBack compatible               │
│                    │ Minimum 4.5:1 contrast ratio (WCAG AA)        │
│                    │ OpenDyslexic font toggle                      │
│                    │ All interactive elements ≥ 44x44px touch      │
├────────────────────┼────────────────────────────────────────────────┤
│ Observability      │ 100% of API requests traced                   │
│                    │ All errors captured with full context          │
│                    │ Business metrics exported to dashboard daily   │
├────────────────────┼────────────────────────────────────────────────┤
│ Data Retention     │ Active learner data: indefinite (with consent) │
│                    │ Audio recordings: ephemeral (not persisted)    │
│                    │ Deleted accounts: purged within 30 days        │
│                    │ Analytics events: 2-year rolling window        │
└────────────────────┴────────────────────────────────────────────────┘
SECTION 4 — DOMAIN MODEL & BOUNDED CONTEXTS
4.1 Domain-Driven Design Contexts
text

┌─────────────────────────────────────────────────────────────────────────┐
│                        BOUNDED CONTEXTS MAP                             │
│                                                                         │
│  ┌─────────────────────┐        ┌─────────────────────┐                │
│  │   IDENTITY &        │        │   LEARNING &         │                │
│  │   ACCESS CONTEXT    │◄──────►│   PROGRESS CONTEXT   │                │
│  │                     │        │                      │                │
│  │  • User             │        │  • LearnerProfile    │                │
│  │  • Role             │        │  • ReadingSession    │                │
│  │  • Session          │        │  • ProgressSnapshot  │                │
│  │  • Permission       │        │  • Achievement       │                │
│  │  • Consent          │        │  • Streak            │                │
│  └─────────────────────┘        └─────────────────────┘                │
│           │                              │                              │
│           │                              │                              │
│  ┌────────▼────────────┐        ┌────────▼────────────┐                │
│  │   CLASSROOM &       │        │   SPEECH & ASR       │                │
│  │   ROSTERING CONTEXT │        │   CONTEXT            │                │
│  │                     │        │                      │                │
│  │  • Classroom        │        │  • AudioCapture      │                │
│  │  • Assignment       │        │  • Transcript        │                │
│  │  • Report           │        │  • ValidationResult  │                │
│  │  • Teacher          │        │  • PhonemeAnalysis   │                │
│  └─────────────────────┘        └─────────────────────┘                │
│           │                              │                              │
│           │                              │                              │
│  ┌────────▼────────────┐        ┌────────▼────────────┐                │
│  │   CONTENT &         │        │   GAME ENGINE        │                │
│  │   CURRICULUM CONTEXT│        │   CONTEXT            │                │
│  │                     │        │                      │                │
│  │  • ContentItem      │        │  • GameWorld         │                │
│  │  • Curriculum       │        │  • Scene             │                │
│  │  • DifficultyLevel  │        │  • ReadingGate       │                │
│  │  • Language         │        │  • Reward            │                │
│  │  • Tag              │        │  • PlayerState       │                │
│  └─────────────────────┘        └─────────────────────┘                │
│           │                              │                              │
│  ┌────────▼────────────┐        ┌────────▼────────────┐                │
│  │   BILLING &         │        │   ANALYTICS &        │                │
│  │   ENTITLEMENTS      │        │   REPORTING CONTEXT  │                │
│  │                     │        │                      │                │
│  │  • Subscription     │        │  • Event             │                │
│  │  • Plan             │        │  • Metric            │                │
│  │  • Entitlement      │        │  • Dashboard         │                │
│  │  • Invoice          │        │  • ImpactReport      │                │
│  └─────────────────────┘        └─────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
4.2 Core Domain Entities
TypeScript

// ============================================================
// CORE DOMAIN ENTITIES — Canonical Definitions
// These are the authoritative entity shapes used across ALL
// services. Services communicate using these shapes via events.
// ============================================================

// --- IDENTITY CONTEXT ---

interface User {
  id: UUID;                          // Primary key, globally unique
  email: string;                     // Hashed in analytics layer
  role: 'learner' | 'parent' | 'teacher' | 'district_admin' | 'superadmin';
  displayName: string;
  avatarUrl?: string;
  languageCode: ISO639_1;            // e.g. "en", "es", "ar"
  ageGroup: '3-5' | '6-8' | '9-12' | '13-16' | 'adult';
  consentVersion: string;            // e.g. "COPPA-2024-v1"
  consentGrantedAt: ISO8601;
  parentUserId?: UUID;               // Required if role === 'learner' && age < 13
  isActive: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  deletedAt?: ISO8601;               // Soft delete
}

// --- LEARNING CONTEXT ---

interface LearnerProfile {
  userId: UUID;
  currentReadingGradeLevel: number;  // Flesch-Kincaid decimal e.g. 2.4
  xpTotal: number;
  streakDays: number;
  lastActiveDate: ISO8601;
  wordsReadLifetime: number;
  accuracyRateLifetime: number;      // 0.0 – 1.0
  phonicsGaps: PhonicsSkill[];       // Identified weaknesses
  badges: Badge[];
  settings: LearnerSettings;
}

interface ReadingSession {
  id: UUID;
  userId: UUID;
  contentId: UUID;
  languageCode: ISO639_1;
  targetText: string;
  transcriptReturned: string;
  matchScore: number;                // 0.0 – 1.0
  matchMethod: 'exact' | 'fuzzy' | 'phonetic';
  outcome: 'pass' | 'retry' | 'coach_triggered' | 'timeout' | 'skipped';
  audioStorageKey?: string;          // S3 key, only if parent opt-in enabled
  durationMs: number;
  asrEngineUsed: ASREngine;
  asrConfidence: number;
  sessionDate: ISO8601;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'web';
  isOfflineSession: boolean;
  syncedAt?: ISO8601;
}

// --- CONTENT CONTEXT ---

interface ContentItem {
  id: UUID;
  languageCode: ISO639_1;
  difficultyLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  fleschKincaidGrade: number;
  wordCount: number;
  genre: ContentGenre;
  textContent: string;
  htmlContent?: string;              // For karaoke-style phoneme highlighting
  audioExampleUrl?: string;          // CDN URL for correct-pronunciation reference
  imageUrl?: string;
  tags: string[];
  worldId?: UUID;                    // If content belongs to a specific game world
  isPublished: boolean;
  publishedAt?: ISO8601;
  createdBy: UUID;
  updatedAt: ISO8601;
}

// --- GAME CONTEXT ---

interface ReadingGate {
  id: UUID;
  worldId: UUID;
  sceneId: UUID;
  contentId: UUID;                   // FK → ContentItem
  gateType: 'door' | 'npc' | 'puzzle' | 'item' | 'boss' | 'transition';
  timeLimitSeconds: number;          // Default: 30
  passThreshold: number;             // Default: 0.85
  retryThreshold: number;            // Default: 0.60
  maxAttempts: number;               // After this, coach mode is forced
  rewardOnPass: Reward;
  orderInScene: number;
}

interface Reward {
  type: 'xp' | 'badge' | 'item' | 'world_unlock' | 'cosmetic';
  value: number | string;
  label: string;
  iconUrl: string;
}
SECTION 5 — SYSTEM ARCHITECTURE
5.1 Full Architecture Diagram
text

╔══════════════════════════════════════════════════════════════════════════╗
║                     LITPLAY SYSTEM ARCHITECTURE                        ║
║                         Production-Grade                               ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────── CLIENTS ────────────────────────────────┐
│                                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │  iOS App       │  │  Android App   │  │  Web (Next.js) │               │
│  │  React Native  │  │  React Native  │  │  PWA + WebGL   │               │
│  │  + Unity SDK   │  │  + Unity SDK   │  │  Game Embed    │               │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘               │
│          │                   │                   │                         │
│          └───────────────────┴───────────────────┘                         │
│                              │ HTTPS / WSS (TLS 1.3)                       │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                         EDGE & CDN LAYER                                    │
│                                                                             │
│   Cloudflare (DNS, DDoS, WAF, CDN)                                         │
│   ├── Static Assets → Cloudflare R2 + CDN (global PoPs)                   │
│   ├── API Traffic  → Origin Shield → API Gateway                           │
│   └── Game Assets  → CloudFront (S3-backed, region-aware)                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                         API GATEWAY LAYER                                   │
│                                                                             │
│   Kong Gateway (self-hosted on EKS)                                        │
│   ├── JWT Validation Plugin (every request)                                │
│   ├── Rate Limiting:                                                       │
│   │     • Unauthenticated: 20 req/min per IP                              │
│   │     • Learner: 300 req/min per user                                   │
│   │     • Teacher/Admin: 600 req/min per user                             │
│   ├── Request Logging Plugin → ClickHouse                                  │
│   ├── CORS Plugin (whitelist: litplay.app, *.litplay.app)                 │
│   ├── gRPC Transcoding Plugin (for internal service comms)                │
│   └── Circuit Breaker Plugin (per service, 5xx threshold: 10%)            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                      MICROSERVICES LAYER (EKS)                              │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │ auth-svc    │ │ user-svc    │ │ content-svc │ │ asr-svc             │  │
│  │ (NestJS)    │ │ (NestJS)    │ │ (NestJS)    │ │ (Python/FastAPI)    │  │
│  │ Port: 3001  │ │ Port: 3002  │ │ Port: 3003  │ │ Port: 8001 (GPU)   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘  │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │ progress-   │ │ classroom-  │ │ ai-tutor-   │ │ notification-svc   │  │
│  │ svc         │ │ svc         │ │ svc         │ │ (NestJS)           │  │
│  │ (NestJS)    │ │ (NestJS)    │ │ (FastAPI)   │ │ Port: 3007         │  │
│  │ Port: 3004  │ │ Port: 3005  │ │ Port: 8002  │ └─────────────────────┘  │
│  └─────────────┘ └─────────────┘ └─────────────┘                          │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                          │
│  │ billing-svc │ │ analytics-  │ │ i18n-svc    │                          │
│  │ (NestJS)    │ │ svc         │ │ (NestJS)    │                          │
│  │ Port: 3008  │ │ (FastAPI)   │ │ Port: 3010  │                          │
│  └─────────────┘ └─────────────┘ └─────────────┘                          │
│                                                                             │
│         ← All services communicate via gRPC for sync calls →              │
│         ← All events published via Apache Kafka (async)      →            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                           DATA LAYER                                        │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │  PostgreSQL 16   │  │  Redis 7 Cluster  │  │  Apache Kafka           │  │
│  │  (Primary DB)    │  │  (Cache/Session/  │  │  (Event Bus)            │  │
│  │  Multi-AZ RDS    │  │   Leaderboard)    │  │  Topics listed §12      │  │
│  │  Read Replicas:2 │  │  ElastiCache      │  │                         │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │  ClickHouse      │  │  AWS S3          │  │  Pinecone               │  │
│  │  (Analytics OLAP)│  │  (Audio/Media    │  │  (Vector DB for         │  │
│  │  Self-hosted     │  │   Storage)       │  │   semantic content      │  │
│  │                  │  │  Cloudflare R2   │  │   search)               │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
5.2 Inter-Service Communication Strategy
text

┌─────────────────────────────────────────────────────────────────────┐
│           INTER-SERVICE COMMUNICATION RULES                         │
├─────────────────────────┬───────────────────────────────────────────┤
│ PATTERN                 │ WHEN TO USE                               │
├─────────────────────────┼───────────────────────────────────────────┤
│ gRPC (sync)             │ Real-time data needed for response        │
│                         │ e.g. auth check, content fetch, ASR call  │
├─────────────────────────┼───────────────────────────────────────────┤
│ Kafka Events (async)    │ Side effects, analytics, notifications    │
│                         │ e.g. session completed, badge earned      │
├─────────────────────────┼───────────────────────────────────────────┤
│ REST (HTTP/1.1)         │ External integrations only                │
│                         │ e.g. Stripe webhooks, Clever API          │
├─────────────────────────┼───────────────────────────────────────────┤
│ WebSocket (WSS)         │ Real-time teacher dashboard updates       │
│                         │ e.g. class session live view              │
└─────────────────────────┴───────────────────────────────────────────┘
SECTION 6 — MONOREPO STRUCTURE
6.1 Repository Layout
text

litplay/                                    ← Root monorepo
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                          ← Main CI pipeline
│   │   ├── deploy-staging.yml
│   │   ├── deploy-production.yml
│   │   └── security-scan.yml
│   ├── RFC_TEMPLATE.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS                          ← Per-directory ownership
│
├── apps/
│   ├── mobile/                             ← React Native (iOS + Android)
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── store/                      ← Zustand stores
│   │   │   ├── services/                   ← API clients
│   │   │   ├── navigation/
│   │   │   └── game-bridge/               ← Unity WebView bridge
│   │   ├── android/
│   │   ├── ios/
│   │   └── package.json
│   │
│   ├── web/                                ← Next.js 14 (App Router)
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (learner)/
│   │   │   ├── (parent)/
│   │   │   ├── (teacher)/
│   │   │   ├── (admin)/
│   │   │   └── api/                        ← Next.js API routes (BFF layer)
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── game/                               ← Unity 2D Project
│       ├── Assets/
│       │   ├── Scripts/
│       │   │   ├── Core/
│       │   │   │   ├── ReadingGateController.cs
│       │   │   │   ├── ASRBridge.cs
│       │   │   │   ├── SceneManager.cs
│       │   │   │   └── RewardEngine.cs
│       │   │   ├── UI/
│       │   │   ├── Audio/
│       │   │   └── Analytics/
│       │   ├── Scenes/
│       │   ├── Prefabs/
│       │   ├── Art/
│       │   └── Audio/
│       └── ProjectSettings/
│
├── services/
│   ├── auth-svc/                           ← NestJS
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── tokens/
│   │   │   ├── coppa/
│   │   │   └── main.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── user-svc/                           ← NestJS
│   ├── content-svc/                        ← NestJS
│   ├── progress-svc/                       ← NestJS
│   ├── classroom-svc/                      ← NestJS
│   ├── notification-svc/                   ← NestJS
│   ├── billing-svc/                        ← NestJS
│   ├── i18n-svc/                           ← NestJS
│   │
│   ├── asr-svc/                            ← Python / FastAPI
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   └── v1/
│   │   │   │       ├── transcribe.py
│   │   │   │       └── validate.py
│   │   │   ├── core/
│   │   │   │   ├── whisper_engine.py
│   │   │   │   ├── fuzzy_matcher.py
│   │   │   │   ├── phoneme_analyzer.py
│   │   │   │   └── noise_reducer.py
│   │   │   ├── models/
│   │   │   └── main.py
│   │   ├── Dockerfile.gpu                  ← GPU-optimized image
│   │   └── requirements.txt
│   │
│   ├── ai-tutor-svc/                       ← Python / FastAPI
│   │   ├── app/
│   │   │   ├── api/
│   │   │   ├── prompts/                    ← Versioned prompt templates
│   │   │   └── coaching/
│   │   └── Dockerfile
│   │
│   └── analytics-svc/                      ← Python / FastAPI
│       ├── app/
│       │   ├── ingest/
│       │   ├── queries/
│       │   └── export/
│       └── Dockerfile
│
├── packages/                               ← Shared packages (NPM workspaces)
│   ├── ui/                                 ← Shared design system components
│   │   ├── src/
│   │   │   ├── Button/
│   │   │   ├── Typography/
│   │   │   ├── Card/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── types/                              ← Shared TypeScript types (canonical)
│   │   ├── src/
│   │   │   ├── entities.ts                 ← Domain entity types (Section 4.2)
│   │   │   ├── api.ts                      ← API request/response types
│   │   │   ├── events.ts                   ← Kafka event payloads
│   │   │   └── enums.ts
│   │   └── package.json
│   │
│   ├── config/                             ← Shared env config & constants
│   ├── logger/                             ← Structured logger (Pino)
│   └── testing/                            ← Shared test utilities & factories
│
├── infra/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── eks/
│   │   │   ├── rds/
│   │   │   ├── elasticache/
│   │   │   ├── s3/
│   │   │   ├── cloudfront/
│   │   │   └── kafka/
│   │   ├── environments/
│   │   │   ├── staging/
│   │   │   └── production/
│   │   └── main.tf
│   │
│   ├── helm/
│   │   ├── litplay-services/               ← Umbrella Helm chart
│   │   │   ├── Chart.yaml
│   │   │   ├── values.yaml
│   │   │   ├── values.staging.yaml
│   │   │   ├── values.production.yaml
│   │   │   └── templates/
│   │   │       ├── auth-svc/
│   │   │       ├── asr-svc/
│   │   │       └── ... (one per service)
│   │   └── kong/
│   │
│   └── k8s/
│       ├── namespaces.yaml
│       ├── network-policies.yaml
│       └── pod-disruption-budgets.yaml
│
├── docs/
│   ├── SSOT.md                             ← THIS DOCUMENT
│   ├── CHANGELOG.md
│   ├── ADRs/                               ← Architecture Decision Records
│   ├── runbooks/
│   └── api-specs/
│       ├── openapi.yaml                    ← OpenAPI 3.1 spec (generated)
│       └── proto/                          ← gRPC proto files
│
├── scripts/
│   ├── seed-db.ts
│   ├── generate-types.ts                   ← Auto-generate types from proto+OpenAPI
│   └── create-service.sh                   ← Scaffolding script for new services
│
├── turbo.json                              ← Turborepo pipeline config
├── pnpm-workspace.yaml
├── docker-compose.yml                      ← Local full-stack dev environment
├── docker-compose.test.yml
└── .env.example                            ← All required env vars documented
SECTION 7 — API CONTRACT SPECIFICATION
7.1 API Design Principles
text

RULES (NON-NEGOTIABLE):
  1. All endpoints versioned: /api/v1/...
  2. All responses follow the standard envelope (see 7.2)
  3. All timestamps in ISO 8601 UTC format
  4. All IDs are UUIDs (v4)
  5. Pagination via cursor (not offset) for all list endpoints
  6. Error codes follow RFC 7807 (Problem Details)
  7. OpenAPI 3.1 spec is generated from code (not hand-written)
     → NestJS: @nestjs/swagger decorators → openapi.yaml
  8. Breaking API changes require a version bump (v2)
  9. Deprecated endpoints return Deprecation header with sunset date
 10. All write endpoints are idempotent where possible
     (idempotency-key header supported)
7.2 Standard Response Envelope
TypeScript

// SUCCESS RESPONSE
interface APISuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: CursorPaginationMeta;
    requestId: string;             // Trace ID for debugging
    timestamp: ISO8601;
  };
}

// ERROR RESPONSE (RFC 7807)
interface APIErrorResponse {
  success: false;
  error: {
    type: string;                  // URI: https://errors.litplay.app/ERR_CODE
    title: string;                 // Human-readable summary
    status: number;                // HTTP status code
    detail: string;                // Specific error description
    instance: string;              // Request path
    requestId: string;
    timestamp: ISO8601;
    fields?: ValidationError[];    // For 422 validation errors
  };
}

// CURSOR PAGINATION META
interface CursorPaginationMeta {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string;
  endCursor: string;
  totalCount: number;
}
7.3 API Endpoints — Full Specification
AUTH SERVICE /api/v1/auth
YAML

POST /api/v1/auth/register
  Description: Register a new user account
  Auth: None
  Body:
    email: string (required)
    password: string (required, min 8 chars, 1 upper, 1 number)
    role: 'learner' | 'parent' | 'teacher'
    displayName: string (required)
    languageCode: ISO639-1 (required)
    dateOfBirth: ISO8601 (required for COPPA check)
    parentEmail?: string (required if age < 13)
  Response 201:
    user: UserPublic
    accessToken: string (JWT, 15min expiry)
    refreshToken: string (JWT, 30 days, HttpOnly cookie)
  Response 409: Email already exists
  Response 422: Validation error
  Side Effects:
    - Sends email verification
    - If age < 13: sends parental consent email to parentEmail
    - Emits Kafka event: user.registered

POST /api/v1/auth/login
  Description: Authenticate and receive tokens
  Auth: None
  Body:
    email: string
    password: string
  Response 200:
    user: UserPublic
    accessToken: string
    refreshToken: string (HttpOnly cookie)
  Response 401: Invalid credentials
  Response 423: Account locked (5 failed attempts)

POST /api/v1/auth/refresh
  Description: Exchange refresh token for new access token
  Auth: RefreshToken (HttpOnly cookie)
  Response 200:
    accessToken: string
  Response 401: Invalid or expired refresh token

POST /api/v1/auth/logout
  Description: Revoke refresh token
  Auth: Bearer
  Response 204: No content

POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/verify-email
POST /api/v1/auth/oauth/google
POST /api/v1/auth/oauth/microsoft     ← For teacher SSO
POST /api/v1/auth/oauth/clever        ← For district SSO
USER SERVICE /api/v1/users
YAML

GET /api/v1/users/me
  Description: Get current authenticated user profile
  Auth: Bearer
  Response 200: User + LearnerProfile (if role=learner)

PATCH /api/v1/users/me
  Description: Update user profile
  Auth: Bearer
  Body: Partial<User> (displayName, avatarUrl, languageCode)
  Response 200: Updated User

DELETE /api/v1/users/me
  Description: Delete account (GDPR right to erasure)
  Auth: Bearer
  Body: { confirmPassword: string }
  Response 202: Accepted (async deletion, completes within 30 days)
  Side Effects:
    - Emits Kafka event: user.deletion_requested
    - analytics-svc anonymizes events
    - All PII purged within 30 days

GET /api/v1/users/:userId/profile     ← Teacher/admin only
GET /api/v1/users                     ← Admin only, paginated
ASR SERVICE /api/v1/asr
YAML

POST /api/v1/asr/validate
  Description: Validate spoken audio against target text
  Auth: Bearer
  Content-Type: multipart/form-data
  Body:
    audio: File (WAV or WebM, max 10MB, max 60s)
    targetText: string (required)
    languageCode: ISO639-1 (required)
    difficulty: 1-10 (required, affects pass threshold)
    gateId: UUID (required, for session logging)
    userId: UUID (required)
  Response 200:
    outcome: 'pass' | 'retry' | 'coach_triggered' | 'timeout'
    matchScore: number (0.0 – 1.0)
    transcript: string
    confidence: number
    phonemeBreakdown?: PhonemeResult[]
    coachingHint?: string
    processingMs: number
  Response 413: Audio too large
  Response 422: Unsupported language or format
  Performance SLA: P95 ≤ 1500ms

POST /api/v1/asr/transcribe
  Description: Raw transcription without validation (for debug/admin)
  Auth: Bearer (admin only)
  Body: audio file + languageCode
  Response 200: { transcript: string, confidence: number }
PROGRESS SERVICE /api/v1/progress
YAML

GET /api/v1/progress/me
  Description: Get full progress profile for current learner
  Auth: Bearer (learner)
  Response 200: LearnerProfile

GET /api/v1/progress/:userId
  Description: Get progress for a specific learner
  Auth: Bearer (parent of learner, teacher with learner in class, admin)
  Response 200: LearnerProfile

POST /api/v1/progress/sessions
  Description: Log a completed reading session
  Auth: Bearer
  Body: Omit<ReadingSession, 'id' | 'sessionDate'>
  Response 201: ReadingSession
  Note: Idempotent — if gateId+userId already exists for same UTC day,
        returns existing record (prevents duplicate sync)

GET /api/v1/progress/sessions
  Description: Paginated session history
  Auth: Bearer
  Query: cursor?, limit? (default 20, max 100), dateFrom?, dateTo?
  Response 200: ReadingSession[] + pagination

GET /api/v1/progress/stats
  Description: Aggregated stats for dashboards
  Auth: Bearer
  Query: period ('week' | 'month' | 'all')
  Response 200:
    wordsRead: number
    averageAccuracy: number
    sessionsCount: number
    readingGradeLevel: number
    gradeImprovement: number
    topGenres: string[]
    streakCurrent: number
CONTENT SERVICE /api/v1/content
YAML

GET /api/v1/content
  Description: Query content library
  Auth: Bearer
  Query:
    languageCode: ISO639-1 (required)
    difficulty?: 1-10
    genre?: ContentGenre
    worldId?: UUID
    tags?: string (comma-separated)
    cursor?: string
    limit?: number (default 20)
  Response 200: ContentItem[] + pagination

GET /api/v1/content/:contentId
  Description: Get single content item
  Auth: Bearer
  Response 200: ContentItem

POST /api/v1/content                  ← Admin / Content Editor only
PATCH /api/v1/content/:contentId      ← Admin / Content Editor only
DELETE /api/v1/content/:contentId     ← Admin only
CLASSROOM SERVICE /api/v1/classrooms
YAML

POST /api/v1/classrooms
  Description: Create a new classroom
  Auth: Bearer (teacher, admin)
  Body:
    name: string
    gradeLevel: string
    languageCode: ISO639-1
  Response 201: Classroom + joinCode (6-char alphanumeric)

GET /api/v1/classrooms
  Description: List classrooms for authenticated teacher
  Auth: Bearer (teacher)
  Response 200: Classroom[]

GET /api/v1/classrooms/:classroomId
  Auth: Bearer (teacher who owns classroom, admin)
  Response 200: Classroom + members[] + aggregateStats

POST /api/v1/classrooms/:classroomId/join
  Description: Learner joins via join code
  Auth: Bearer (learner)
  Body: { joinCode: string }
  Response 200: ClassroomMember

GET /api/v1/classrooms/:classroomId/progress
  Description: Progress for all students in classroom
  Auth: Bearer (teacher who owns classroom)
  Response 200: LearnerProgress[] per student + class aggregates

GET /api/v1/classrooms/:classroomId/reports/pdf
  Description: Generate downloadable PDF report
  Auth: Bearer (teacher)
  Query: dateFrom, dateTo
  Response 200: application/pdf stream
SECTION 8 — DATABASE DESIGN
8.1 Schema Design Principles
text

RULES:
  1. Every table has: id (UUID PK), created_at, updated_at
  2. Soft deletes for user-owned data: deleted_at nullable timestamp
  3. All foreign keys have explicit ON DELETE behavior defined
  4. All enum types defined as PostgreSQL ENUM types (not varchar)
  5. JSONB used only when schema is truly variable (not to avoid discipline)
  6. All money values stored as INTEGER (cents) to avoid float issues
  7. Indexes on all FK columns and all frequently queried columns
  8. Migrations managed via Flyway (services/*/db/migrations/)
  9. No raw SQL in application code — use TypeORM query builder or Prisma
 10. Each service owns its own schema (schema-per-service in same PG cluster)
8.2 Complete Database Schema
SQL

-- ================================================================
-- SCHEMA: identity
-- Owned by: auth-svc, user-svc
-- ================================================================

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TYPE identity.user_role AS ENUM (
  'learner', 'parent', 'teacher', 'district_admin', 'superadmin'
);

CREATE TYPE identity.age_group AS ENUM (
  '3-5', '6-8', '9-12', '13-16', 'adult'
);

CREATE TABLE identity.users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) UNIQUE NOT NULL,
  email_verified      BOOLEAN NOT NULL DEFAULT false,
  password_hash       VARCHAR(255) NOT NULL,          -- bcrypt, cost 12
  role                identity.user_role NOT NULL,
  display_name        VARCHAR(100) NOT NULL,
  avatar_url          VARCHAR(500),
  language_code       CHAR(2) NOT NULL DEFAULT 'en',  -- ISO 639-1
  age_group           identity.age_group,
  date_of_birth       DATE,                           -- Used for COPPA
  parent_user_id      UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  consent_version     VARCHAR(50),
  consent_granted_at  TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_login_at       TIMESTAMPTZ,
  failed_login_count  SMALLINT NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON identity.users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_parent ON identity.users(parent_user_id);
CREATE INDEX idx_users_role ON identity.users(role);

CREATE TABLE identity.refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  ip_address  INET,
  user_agent  VARCHAR(500)
);

CREATE INDEX idx_tokens_user ON identity.refresh_tokens(user_id);
CREATE INDEX idx_tokens_hash ON identity.refresh_tokens(token_hash);

CREATE TABLE identity.oauth_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  provider      VARCHAR(50) NOT NULL,  -- 'google', 'microsoft', 'clever'
  provider_id   VARCHAR(255) NOT NULL,
  access_token  TEXT,                  -- encrypted with app-level key
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

-- ================================================================
-- SCHEMA: learning
-- Owned by: progress-svc
-- ================================================================

CREATE SCHEMA IF NOT EXISTS learning;

CREATE TYPE learning.session_outcome AS ENUM (
  'pass', 'retry', 'coach_triggered', 'timeout', 'skipped'
);

CREATE TYPE learning.asr_engine AS ENUM (
  'whisper-large-v3', 'whisper-medium', 'whisper-cpp',
  'wav2vec2', 'web-speech-api', 'azure-cognitive'
);

CREATE TABLE learning.learner_profiles (
  user_id                   UUID PRIMARY KEY
                            REFERENCES identity.users(id) ON DELETE CASCADE,
  current_reading_grade     DECIMAL(4,2) NOT NULL DEFAULT 0.0,
  xp_total                  INTEGER NOT NULL DEFAULT 0,
  streak_days               SMALLINT NOT NULL DEFAULT 0,
  last_active_date          DATE,
  words_read_lifetime       INTEGER NOT NULL DEFAULT 0,
  accuracy_rate_lifetime    DECIMAL(5,4) NOT NULL DEFAULT 0.0,
  phonics_gaps              JSONB NOT NULL DEFAULT '[]',
  settings                  JSONB NOT NULL DEFAULT '{}',
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learning.reading_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  content_id        UUID NOT NULL,             -- FK to content.items (cross-schema)
  gate_id           UUID,                      -- FK to game.reading_gates
  language_code     CHAR(2) NOT NULL,
  target_text       TEXT NOT NULL,
  transcript        TEXT,
  match_score       DECIMAL(5,4),
  outcome           learning.session_outcome NOT NULL,
  asr_engine        learning.asr_engine,
  asr_confidence    DECIMAL(5,4),
  duration_ms       INTEGER,
  audio_storage_key VARCHAR(500),              -- NULL unless parent opted in
  device_type       VARCHAR(20),
  is_offline        BOOLEAN NOT NULL DEFAULT false,
  session_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite unique for idempotent session creation
CREATE UNIQUE INDEX idx_sessions_idempotent
  ON learning.reading_sessions(gate_id, user_id, DATE(session_date))
  WHERE gate_id IS NOT NULL;

CREATE INDEX idx_sessions_user_date
  ON learning.reading_sessions(user_id, session_date DESC);

CREATE INDEX idx_sessions_content
  ON learning.reading_sessions(content_id);

CREATE TABLE learning.achievements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  badge_type    VARCHAR(100) NOT NULL,
  badge_label   VARCHAR(200) NOT NULL,
  icon_url      VARCHAR(500),
  earned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_type)
);

CREATE TABLE learning.daily_stats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  stat_date        DATE NOT NULL,
  words_read       INTEGER NOT NULL DEFAULT 0,
  sessions_count   SMALLINT NOT NULL DEFAULT 0,
  accuracy_avg     DECIMAL(5,4),
  minutes_played   SMALLINT NOT NULL DEFAULT 0,
  xp_earned        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, stat_date)
);

-- ================================================================
-- SCHEMA: content
-- Owned by: content-svc
-- ================================================================

CREATE SCHEMA IF NOT EXISTS content;

CREATE TYPE content.genre AS ENUM (
  'adventure', 'sci_fi', 'fantasy', 'folklore', 'nonfiction',
  'biography', 'humor', 'mystery', 'nature', 'history'
);

CREATE TABLE content.items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code         CHAR(2) NOT NULL,
  difficulty_level      SMALLINT NOT NULL CHECK (difficulty_level BETWEEN 1 AND 10),
  flesch_kincaid_grade  DECIMAL(4,2) NOT NULL,
  word_count            SMALLINT NOT NULL,
  genre                 content.genre NOT NULL,
  text_content          TEXT NOT NULL,
  html_content          TEXT,
  audio_example_url     VARCHAR(500),
  image_url             VARCHAR(500),
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  world_id              UUID,
  is_published          BOOLEAN NOT NULL DEFAULT false,
  published_at          TIMESTAMPTZ,
  created_by            UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_content_language_difficulty
  ON content.items(language_code, difficulty_level)
  WHERE is_published = true AND deleted_at IS NULL;

CREATE INDEX idx_content_tags ON content.items USING GIN(tags);

CREATE TABLE content.worlds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  theme           VARCHAR(100),
  unlock_level    SMALLINT NOT NULL DEFAULT 1,
  order_index     SMALLINT NOT NULL,
  thumbnail_url   VARCHAR(500),
  is_published    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SCHEMA: game
-- Owned by: content-svc / game engine config
-- ================================================================

CREATE SCHEMA IF NOT EXISTS game;

CREATE TYPE game.gate_type AS ENUM (
  'door', 'npc', 'puzzle', 'item', 'boss', 'transition'
);

CREATE TABLE game.reading_gates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id          UUID NOT NULL REFERENCES content.worlds(id) ON DELETE CASCADE,
  scene_id          VARCHAR(200) NOT NULL,              -- Unity scene name
  content_id        UUID NOT NULL REFERENCES content.items(id),
  gate_type         game.gate_type NOT NULL,
  time_limit_sec    SMALLINT NOT NULL DEFAULT 30,
  pass_threshold    DECIMAL(3,2) NOT NULL DEFAULT 0.85,
  retry_threshold   DECIMAL(3,2) NOT NULL DEFAULT 0.60,
  max_attempts      SMALLINT NOT NULL DEFAULT 3,
  reward_type       VARCHAR(50),
  reward_value      VARCHAR(200),
  order_in_scene    SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE game.player_states (
  user_id           UUID PRIMARY KEY
                    REFERENCES identity.users(id) ON DELETE CASCADE,
  current_world_id  UUID REFERENCES content.worlds(id),
  current_scene_id  VARCHAR(200),
  completed_gates   UUID[] NOT NULL DEFAULT '{}',
  inventory         JSONB NOT NULL DEFAULT '{}',
  cosmetics         JSONB NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SCHEMA: classroom
-- Owned by: classroom-svc
-- ================================================================

CREATE SCHEMA IF NOT EXISTS classroom;

CREATE TABLE classroom.classrooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  grade_level     VARCHAR(20),
  language_code   CHAR(2) NOT NULL DEFAULT 'en',
  join_code       CHAR(6) UNIQUE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classroom_teacher ON classroom.classrooms(teacher_id);
CREATE INDEX idx_classroom_joincode ON classroom.classrooms(join_code);

CREATE TABLE classroom.members (
  classroom_id  UUID NOT NULL REFERENCES classroom.classrooms(id) ON DELETE CASCADE,
  learner_id    UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at    TIMESTAMPTZ,
  PRIMARY KEY (classroom_id, learner_id)
);

CREATE TABLE classroom.assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    UUID NOT NULL REFERENCES classroom.classrooms(id) ON DELETE CASCADE,
  content_id      UUID,
  world_id        UUID,
  difficulty_min  SMALLINT,
  difficulty_max  SMALLINT,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at          TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true
);

-- ================================================================
-- SCHEMA: billing
-- Owned by: billing-svc
-- ================================================================

CREATE SCHEMA IF NOT EXISTS billing;

CREATE TYPE billing.plan_tier AS ENUM (
  'free', 'family', 'classroom', 'district', 'ngo'
);

CREATE TABLE billing.subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  stripe_customer_id  VARCHAR(100) UNIQUE,
  stripe_sub_id       VARCHAR(100) UNIQUE,
  plan_tier           billing.plan_tier NOT NULL DEFAULT 'free',
  status              VARCHAR(50) NOT NULL DEFAULT 'active',
  current_period_end  TIMESTAMPTZ,
  seat_count          SMALLINT,
  amount_cents        INTEGER,
  currency            CHAR(3) DEFAULT 'USD',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SECTION 9 — ASR PIPELINE — DETAILED SPECIFICATION
9.1 Architecture Overview
text

┌─────────────────────────────────────────────────────────────────────────┐
│                  ASR SERVICE (asr-svc) — Full Spec                      │
│                  Runtime: Python 3.11 / FastAPI                         │
│                  Hardware: GPU nodes (NVIDIA T4 or A10G)                │
└─────────────────────────────────────────────────────────────────────────┘

REQUEST FLOW:

Client records audio
    │
    ▼ (multipart/form-data POST /api/v1/asr/validate)
    │
    ▼
┌───────────────────────────────────┐
│   Input Validation & Sanitization │
│   • File type check (WAV, WebM,   │
│     MP4 audio, OGG)               │
│   • Max size: 10MB                │
│   • Max duration: 60 seconds      │
│   • Min duration: 0.5 seconds     │
│     (reject empty recordings)     │
└──────────────────┬────────────────┘
                   │
                   ▼
┌───────────────────────────────────┐
│   Audio Pre-Processing Module     │
│   (librosa + pydub)               │
│                                   │
│   1. Convert to WAV 16kHz mono    │
│      (Whisper's required format)  │
│   2. Normalize amplitude          │
│      (target: -23 LUFS)           │
│   3. Noise reduction              │
│      (noisereduce library,        │
│       stationary noise profiling) │
│   4. Voice Activity Detection     │
│      (silero-vad)                 │
│      • Trim leading/trailing      │
│        silence                    │
│      • Reject if no speech found  │
│   5. Split if > 30s               │
│      (chunked processing)         │
└──────────────────┬────────────────┘
                   │
                   ▼
┌───────────────────────────────────┐
│   Language & Engine Router        │
│                                   │
│   Input: languageCode param       │
│   + device_type (online/offline)  │
│                                   │
│   Online path:                    │
│   └── Whisper large-v3 (GPU)      │
│       Hosted on asr-svc pod       │
│       GPU: NVIDIA T4 (16GB VRAM)  │
│                                   │
│   Offline path:                   │
│   └── Whisper.cpp (on-device)     │
│       Model: whisper-small        │
│       Bundled in app package      │
│       (models/whisper-small-{lang}│
│        .bin, ~150MB per language) │
│                                   │
│   Fallback (if GPU unavailable):  │
│   └── Azure Cognitive Speech API  │
│       (configured in env vars)    │
└──────────────────┬────────────────┘
                   │
                   ▼
┌───────────────────────────────────┐
│   Transcription Engine            │
│   (openai-whisper Python lib)     │
│                                   │
│   Config:                         │
│   model = "large-v3"              │
│   language = languageCode         │
│   task = "transcribe"             │
│   fp16 = True                     │
│   beam_size = 5                   │
│   best_of = 5                     │
│   temperature = 0.0               │
│   condition_on_prev_tokens = True │
│                                   │
│   Output:                         │
│   { text, segments, language,     │
│     avg_logprob, no_speech_prob } │
└──────────────────┬────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────────────────────┐
│   Validation Engine (validation/validator.py)                  │
│                                                               │
│   Input: transcript (string), targetText (string)             │
│                                                               │
│   STEP 1: TEXT NORMALIZATION                                  │
│   Both transcript and target:                                 │
│   • Lowercase                                                 │
│   • Remove punctuation (except apostrophes)                   │
│   • Normalize whitespace                                      │
│   • Expand contractions (language-specific)                   │
│   • Number words expanded ("3" → "three")                     │
│                                                               │
│   STEP 2: EXACT MATCH CHECK                                   │
│   If normalized strings identical: score = 1.0 → PASS        │
│                                                               │
│   STEP 3: FUZZY WORD-LEVEL MATCH                             │
│   Algorithm: Token Sort Ratio (RapidFuzz library)             │
│   • Accounts for word order variations                        │
│   • Score 0.0 – 1.0                                           │
│                                                               │
│   STEP 4: PHONETIC MATCH (if fuzzy score < 0.85)             │
│   Algorithm: Metaphone + Double Metaphone                     │
│   • Maps words to phonetic codes                              │
│   • Accounts for accent variations                            │
│   • Catches: "receipt" → "reseet" type errors                │
│   • Boosts score if phonetically close                        │
│                                                               │
│   STEP 5: WORD-LEVEL ANALYSIS                                 │
│   • Align transcript tokens to target tokens (DTW alignment)  │
│   • Flag each word as: correct / substituted / omitted /      │
│     inserted / phonetically_close                             │
│   • Build PhonemeBreakdown for coaching                       │
│                                                               │
│   STEP 6: COMPOSITE SCORE + THRESHOLD ROUTING                 │
│   composite_score = (fuzzy * 0.6) + (phonetic * 0.4)         │
│                                                               │
│   difficulty 1-3 (easy):   pass ≥ 0.75, retry ≥ 0.50        │
│   difficulty 4-6 (medium): pass ≥ 0.82, retry ≥ 0.60        │
│   difficulty 7-10 (hard):  pass ≥ 0.88, retry ≥ 0.65        │
│                                                               │
│   RESULT ROUTING:                                             │
│   score ≥ pass_threshold  → outcome: 'pass'                  │
│   score ≥ retry_threshold → outcome: 'retry'                 │
│   score < retry_threshold → outcome: 'retry' (attempt 1-2)   │
│   attempts ≥ max_attempts → outcome: 'coach_triggered'        │
│   no_speech_prob > 0.9    → outcome: 'timeout' (no speech)   │
└───────────────────────────────────────────────────────────────┘
9.2 Phoneme Analysis Response Shape
Python

# asr-svc/app/models/responses.py

from pydantic import BaseModel
from enum import Enum
from typing import Optional

class WordStatus(str, Enum):
    CORRECT = "correct"
    SUBSTITUTED = "substituted"
    OMITTED = "omitted"
    INSERTED = "inserted"
    PHONETICALLY_CLOSE = "phonetically_close"

class WordAnalysis(BaseModel):
    targetWord: str
    spokenWord: Optional[str]
    status: WordStatus
    confidence: float
    phoneticDistance: float           # 0.0 = identical, 1.0 = completely different
    coachingNote: Optional[str]       # e.g. "Try sounding out 'th' at the start"

class PhonemeBreakdown(BaseModel):
    words: list[WordAnalysis]
    problemWords: list[str]           # Words that need coaching
    suggestedFocus: Optional[str]     # e.g. "digraphs", "silent letters", "blends"

class ASRValidationResponse(BaseModel):
    outcome: str                      # pass | retry | coach_triggered | timeout
    matchScore: float
    transcript: str
    confidence: float
    phonemeBreakdown: Optional[PhonemeBreakdown]
    coachingHint: Optional[str]
    asrEngineUsed: str
    processingMs: int
9.3 On-Device (Offline) ASR Implementation
text

OFFLINE ASR STRATEGY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Library: whisper.cpp (C++ port, runs on CPU)
React Native integration: react-native-whisper (community package)
                          OR custom native module via JNI (Android)
                          and Objective-C bridge (iOS)

Models bundled at install (per selected language at onboarding):
  • whisper-small  (~150MB) — default, balanced
  • whisper-tiny   (~75MB)  — low-end device fallback (< 2GB RAM)

Model Download Strategy:
  1. At onboarding, user selects primary language
  2. Whisper small model for that language downloaded in background
  3. Progress indicator shown to parent/teacher during setup
  4. Subsequent languages downloaded on first use (with consent)
  5. Models stored in app's private storage (not accessible externally)
  6. Model versioning: check for updates on app launch when online

Validation Logic (Offline):
  Same fuzzy + phonetic matching applied to offline transcript.
  Offline mode uses IDENTICAL scoring thresholds.
  No quality degradation in validation logic — only in ASR accuracy.

Offline Session Sync:
  • Sessions stored in SQLite (react-native-mmkv for encrypted storage)
  • Sync queue managed by react-query + custom sync manager
  • On reconnect: POST /api/v1/progress/sessions (batch, max 100 at once)
  • Conflict: server timestamp authority (server-side created_at wins)
SECTION 10 — GAME ENGINE INTEGRATION SPEC
10.1 Unity ↔ React Native Bridge
text

COMMUNICATION ARCHITECTURE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The game runs inside a Unity WebView (using react-native-unity-view package)
embedded in the React Native shell app.

Communication Channel: PostMessage (JSON serialized events)

NATIVE → UNITY (React Native sends to Unity):
  Method: SendMessage(gameObject, method, payload)

  Events:
  ┌──────────────────────────────────────────────────────────────┐
  │ Event                  │ Payload                            │
  ├──────────────────────────────────────────────────────────────┤
  │ USER_AUTHENTICATED     │ { userId, displayName, languageCode│
  │                        │   xp, level, inventory }           │
  ├──────────────────────────────────────────────────────────────┤
  │ ASR_RESULT             │ { gateId, outcome, matchScore,     │
  │                        │   coachingHint, reward }           │
  ├──────────────────────────────────────────────────────────────┤
  │ PLAYER_STATE_LOADED    │ { currentWorldId, sceneId,         │
  │                        │   completedGates[] }               │
  ├──────────────────────────────────────────────────────────────┤
  │ CONTENT_LOADED         │ { gateId, textContent, htmlContent │
  │                        │   difficulty, timeLimitSeconds }   │
  ├──────────────────────────────────────────────────────────────┤
  │ TIME_LIMIT_UPDATE      │ { remainingSeconds }               │
  ├──────────────────────────────────────────────────────────────┤
  │ SESSION_TIMER_FORCE_END│ { reason: 'daily_limit_reached' }  │
  └──────────────────────────────────────────────────────────────┘

UNITY → NATIVE (Unity sends to React Native):
  Method: JS bridge callback via WebView postMessage

  Events:
  ┌──────────────────────────────────────────────────────────────┐
  │ Event                  │ Payload                            │
  ├──────────────────────────────────────────────────────────────┤
  │ GATE_TRIGGERED         │ { gateId, gateType, contentId }    │
  │                        │ → RN fetches content, activates mic│
  ├──────────────────────────────────────────────────────────────┤
  │ RECORDING_START_REQUEST│ { gateId }                         │
  │                        │ → RN opens microphone              │
  ├──────────────────────────────────────────────────────────────┤
  │ RECORDING_STOP_REQUEST │ { gateId }                         │
  │                        │ → RN stops mic, sends to ASR       │
  ├──────────────────────────────────────────────────────────────┤
  │ SCENE_COMPLETED        │ { worldId, sceneId, score }        │
  │                        │ → RN logs progress, awards XP      │
  ├──────────────────────────────────────────────────────────────┤
  │ PLAYER_STATE_SAVE      │ { currentWorldId, sceneId,         │
  │                        │   inventory, cosmetics }           │
  │                        │ → RN persists to API               │
  ├──────────────────────────────────────────────────────────────┤
  │ ANALYTICS_EVENT        │ { eventName, properties }          │
  │                        │ → RN forwards to analytics-svc     │
  └──────────────────────────────────────────────────────────────┘
10.2 Unity ReadingGateController (C# Spec)
csharp

// Assets/Scripts/Core/ReadingGateController.cs
// This is the AUTHORITATIVE spec for the gate controller.
// Implementation must match this interface exactly.

public interface IReadingGateController
{
    // Called when player collides with a gate trigger zone
    void OnGateEntered(ReadingGate gate);

    // Called when ASR result arrives from React Native bridge
    void OnASRResult(ASRResult result);

    // Called when timer expires
    void OnTimeExpired(string gateId);

    // Called when coach mode should activate
    void OnCoachModeTriggered(string gateId, PhonemeBreakdown breakdown);

    // Called when gate is successfully passed
    void OnGatePassed(string gateId, Reward reward);
}

public class ReadingGate
{
    public string Id;              // UUID
    public string GateType;       // "door", "npc", "puzzle", etc.
    public string ContentId;       // UUID → fetch from content-svc
    public int TimeLimitSeconds;
    public float PassThreshold;
    public int MaxAttempts;
    public Reward RewardOnPass;
}

public class ASRResult
{
    public string GateId;
    public string Outcome;         // "pass" | "retry" | "coach_triggered"
    public float MatchScore;
    public string Transcript;
    public string CoachingHint;
    public PhonemeBreakdown Breakdown;
    public Reward Reward;          // Populated if outcome == "pass"
}

// STATE MACHINE for gate interaction:
//
//  IDLE
//    │ player enters trigger zone
//    ▼
//  GATE_DISPLAYED (text shown to learner)
//    │ countdown begins
//    ▼
//  RECORDING (mic open, visual feedback)
//    │ player stops speaking / max duration reached
//    ▼
//  PROCESSING (spinner shown, ≤ 1500ms)
//    │
//    ├── outcome: 'pass' ──────────────────► REWARD_ANIMATION → GATE_OPEN
//    │
//    ├── outcome: 'retry' (attempt < max) ► RETRY_FEEDBACK → GATE_DISPLAYED
//    │
//    └── outcome: 'coach_triggered' ──────► COACH_MODE → (after coaching) GATE_DISPLAYED
SECTION 11 — FRONTEND ARCHITECTURE
11.1 React Native App (Mobile)
text

TECH: React Native 0.74+ (New Architecture / Fabric enabled)
STATE: Zustand 4 (lightweight, slice-based)
SERVER STATE: TanStack Query v5 (React Query)
NAVIGATION: React Navigation v6 (stack + bottom tabs)
FORMS: React Hook Form + Zod
STORAGE: react-native-mmkv (encrypted key-value, replaces AsyncStorage)
ANIMATIONS: React Native Reanimated 3
GAME VIEW: react-native-unity-view (Unity embed)
AUDIO: react-native-audio-recorder-player
PUSH NOTIFICATIONS: Notifee + FCM/APNs
ANALYTICS: PostHog React Native SDK
CRASH REPORTING: Sentry React Native

FOLDER STRUCTURE (apps/mobile/src/):
├── screens/
│   ├── auth/
│   │   ├── WelcomeScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   └── ParentalConsentScreen.tsx
│   ├── learner/
│   │   ├── HomeScreen.tsx          ← World map
│   │   ├── GameScreen.tsx          ← Unity embed + ASR overlay
│   │   ├── ProfileScreen.tsx
│   │   └── AchievementsScreen.tsx
│   ├── parent/
│   │   ├── DashboardScreen.tsx
│   │   ├── ProgressScreen.tsx
│   │   └── SettingsScreen.tsx
│   └── teacher/
│       ├── ClassroomScreen.tsx
│       └── StudentDetailScreen.tsx
│
├── components/
│   ├── game/
│   │   ├── ReadingOverlay.tsx      ← Text display + mic button
│   │   ├── ASRFeedback.tsx         ← Pass/fail animations
│   │   ├── CoachPanel.tsx          ← "Lex the Owl" UI
│   │   └── RewardPopup.tsx
│   ├── shared/
│   │   ├── Button.tsx
│   │   ├── Avatar.tsx
│   │   ├── ProgressBar.tsx
│   │   └── StreakBadge.tsx
│   └── layouts/
│       ├── SafeAreaLayout.tsx
│       └── ScrollLayout.tsx
│
├── hooks/
│   ├── useASR.ts                   ← Microphone + ASR submission hook
│   ├── useProgress.ts              ← Progress queries + mutations
│   ├── useGame.ts                  ← Unity bridge event handlers
│   ├── useOfflineSync.ts           ← Sync queue management
│   └── usePermissions.ts           ← Mic + notification permissions
│
├── store/
│   ├── authStore.ts                ← User + tokens
│   ├── gameStore.ts                ← Current game state
│   ├── settingsStore.ts            ← User preferences
│   └── syncStore.ts                ← Offline queue
│
├── services/
│   ├── api/
│   │   ├── client.ts               ← Axios instance + interceptors
│   │   ├── auth.api.ts
│   │   ├── progress.api.ts
│   │   ├── content.api.ts
│   │   └── asr.api.ts
│   ├── audio/
│   │   ├── AudioRecorder.ts        ← Wraps RN audio library
│   │   └── WhisperOffline.ts       ← On-device ASR wrapper
│   └── game/
│       └── UnityBridge.ts          ← PostMessage abstraction
│
└── game-bridge/
    ├── UnityBridgeEvents.ts        ← Event type definitions
    ├── UnityBridgeManager.ts       ← Event router
    └── ASRBridgeHandler.ts         ← ASR result → Unity
11.2 API Client Configuration
TypeScript

// apps/mobile/src/services/api/client.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '../../store/authStore';
import { refreshTokens } from './auth.api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.litplay.app';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,               // 15s default, ASR endpoint overrides to 30s
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-App-Version': process.env.EXPO_PUBLIC_APP_VERSION,
    'X-Platform': Platform.OS,
  },
});

// REQUEST INTERCEPTOR: Inject access token
apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  // Generate trace ID for request tracking
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

// RESPONSE INTERCEPTOR: Handle 401 with token refresh
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue requests while refresh in progress
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { accessToken } = await refreshTokens();
        useAuthStore.getState().setAccessToken(accessToken);
        failedQueue.forEach(({ resolve }) => resolve(accessToken));
        failedQueue = [];
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        failedQueue.forEach(({ reject }) => reject(refreshError));
        failedQueue = [];
        useAuthStore.getState().logout();
        throw refreshError;
      } finally {
        isRefreshing = false;
      }
    }

    throw error;
  }
);
11.3 useASR Hook — Full Implementation Spec
TypeScript

// apps/mobile/src/hooks/useASR.ts
// This hook encapsulates the entire mic → ASR → result flow.
// Game components interact ONLY with this hook — never directly with audio APIs.

interface UseASROptions {
  gateId: string;
  targetText: string;
  languageCode: string;
  difficulty: number;
  onPass: (result: ASRValidationResponse) => void;
  onRetry: (result: ASRValidationResponse) => void;
  onCoach: (result: ASRValidationResponse) => void;
  onError: (error: Error) => void;
}

interface UseASRReturn {
  isRecording: boolean;
  isProcessing: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  audioLevel: number;            // 0.0 – 1.0 for waveform visualizer
  elapsedMs: number;
}

// IMPLEMENTATION RULES:
// 1. Request microphone permission before first recording.
//    If denied: show permission explanation modal (not OS alert).
// 2. Recording auto-stops after 45s (safety limit, gate timer is 30s).
// 3. Audio captured in WAV format at 16kHz mono (Whisper optimal).
// 4. If device is offline: route to WhisperOffline.transcribe()
//    then run local validation, then queue session sync.
// 5. If online: POST to /api/v1/asr/validate with timeout of 30s.
// 6. Audio buffer is held in memory ONLY — never written to disk
//    unless parent audio-save opt-in is enabled.
// 7. On component unmount: stop recording, discard buffer, release mic.
11.4 Next.js Web App Architecture
text

FRAMEWORK: Next.js 14.x (App Router)
STYLING: Tailwind CSS 3.x + shadcn/ui components
CHARTS: Recharts (parent/teacher dashboards)
TABLES: TanStack Table v8
AUTH: next-auth v5 (handles JWT, OAuth, session)
FORMS: React Hook Form + Zod
I18N: next-intl (web-side locale management)
GAME EMBED: WebGL iframe (Unity build exported to web)

ROUTE STRUCTURE (apps/web/app/):
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── consent/page.tsx         ← Parental consent flow
│
├── (learner)/
│   ├── layout.tsx               ← Learner shell layout
│   ├── play/page.tsx            ← WebGL game embed
│   └── profile/page.tsx
│
├── (parent)/
│   ├── layout.tsx
│   ├── dashboard/page.tsx
│   ├── children/[childId]/
│   │   ├── progress/page.tsx
│   │   └── settings/page.tsx
│   └── billing/page.tsx
│
├── (teacher)/
│   ├── layout.tsx
│   ├── classrooms/
│   │   ├── page.tsx             ← List classrooms
│   │   └── [classroomId]/
│   │       ├── page.tsx         ← Classroom dashboard
│   │       ├── students/[studentId]/page.tsx
│   │       └── reports/page.tsx
│   └── content/page.tsx
│
├── (admin)/
│   ├── layout.tsx               ← Admin guard (superadmin only)
│   ├── users/page.tsx
│   ├── content/page.tsx
│   └── analytics/page.tsx
│
└── api/                         ← BFF (Backend for Frontend) routes
    ├── auth/[...nextauth]/route.ts
    └── proxy/[...path]/route.ts  ← Proxies to microservices
                                   (avoids CORS in browser game)
SECTION 12 — BACKEND SERVICES — DETAILED SPEC
12.1 Service Standards (Apply to ALL Services)
TypeScript

// Every NestJS service MUST implement these standards:

// 1. MODULE STRUCTURE
// service-name/
//   └── src/
//       ├── [domain]/
//       │   ├── [domain].module.ts
//       │   ├── [domain].controller.ts   ← HTTP + gRPC handlers
//       │   ├── [domain].service.ts      ← Business logic only
//       │   ├── [domain].repository.ts   ← DB access only
//       │   ├── dto/                     ← Request/response DTOs
//       │   └── entities/                ← TypeORM entities
//       ├── common/
//       │   ├── filters/
//       │   │   └── global-exception.filter.ts
//       │   ├── interceptors/
//       │   │   ├── logging.interceptor.ts
//       │   │   └── transform.interceptor.ts  ← Wraps in APISuccessResponse
//       │   ├── guards/
//       │   │   ├── jwt-auth.guard.ts
//       │   │   └── roles.guard.ts
//       │   └── decorators/
//       │       └── roles.decorator.ts
//       ├── config/
//       │   └── config.service.ts        ← Typed env config
//       ├── health/
//       │   └── health.controller.ts     ← GET /health (k8s probes)
//       └── main.ts

// 2. HEALTH CHECK ENDPOINT (ALL services)
// GET /health
// Response 200: { status: "ok", db: "ok", timestamp: ISO8601 }
// Response 503: { status: "degraded", db: "error", ... }
// Used by: Kubernetes liveness + readiness probes

// 3. LOGGING (ALL services)
// Logger: Pino (JSON structured, via @packages/logger)
// Every request: method, path, statusCode, durationMs, requestId, userId
// Every error: full stack trace + context
// Log levels: ERROR (always), WARN (always), INFO (prod), DEBUG (dev only)

// 4. VALIDATION (ALL services)
// class-validator + class-transformer on ALL DTOs
// Global ValidationPipe with:
//   whitelist: true            ← Strip unknown fields
//   forbidNonWhitelisted: true ← Reject unknown fields with 400
//   transform: true            ← Auto-transform to DTO types

// 5. EXCEPTION HANDLING
// GlobalExceptionFilter catches ALL unhandled exceptions
// Maps to RFC 7807 error format
// Never exposes stack traces in production
// Always includes requestId for correlation
12.2 Kafka Event Bus — Topics & Schemas
TypeScript

// All Kafka events defined in packages/types/src/events.ts
// Topic naming: litplay.{domain}.{entity}.{verb}
// All events: { eventId: UUID, timestamp: ISO8601, version: string, payload: T }

// TOPICS & SCHEMAS:

litplay.identity.user.registered
  payload: { userId, email, role, languageCode, ageGroup }

litplay.identity.user.deletion_requested
  payload: { userId, requestedAt }

litplay.learning.session.completed
  payload: {
    sessionId, userId, contentId, gateId,
    outcome, matchScore, languageCode, difficulty,
    wordsRead, durationMs, isOffline
  }
  consumers: [progress-svc, analytics-svc, notification-svc]

litplay.learning.achievement.earned
  payload: { userId, badgeType, badgeLabel, earnedAt }
  consumers: [notification-svc, analytics-svc]

litplay.learning.streak.updated
  payload: { userId, newStreakDays, previousStreakDays }
  consumers: [notification-svc, analytics-svc]

litplay.game.world.unlocked
  payload: { userId, worldId, worldName, unlockedAt }
  consumers: [analytics-svc, notification-svc]

litplay.classroom.member.joined
  payload: { classroomId, learnerId, teacherId, joinedAt }
  consumers: [analytics-svc, notification-svc]

litplay.billing.subscription.created
  payload: { userId, planTier, amountCents, currency }
  consumers: [analytics-svc, notification-svc]

litplay.billing.subscription.cancelled
  payload: { userId, planTier, cancelledAt, reason }
  consumers: [analytics-svc, notification-svc, user-svc]
SECTION 13 — AI & ML LAYER
13.1 AI Components Overview
text

┌─────────────────────────────────────────────────────────────────────┐
│                     AI/ML COMPONENTS                                │
├──────────────────────┬──────────────────────────────────────────────┤
│ COMPONENT            │ SPEC                                         │
├──────────────────────┼──────────────────────────────────────────────┤
│ ASR Engine           │ OpenAI Whisper large-v3                      │
│                      │ Self-hosted on GPU nodes (not OpenAI API)    │
│                      │ Rationale: latency, cost, privacy, offline   │
├──────────────────────┼──────────────────────────────────────────────┤
│ AI Tutor ("Lex")     │ GPT-4o via Azure OpenAI (HIPAA/FERPA SLA)   │
│                      │ Structured output (JSON mode)                │
│                      │ Temperature: 0.7 (warm, encouraging)         │
│                      │ Max tokens: 150 per coaching response        │
│                      │ Prompt versioned in /services/ai-tutor-svc/  │
│                      │   app/prompts/                               │
├──────────────────────┼──────────────────────────────────────────────┤
│ Adaptive Difficulty  │ Custom ML model (scikit-learn / XGBoost)     │
│ Engine               │ Inputs: accuracy_rate, session_duration,     │
│                      │   words_per_minute, phonics_gaps,            │
│                      │   consecutive_passes, grade_level            │
│                      │ Output: recommended next difficulty (1-10)   │
│                      │ Retrained weekly on anonymized session data  │
├──────────────────────┼──────────────────────────────────────────────┤
│ Story Generator      │ GPT-4o with system prompt for age-appropriate│
│ (V3 feature)         │ content generation                          │
│                      │ Constrained to target difficulty level       │
│                      │ Output validated through FK readability check│
├──────────────────────┼──────────────────────────────────────────────┤
│ Content Search       │ Pinecone vector DB                           │
│                      │ Embeddings: text-embedding-3-small           │
│                      │ Used for: "find similar content at same      │
│                      │   level", semantic content recommendation    │
└──────────────────────┴──────────────────────────────────────────────┘
13.2 AI Tutor Prompt Architecture
text

PROMPT VERSIONING SYSTEM:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: services/ai-tutor-svc/app/prompts/
File format: coaching_v{N}.txt (immutable, never edited)
Active version: configured via COACHING_PROMPT_VERSION env var
Rollback: change env var, redeploy (< 5 min)

SYSTEM PROMPT REQUIREMENTS (for prompt engineers):
  ✅ ALWAYS encouraging and warm in tone
  ✅ Use child's name if available (injected via template variable)
  ✅ Break down the specific word that was wrong
  ✅ Give a phonetic hint using simple vocabulary
  ✅ Suggest a memory trick where possible
  ✅ End with encouragement to try again
  ❌ NEVER use "wrong", "incorrect", "failed", "bad"
  ❌ NEVER reference other children or comparison
  ❌ NEVER exceed 3 sentences in response
  ❌ NEVER generate content unrelated to the word/phrase

PROMPT TEMPLATE (v1):
  System: You are Lex, a friendly owl who helps children learn to read.
          You are warm, patient, and encouraging. You NEVER make children
          feel bad. You speak simply for age {ageGroup}.
          Output JSON: { hint: string, encouragement: string, phonetic: string }

  User:   The child tried to read "{targetWord}" and said "{spokenWord}".
          Age group: {ageGroup}. Language: {languageCode}.
          Give a helpful coaching hint.
SECTION 14 — AUTH & IDENTITY
14.1 Authentication Flow
text

AUTHENTICATION STRATEGY: JWT (Stateless) + Refresh Token Rotation

ACCESS TOKEN:
  Library: @nestjs/jwt
  Algorithm: RS256 (asymmetric — private key signs, public key verifies)
  Expiry: 15 minutes
  Payload:
    { sub: userId, role, email, iat, exp, jti (unique token ID) }
  Storage (client): In-memory ONLY (Zustand store, mmkv for persistence)
  Transmission: Authorization: Bearer <token> header

REFRESH TOKEN:
  Format: Opaque random string (64 bytes, crypto.randomBytes)
  Storage (server): Hashed with SHA-256 in identity.refresh_tokens table
  Storage (client): HttpOnly, Secure, SameSite=Strict cookie (web)
                    react-native-mmkv encrypted store (mobile)
  Expiry: 30 days (rolling)
  Rotation: New refresh token issued on every use (old one revoked)
  Family tracking: If revoked token used → entire family revoked (reuse detection)

TOKEN REFRESH FLOW:
  Client detects 401 response
    │
    ▼
  POST /api/v1/auth/refresh (with refresh token in cookie/header)
    │
    ▼
  Server: hash incoming token → lookup in DB → verify not revoked + not expired
    │
    ├── Valid → issue new access + refresh token → revoke old refresh token
    │
    └── Invalid → 401 → client clears all tokens → redirect to login
14.2 COPPA Compliance Flow
text

COPPA GATE (US users, age < 13):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. During registration: collect dateOfBirth
2. If age < 13 (calculated server-side, never client-side):
   a. Account created in PENDING_CONSENT state
   b. No game access granted yet
   c. Parental consent email sent to parentEmail
   d. Consent email contains: what data we collect, why, and consent link
   e. Consent link expires in 7 days
   f. If consent not granted in 7 days: account auto-deleted

3. Parent clicks consent link:
   a. Parent verifies identity (email + DOB of child)
   b. Consent version logged: { version, grantedAt, ipAddress, userAgent }
   c. Child account activated
   d. Parent account auto-created and linked

4. Consent withdrawal:
   a. Parent can revoke consent from dashboard at any time
   b. Revocation triggers: user.deletion_requested event
   c. All child data purged within 30 days

FERPA COMPLIANCE:
  • Educational records (session data, progress) only accessible to:
    - The learner themselves
    - Their linked parent
    - Teachers in whose classroom they are enrolled
    - District admins (aggregate only, not individual records)
    - LitPlay support staff (with audit logging of every access)
  • No educational records shared with third parties
  • No educational records used for advertising
14.3 Role-Based Access Control (RBAC)
TypeScript

// packages/types/src/enums.ts

export enum Role {
  LEARNER = 'learner',
  PARENT = 'parent',
  TEACHER = 'teacher',
  DISTRICT_ADMIN = 'district_admin',
  SUPERADMIN = 'superadmin',
}

// PERMISSION MATRIX
// Format: endpoint → [roles that can access]

const PERMISSIONS = {
  // Progress
  'GET /progress/me':                    [Role.LEARNER],
  'GET /progress/:userId':               [Role.PARENT, Role.TEACHER, Role.SUPERADMIN],
  'POST /progress/sessions':             [Role.LEARNER],

  // Content
  'GET /content':                        [Role.LEARNER, Role.TEACHER, Role.PARENT, Role.DISTRICT_ADMIN],
  'POST /content':                       [Role.SUPERADMIN],
  'PATCH /content/:id':                  [Role.SUPERADMIN],

  // Classrooms
  'POST /classrooms':                    [Role.TEACHER, Role.SUPERADMIN],
  'GET /classrooms/:id/progress':        [Role.TEACHER, Role.SUPERADMIN],
  'GET /classrooms/:id/reports/pdf':     [Role.TEACHER, Role.SUPERADMIN],

  // Users
  'GET /users':                          [Role.SUPERADMIN],
  'DELETE /users/:userId':               [Role.SUPERADMIN],   // Hard delete (GDPR)

  // Analytics
  'GET /analytics/district':             [Role.DISTRICT_ADMIN, Role.SUPERADMIN],
  'GET /analytics/global':               [Role.SUPERADMIN],
} as const;

// ADDITIONAL RULES (enforced in service layer, not just gateway):
// • PARENT can only access their OWN children's data
//   (verified by parentUserId linkage, not just role check)
// • TEACHER can only access students in their OWN classrooms
//   (verified by classroom membership query, not just role check)
// • DISTRICT_ADMIN can only access schools in their district
//   (verified by district linkage)
// Pure role checks at gateway are necessary but NOT sufficient.
// Service-layer ownership checks are MANDATORY.
SECTION 15 — INFRASTRUCTURE & DEVOPS
15.1 Cloud Infrastructure
text

CLOUD PROVIDER: AWS (primary)
BACKUP PROVIDER: Cloudflare (CDN, DNS, WAF, R2 storage)

REGION STRATEGY:
  Primary:   us-east-1 (N. Virginia)    ← US, Americas
  Secondary: eu-west-1 (Ireland)        ← Europe, Africa
  Tertiary:  ap-southeast-1 (Singapore) ← Asia Pacific

ACTIVE-ACTIVE:
  All three regions serve traffic (Route 53 latency routing)
  Data layer: PostgreSQL primary in us-east-1 with read replicas
              in eu-west-1 and ap-southeast-1
  Session data: Redis cluster per region (no cross-region session)
  Object storage: S3 with Cross-Region Replication enabled
15.2 Kubernetes Resource Specs
YAML

# RESOURCE ALLOCATIONS PER SERVICE POD
# Format: requests (guaranteed) / limits (burstable)

auth-svc:
  replicas: 3 (min) → 10 (max, HPA on CPU > 70%)
  resources:
    requests: { cpu: 250m, memory: 256Mi }
    limits:   { cpu: 500m, memory: 512Mi }

user-svc:
  replicas: 2 → 8
  resources:
    requests: { cpu: 250m, memory: 256Mi }
    limits:   { cpu: 500m, memory: 512Mi }

content-svc:
  replicas: 2 → 6
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits:   { cpu: 1000m, memory: 1Gi }

asr-svc:                                   # GPU nodes
  replicas: 2 → 8 (HPA on GPU utilization > 60%)
  nodeSelector: { accelerator: nvidia-t4 }
  resources:
    requests: { cpu: 2000m, memory: 4Gi, nvidia.com/gpu: 1 }
    limits:   { cpu: 4000m, memory: 8Gi, nvidia.com/gpu: 1 }

progress-svc:
  replicas: 3 → 12 (highest traffic)
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 1000m, memory: 1Gi }

classroom-svc:
  replicas: 2 → 6
  resources:
    requests: { cpu: 250m, memory: 256Mi }
    limits:   { cpu: 500m, memory: 512Mi }

ai-tutor-svc:
  replicas: 2 → 8
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 1000m, memory: 1Gi }

analytics-svc:
  replicas: 2 → 4
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits:   { cpu: 2000m, memory: 4Gi }

# POD DISRUPTION BUDGETS (ensure availability during node maintenance)
# All services: minAvailable: 1
# asr-svc, progress-svc: minAvailable: 2
15.3 Terraform Module Structure
hcl

# infra/terraform/main.tf

module "eks_cluster" {
  source          = "./modules/eks"
  cluster_name    = "litplay-${var.environment}"
  cluster_version = "1.29"
  node_groups = {
    general = {
      instance_type = "t3.xlarge"
      min_size      = 3
      max_size      = 20
      desired_size  = 5
    }
    gpu = {
      instance_type = "g4dn.xlarge"    # NVIDIA T4
      min_size      = 2
      max_size      = 10
      desired_size  = 2
      taints        = [{ key = "nvidia.com/gpu", effect = "NO_SCHEDULE" }]
    }
  }
}

module "rds_postgres" {
  source                 = "./modules/rds"
  engine_version         = "16.2"
  instance_class         = "db.r6g.xlarge"
  multi_az               = true
  read_replica_count     = 2
  backup_retention_days  = 30
  deletion_protection    = true
  storage_encrypted      = true
  performance_insights   = true
}

module "elasticache_redis" {
  source              = "./modules/elasticache"
  engine_version      = "7.2"
  node_type           = "cache.r6g.large"
  num_cache_clusters  = 3          # Multi-AZ
  at_rest_encryption  = true
  in_transit_encryption = true
}

module "kafka_msk" {
  source         = "./modules/kafka"
  kafka_version  = "3.6.0"
  instance_type  = "kafka.m5.large"
  broker_count   = 3
  storage_gb     = 1000
  encryption_at_rest = true
}

module "s3_media" {
  source              = "./modules/s3"
  bucket_name         = "litplay-media-${var.environment}"
  versioning          = true
  lifecycle_rules     = {
    audio_recordings  = { transition_to_ia_days = 30, expiry_days = 90 }
    game_assets       = { transition_to_ia_days = 90 }
  }
  replication_regions = ["eu-west-1", "ap-southeast-1"]
  server_side_encryption = "AES256"
}
SECTION 16 — CI/CD PIPELINE
16.1 GitHub Actions Pipeline Spec
YAML

# .github/workflows/ci.yml — Full spec

name: CI Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

env:
  NODE_VERSION: '20.x'
  PYTHON_VERSION: '3.11'
  PNPM_VERSION: '9.x'

jobs:
  # ─────────────────────────────────────────
  # JOB 1: Code Quality Gates
  # ─────────────────────────────────────────
  quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - name: Lint (ESLint + Prettier)
        run: pnpm turbo lint
      - name: TypeScript check
        run: pnpm turbo type-check
      - name: Validate OpenAPI spec
        run: pnpm run validate:openapi
      - name: Check for hardcoded secrets
        uses: trufflesecurity/trufflehog@main
      - name: Dependency vulnerability scan
        run: pnpm audit --audit-level=high

  # ─────────────────────────────────────────
  # JOB 2: Unit + Integration Tests
  # ─────────────────────────────────────────
  test:
    name: Tests
    runs-on: ubuntu-latest
    needs: [quality]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: litplay_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: --health-cmd "redis-cli ping"
    steps:
      - uses: actions/checkout@v4
      - name: Run all tests with coverage
        run: pnpm turbo test:coverage
      - name: Assert coverage thresholds
        # Minimum: 80% overall, 90% for ASR validation module
        run: pnpm run coverage:check
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4

  # ─────────────────────────────────────────
  # JOB 3: Security Scan
  # ─────────────────────────────────────────
  security:
    name: Security
    runs-on: ubuntu-latest
    needs: [quality]
    steps:
      - uses: actions/checkout@v4
      - name: SAST scan (Semgrep)
        uses: semgrep/semgrep-action@v1
        with:
          config: p/owasp-top-ten
      - name: Container image scan (Trivy)
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

  # ─────────────────────────────────────────
  # JOB 4: Build & Push Docker Images
  # ─────────────────────────────────────────
  build:
    name: Build Images
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        service:
          - auth-svc
          - user-svc
          - content-svc
          - progress-svc
          - classroom-svc
          - asr-svc
          - ai-tutor-svc
          - analytics-svc
          - notification-svc
          - billing-svc
          - i18n-svc
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./services/${{ matrix.service }}
          push: true
          tags: |
            ${{ env.ECR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}
            ${{ env.ECR_REGISTRY }}/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─────────────────────────────────────────
  # JOB 5: Deploy to Staging
  # ─────────────────────────────────────────
  deploy-staging:
    name: Deploy Staging
    runs-on: ubuntu-latest
    needs: [build]
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Configure kubectl
        uses: aws-actions/eks-update-kubeconfig@v1
        with:
          cluster-name: litplay-staging
      - name: Deploy via Helm
        run: |
          helm upgrade --install litplay ./infra/helm/litplay-services \
            --namespace litplay-staging \
            --values ./infra/helm/litplay-services/values.staging.yaml \
            --set global.imageTag=${{ github.sha }} \
            --atomic \
            --timeout 10m
      - name: Run smoke tests
        run: pnpm run test:smoke -- --env=staging
      - name: Notify Slack (staging deployed)
        uses: slackapi/slack-github-action@v1

  # ─────────────────────────────────────────
  # JOB 6: Deploy to Production (Canary)
  # ─────────────────────────────────────────
  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    environment: production         # Requires manual approval in GitHub
    steps:
      - name: Canary deploy (5% traffic)
        run: |
          helm upgrade litplay ./infra/helm/litplay-services \
            --set global.imageTag=${{ github.sha }} \
            --set global.canaryWeight=5 \
            --namespace litplay-prod
      - name: Monitor canary (10 minutes)
        run: pnpm run monitor:canary -- --duration=600 --error-threshold=1
      - name: Full rollout (100% traffic)
        run: |
          helm upgrade litplay ./infra/helm/litplay-services \
            --set global.imageTag=${{ github.sha }} \
            --set global.canaryWeight=100 \
            --namespace litplay-prod
      - name: Tag release in GitHub
        run: gh release create v${{ github.sha }} --generate-notes
SECTION 17 — SECURITY ARCHITECTURE
17.1 Security Controls Matrix
text

┌─────────────────────────────────────────────────────────────────────────┐
│                      SECURITY CONTROLS                                  │
├────────────────────────┬────────────────────────────────────────────────┤
│ THREAT                 │ CONTROL                                        │
├────────────────────────┼────────────────────────────────────────────────┤
│ SQL Injection          │ TypeORM parameterized queries. No raw SQL.     │
│                        │ Semgrep rule: detect raw query concatenation   │
├────────────────────────┼────────────────────────────────────────────────┤
│ XSS                    │ Next.js auto-escaping. CSP header enforced.    │
│                        │ DOMPurify for any user-generated HTML          │
├────────────────────────┼────────────────────────────────────────────────┤
│ CSRF                   │ SameSite=Strict cookies. CSRF token for forms  │
│                        │ that modify state (web only)                   │
├────────────────────────┼────────────────────────────────────────────────┤
│ Brute Force            │ Account lockout after 5 failed logins (15 min) │
│                        │ Rate limiting at Kong (per IP + per user)      │
│                        │ CAPTCHA after 3 failed attempts (hCaptcha)    │
├────────────────────────┼────────────────────────────────────────────────┤
│ JWT Tampering          │ RS256 (asymmetric). Public key only in gateway.│
│                        │ JTI (token ID) for revocation tracking         │
├────────────────────────┼────────────────────────────────────────────────┤
│ Data Exposure          │ Response DTOs whitelist all returned fields.   │
│                        │ Never expose: password_hash, token_hash        │
├────────────────────────┼────────────────────────────────────────────────┤
│ SSRF                   │ No user-controlled URLs in backend HTTP calls  │
│                        │ Allowlist for webhook destinations             │
├────────────────────────┼────────────────────────────────────────────────┤
│ Dependency Attacks     │ pnpm audit in CI (fail on HIGH/CRITICAL)       │
│                        │ Dependabot auto-PRs for security patches        │
│                        │ Lock file committed and verified in CI         │
├────────────────────────┼────────────────────────────────────────────────┤
│ Secrets Exposure       │ All secrets in AWS Secrets Manager             │
│                        │ Injected as env vars via External Secrets Op.  │
│                        │ TruffleHog scan on every PR                   │
│                        │ .env files: gitignored, never committed        │
├────────────────────────┼────────────────────────────────────────────────┤
│ Container Security     │ Distroless base images                         │
│                        │ Non-root user in all containers                │
│                        │ Read-only filesystem where possible            │
│                        │ Trivy scan in CI, Falco at runtime             │
├────────────────────────┼────────────────────────────────────────────────┤
│ Network Security       │ All pods in private subnets                    │
│                        │ NetworkPolicy: deny all ingress by default,    │
│                        │   whitelist only required service-to-service   │
│                        │ No service exposed to internet (all via ALB)   │
├────────────────────────┼────────────────────────────────────────────────┤
│ DDoS                   │ Cloudflare (layer 7 WAF + rate limiting)       │
│                        │ AWS Shield Standard                            │
│                        │ Kong rate limiting (backup layer)             │
├────────────────────────┼────────────────────────────────────────────────┤
│ Audio Data Privacy     │ Voice audio: processed in-memory, never stored │
│                        │ If stored (opt-in): AES-256 at rest            │
│                        │ S3 bucket: private, no public ACLs            │
│                        │ Pre-signed URLs for authorized access only     │
└────────────────────────┴────────────────────────────────────────────────┘
17.2 Security Headers (All Responses)
text

# Kong plugin: response-headers

Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{CSP_NONCE}';
  style-src 'self' 'nonce-{CSP_NONCE}';
  img-src 'self' data: https://cdn.litplay.app;
  media-src 'self' https://cdn.litplay.app;
  connect-src 'self' https://api.litplay.app wss://api.litplay.app;
  frame-src 'none';
  frame-ancestors 'none';
  form-action 'self';

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: microphone=(self), camera=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
SECTION 18 — COMPLIANCE & PRIVACY
18.1 Data Classification
text

┌─────────────────────────────────────────────────────────────────────┐
│                      DATA CLASSIFICATION                            │
├──────────────┬──────────────────────────────────────────────────────┤
│ LEVEL        │ EXAMPLES                                             │
├──────────────┼──────────────────────────────────────────────────────┤
│ PUBLIC       │ Game worlds (names, descriptions)                    │
│              │ Content library metadata (without text)              │
│              │ Marketing content                                    │
├──────────────┼──────────────────────────────────────────────────────┤
│ INTERNAL     │ Content text (non-sensitive)                         │
│              │ Aggregate anonymized analytics                       │
│              │ Teacher classroom names                              │
├──────────────┼──────────────────────────────────────────────────────┤
│ CONFIDENTIAL │ User email addresses                                 │
│              │ Reading session data (identified)                    │
│              │ Progress data (identified)                           │
│              │ Billing information                                  │
├──────────────┼──────────────────────────────────────────────────────┤
│ RESTRICTED   │ Password hashes                                      │
│              │ Refresh token hashes                                 │
│              │ Date of birth                                        │
│              │ Audio recordings (if stored)                         │
│              │ Parent consent records                               │
│              │ Any data for users under 13                          │
└──────────────┴──────────────────────────────────────────────────────┘

CONTROLS BY CLASSIFICATION:
  PUBLIC:       No access control required
  INTERNAL:     Authenticated users only
  CONFIDENTIAL: Role-based access + audit log on read
  RESTRICTED:   Role-based + ownership check + audit log + encrypted at field level
18.2 GDPR / COPPA Implementation Checklist
text

GDPR REQUIREMENTS:
  ☑ Right to Access:        GET /api/v1/users/me/data-export (ZIP of all data)
  ☑ Right to Erasure:       DELETE /api/v1/users/me → async purge within 30 days
  ☑ Right to Rectification: PATCH /api/v1/users/me
  ☑ Right to Portability:   JSON export of all reading sessions + progress
  ☑ Data Minimization:      Only collect what's needed. No behavioral ads.
  ☑ Consent Granularity:    Separate consents: analytics, audio saving, marketing
  ☑ Consent Withdrawal:     Toggle in settings, takes effect within 24 hours
  ☑ DPA:                    Data Processing Agreements with AWS, OpenAI (Azure)
  ☑ DPO:                    Designate Data Protection Officer (legal req for EU)
  ☑ Breach Notification:    Pagerduty alert → legal team → 72-hour GDPR reporting

COPPA REQUIREMENTS:
  ☑ Verifiable Parental Consent: Email-based consent with identity verification
  ☑ No Behavioral Advertising: Zero ad targeting for all users, especially <13
  ☑ Data Collection Limitation: Minimum data for <13 users
  ☑ Parental Review: Parents can review and delete all child data
  ☑ Reasonable Security: Encryption + access controls documented
  ☑ Privacy Policy: Clearly written, child-directed version available

FERPA REQUIREMENTS:
  ☑ Education Record Access: Only authorized school officials
  ☑ Directory Information: Opt-out mechanism for parents
  ☑ Third-Party Disclosure: No disclosure without written consent
  ☑ Annual Notification: In-app reminder of FERPA rights
SECTION 19 — OBSERVABILITY & MONITORING
19.1 Observability Stack
text

OBSERVABILITY PILLARS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

METRICS (What is happening?):
  Collection: Prometheus (scrapes all pods via /metrics endpoint)
  Visualization: Grafana (dashboards per service + global)
  Alerting: Alertmanager → PagerDuty
  Custom metrics exposed by every service:
    • http_requests_total (counter, by path/method/status)
    • http_request_duration_ms (histogram, by path)
    • asr_processing_duration_ms (histogram)
    • asr_outcome_total (counter, by outcome type)
    • reading_sessions_total (counter, by language/difficulty)
    • active_learners_gauge (gauge)
    • kafka_consumer_lag (gauge, per topic)

LOGS (What went wrong?):
  Format: JSON (Pino structured logger)
  Collection: AWS CloudWatch Logs (via Fluent Bit DaemonSet)
  Search: CloudWatch Log Insights
  Retention: 90 days hot, 1 year archive (S3 Glacier)
  Required fields on every log:
    { level, timestamp, service, requestId, userId?, message, ...context }

TRACES (Why did it happen?):
  Tool: AWS X-Ray (via opentelemetry-sdk)
  Instrumentation: Auto-instrument NestJS + FastAPI + Axios
  Sampling: 10% of requests in production, 100% of errors
  Trace propagation: W3C TraceContext headers across all services

REAL USER MONITORING:
  Tool: PostHog (self-hosted or cloud)
  Events: All user interactions (non-PII)
  Session recording: Opt-in only, masked PII fields
  Funnels: Onboarding → First Session → 7-day Retention
19.2 Alerting Rules
YAML

# Critical Alerts (PagerDuty wake-up call, 24/7)
- alert: APIErrorRateHigh
  condition: http_5xx_rate > 1% for 2 minutes
  severity: critical

- alert: ASRLatencyHigh
  condition: asr_p95_latency > 3000ms for 5 minutes
  severity: critical

- alert: DatabaseConnectionPoolExhausted
  condition: pg_pool_waiting > 10 for 1 minute
  severity: critical

- alert: KafkaConsumerLagHigh
  condition: kafka_consumer_lag > 10000 for 5 minutes
  severity: critical

- alert: PodCrashLooping
  condition: pod restart_count > 3 in 10 minutes
  severity: critical

# Warning Alerts (Slack notification, business hours)
- alert: ASRAccuracyDegraded
  condition: avg(asr_match_score) < 0.75 for 15 minutes
  severity: warning

- alert: OfflineSyncQueueGrowing
  condition: offline_sync_queue_size > 1000 for 10 minutes
  severity: warning

- alert: DiskUsageHigh
  condition: disk_usage > 80%
  severity: warning

- alert: SSL_CertExpiring
  condition: ssl_cert_days_remaining < 30
  severity: warning
SECTION 20 — FEATURE FLAGS & EXPERIMENTATION
20.1 Feature Flag System
text

TOOL: Unleash (self-hosted, open-source)
Location: infra/helm/unleash/

WHY UNLEASH (not LaunchDarkly):
  • Self-hosted = no vendor dependency for feature access
  • Cost: free vs $300+/mo for LaunchDarkly at scale
  • FERPA compliance: flags evaluated server-side, no child data to vendor

INTEGRATION:
  • Backend: @unleash/unleash-client (Node.js)
  • Mobile: Unleash Proxy → mobile SDK
  • Evaluation: Always server-side (never trust client-side flag state for gates)

FLAG NAMING CONVENTION:
  {team}.{feature}.{variant?}
  e.g.:
    game.multiplayer-coop.enabled
    ml.adaptive-difficulty.v2
    teacher.ai-suggestions.beta
    billing.district-tier.enabled

FLAG TYPES:
  release    ← On/off for new features (kill switch)
  experiment ← A/B test (assigned by userId, stable)
  ops        ← Operational toggles (maintenance mode, etc.)
  permission ← Role/tier gating

EXPERIMENT TRACKING:
  All experiments emit events to analytics-svc:
    { userId, flagName, variant, timestamp }
  Analysis: ClickHouse SQL queries on experiment cohorts
  Statistical significance: minimum 1000 users per variant,
                            95% confidence threshold
SECTION 21 — CONTENT MANAGEMENT SYSTEM
21.1 CMS Architecture
text

CMS TOOL: Sanity.io (hosted)
WHY SANITY:
  • GROQ query language is powerful for structured content
  • Real-time collaboration for content editors
  • CDN-delivered content API
  • Schema-as-code (TypeScript)
  • Excellent image + asset handling

CMS SCHEMAS (authoritative definitions in content-svc/sanity/schemas/):

  ContentItem schema:
    • title (string)
    • languageCode (string, ISO 639-1)
    • difficultyLevel (number 1-10, slider)
    • genre (array of predefined options)
    • textContent (text, required)
    • htmlContent (text, optional — for karaoke highlighting)
    • audioExample (file, optional)
    • image (image with hotspot)
    • tags (array of strings)
    • worldReference (reference to World)
    • fleschKincaidGrade (number, auto-computed via webhook)
    • wordCount (number, auto-computed)
    • isPublished (boolean)

  World schema:
    • name (string)
    • description (text)
    • theme (string)
    • unlockLevel (number)
    • orderIndex (number)
    • thumbnail (image)
    • isPublished (boolean)

CONTENT PIPELINE:
  Sanity CMS (editor creates content)
      │
      ▼ (GROQ API or webhook on publish)
      │
  content-svc /api/v1/content (ingestion endpoint)
      │
      ▼
  PostgreSQL content.items table
      │
      ▼
  Pinecone (embedding generated async via analytics-svc)
      │
      ▼
  CloudFront CDN (media assets served globally)

READABILITY AUTO-COMPUTATION:
  On content save webhook → content-svc calls
  Python textstat library → returns Flesch-Kincaid grade
  Stored in content.items.flesch_kincaid_grade
  Editors see this in Sanity UI (read-only computed field)
SECTION 22 — LOCALIZATION & i18n ARCHITECTURE
22.1 Language Architecture (Full Spec)
text

PRINCIPLE: Language is a runtime parameter, never a compile-time constant.
No string, label, content text, ASR model, or UI direction is hardcoded.

LAYERS OF LOCALIZATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LAYER 1: UI Strings (frontend labels, buttons, messages)
  Tool: next-intl (web) + i18n-js (React Native)
  Source of truth: /packages/i18n/locales/{lang}.json
  Format: ICU message format (supports plurals, gender)
  Example: en.json: { "gate.readThis": "Read this aloud:", ... }

LAYER 2: Content Text (stories, reading passages)
  Source of truth: Sanity CMS, per content item
  Language field: ISO 639-1 code
  RTL content: Sanity supports RTL text direction per field
  Query: always filtered by languageCode

LAYER 3: ASR Model (speech recognition engine)
  Source of truth: asr-svc language router
  Config file: asr-svc/app/core/language_config.py
  Example entry:
    "ar": {
      "whisper_lang": "arabic",
      "phoneme_library": "epitran_ara",
      "contraction_map": None,
      "rtl": True,
      "fuzzy_threshold_boost": 0.05   # Arabic phoneme variation is high
    }

LAYER 4: AI Tutor Response Language
  GPT-4o system prompt includes: "Respond in {languageCode} language."
  Language code injected from learner profile at request time.

LAYER 5: Date, Number, Currency Formatting
  Use Intl API (native, no library needed)
  Always pass locale to Intl.DateTimeFormat, Intl.NumberFormat

RTL SUPPORT:
  CSS: dir="rtl" on <html> (web) / I18nManager.forceRTL (React Native)
  Components: All layout components use logical CSS properties
    (margin-inline-start, not margin-left)
  Arabic, Hebrew, Urdu supported at launch

ADDING A NEW LANGUAGE (checklist):
  □ Add ISO 639-1 code to SUPPORTED_LANGUAGES enum in packages/types
  □ Add Whisper language mapping in asr-svc/app/core/language_config.py
  □ Add language config (phoneme lib, RTL flag, fuzzy boost)
  □ Translate /packages/i18n/locales/{lang}.json (human translator)
  □ Create content in Sanity CMS for new language
  □ Test ASR accuracy: minimum 85% on benchmark phrase set
  □ Enable via Unleash feature flag: language.{code}.enabled
  □ Deploy Whisper model variant for new language (if needed)
  → Estimated effort: 2–4 engineering days + translation time
SECTION 23 — OFFLINE-FIRST ARCHITECTURE
23.1 Offline Strategy
text

OFFLINE-FIRST PRINCIPLE:
  The app MUST function as if it has no internet connection.
  Network connectivity is an enhancement, not a requirement.

CLIENT-SIDE STORAGE LAYER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Tool: react-native-mmkv (encrypted key-value store)
  Why MMKV: 10x faster than AsyncStorage, encrypted, synchronous reads

  Stored Offline:
    ✅ Learner profile + settings
    ✅ Game progress (player state, completed gates)
    ✅ Pre-cached content (150 items minimum, per selected language)
    ✅ Pending session queue (up to 500 unsynced sessions)
    ✅ Daily stats (buffered)
    ✅ Achievements (buffered)
    ✅ Whisper model (device filesystem, encrypted)

  NOT Stored Offline:
    ❌ Other users' data
    ❌ Teacher classroom data
    ❌ Billing information
    ❌ Audio recordings

CACHE WARMING STRATEGY:
  On first launch (online):
    1. Download content for selected language + difficulty 1-5
    2. Download Whisper model for selected language
    3. Download game world assets (Unity AssetBundles)
  On each app foreground (if online):
    1. Sync unsynced sessions from queue
    2. Refresh content cache (check for new items, max 10 new items/day)
    3. Pull latest learner profile + progress from server

SYNC QUEUE MANAGER (useOfflineSync.ts):
  Data structure: MMKV key "sync_queue" = JSON array of SyncItem
  SyncItem: { id, type, payload, createdAt, attempts, lastAttemptAt }

  Sync trigger:
    1. App foreground event
    2. Network state change: offline → online
    3. Manual: user taps "Sync now" in settings

  Sync algorithm:
    1. Fetch sync_queue from MMKV
    2. Sort by createdAt (oldest first)
    3. POST /api/v1/progress/sessions (batch, max 50 at a time)
    4. On success: remove from queue
    5. On failure: increment attempts, set lastAttemptAt
    6. Max attempts: 10 (after that: log warning, keep in queue)
    7. Conflict resolution: server timestamp wins

CONFLICT RESOLUTION RULES:
  Session records: Idempotent by (gateId + userId + UTC date)
                   Duplicate sessions silently deduplicated server-side.
  Progress stats:  Server recalculates from sessions (source of truth).
  Player state:    Last-write-wins (updatedAt timestamp compared).
  Achievements:    Server-authoritative (client cannot self-award).
SECTION 24 — TESTING STRATEGY
24.1 Test Pyramid
text

                    ┌───────────────────┐
                    │    E2E Tests      │  ~20 tests
                    │ (Detox / Cypress) │  Full user flows
                    └─────────┬─────────┘  Run: pre-deploy
                              │
               ┌──────────────┴──────────────┐
               │    Integration Tests         │  ~200 tests
               │    (supertest / pytest)      │  API + DB layer
               └──────────────┬──────────────┘  Run: every PR
                              │
        ┌─────────────────────┴─────────────────────┐
        │              Unit Tests                    │  ~2000 tests
        │     (Jest / Vitest / pytest-unit)          │  Pure functions
        └────────────────────────────────────────────┘  Run: always
24.2 Coverage Requirements
text

┌─────────────────────────────────────────────────────────────────┐
│                   COVERAGE REQUIREMENTS                         │
├──────────────────────────────┬──────────────────────────────────┤
│ MODULE                       │ MINIMUM COVERAGE                 │
├──────────────────────────────┼──────────────────────────────────┤
│ ASR validation engine        │ 95% line coverage                │
│ Auth service (tokens)        │ 95% line coverage                │
│ Progress calculation         │ 90% line coverage                │
│ COPPA consent flow           │ 100% branch coverage             │
│ Offline sync manager         │ 90% line coverage                │
│ All other services           │ 80% line coverage                │
│ UI components                │ 70% line coverage                │
└──────────────────────────────┴──────────────────────────────────┘
24.3 Critical Test Cases (Must Exist)
text

ASR VALIDATION:
  ✅ Exact match → pass
  ✅ Minor mispronunciation → retry (not fail)
  ✅ Completely wrong word → fail
  ✅ Accent variation → phonetic match → pass
  ✅ Empty audio → handled gracefully (no crash)
  ✅ Audio in wrong language → graceful degradation
  ✅ Max attempts reached → coach triggered
  ✅ Processing > 1500ms → timeout response
  ✅ All 5 launch languages produce valid results

AUTH:
  ✅ Expired access token → 401 returned
  ✅ Refresh token rotation works
  ✅ Revoked refresh token → 401 returned
  ✅ COPPA: user under 13 cannot access without consent
  ✅ Account lockout after 5 failed logins

OFFLINE:
  ✅ Complete session recorded offline
  ✅ Session syncs on reconnect
  ✅ Duplicate sync does not double-count
  ✅ Conflict: server wins on player state

PROGRESS:
  ✅ Reading grade level updates after session
  ✅ Streak increments on daily session
  ✅ XP awarded correctly per gate type
  ✅ Achievement earned on correct trigger

CLASSROOM:
  ✅ Teacher cannot see students not in their class
  ✅ Parent cannot see other users' children
  ✅ Join code expires after 30 days (configurable)
SECTION 25 — PERFORMANCE BUDGETS & SLAs
25.1 Service Level Objectives (SLOs)
text

┌────────────────────────────────────────────────────────────────────┐
│                SERVICE LEVEL OBJECTIVES (SLOs)                     │
├──────────────────────────┬─────────────────────────────────────────┤
│ METRIC                   │ TARGET                                  │
├──────────────────────────┼─────────────────────────────────────────┤
│ API Availability         │ 99.9% monthly (≤ 43 min downtime/month) │
│ ASR Service Availability │ 99.5% monthly                          │
│ API P50 Latency          │ ≤ 100ms (non-ASR endpoints)            │
│ API P95 Latency          │ ≤ 200ms (non-ASR endpoints)            │
│ API P99 Latency          │ ≤ 500ms (non-ASR endpoints)            │
│ ASR P50 Latency          │ ≤ 800ms                                │
│ ASR P95 Latency          │ ≤ 1500ms                               │
│ ASR P99 Latency          │ ≤ 3000ms                               │
│ App Cold Start (Android) │ ≤ 3s (mid-range device)               │
│ App Cold Start (iOS)     │ ≤ 2s                                   │
│ Game Frame Rate          │ ≥ 60fps (Unity 2D on target devices)   │
│ Offline ASR P95          │ ≤ 3000ms (Whisper small, CPU)          │
│ Sync After Reconnect     │ ≤ 60s (first sync attempt)             │
│ Error Rate (5xx)         │ ≤ 0.1% of requests                     │
└──────────────────────────┴─────────────────────────────────────────┘
25.2 App Size Budget
text

MOBILE APP SIZE BUDGETS:
  Initial install size:        ≤ 75MB (iOS), ≤ 80MB (Android)
  After language model download: ≤ 225MB (1 language model)
  Game world 1 assets:         ≤ 50MB (streamed, not all pre-cached)
  Total expected size (1 lang): ~275MB

STRATEGIES TO HIT BUDGET:
  • Unity: strip unused engine modules
  • Unity: use AssetBundle streaming (not all assets in main build)
  • Whisper: use "small" model (150MB) not "large" (3GB) for on-device
  • React Native: enable Hermes JS engine
  • Images: WebP format, CDN-resized per screen density
SECTION 26 — ERROR HANDLING & RESILIENCE
26.1 Resilience Patterns
text

CIRCUIT BREAKER (Kong + application level):
  Pattern: If a downstream service fails 10% of requests in 30s window,
           open the circuit for 30s (return cached/fallback response).
  Applied to: ASR calls, AI Tutor calls, external APIs (Stripe, Clever)

  ASR circuit breaker fallback:
    → Fall back to on-device Whisper.cpp
    → If on-device unavailable: present "Try Again Later" UI
    → DO NOT block gameplay entirely (degrade gracefully)

RETRY POLICY (client side, HTTP):
  Axios retry config:
    retries: 3
    retryDelay: exponential (100ms → 200ms → 400ms)
    retryOn: [503, 504, network errors]
    NOT retried: 400, 401, 403, 404, 422

TIMEOUT MATRIX:
  Standard API calls: 15 seconds
  ASR validation:     30 seconds (longer audio upload)
  AI Tutor response:  10 seconds (GPT-4o should respond in < 3s)
  Stripe API:         30 seconds

GRACEFUL DEGRADATION RULES:
  If ASR service DOWN:       → Use on-device Whisper.cpp
  If AI Tutor DOWN:          → Show static coaching hints per word
  If Content CDN slow:       → Show cached content (stale-while-revalidate)
  If Analytics DOWN:         → Buffer events locally, retry on recovery
  If Billing DOWN:           → Show cached entitlement (fail-open for users)
  If Push Notifications DOWN:→ Silent failure (non-critical)
26.2 Error Response Catalog
TypeScript

// Error codes and their meanings — used by ALL services

const ERROR_CATALOG = {
  // AUTH
  'AUTH_001': 'Invalid credentials',
  'AUTH_002': 'Account locked — too many failed attempts',
  'AUTH_003': 'Email not verified',
  'AUTH_004': 'Parental consent required',
  'AUTH_005': 'Token expired',
  'AUTH_006': 'Token invalid',
  'AUTH_007': 'Insufficient permissions',

  // VALIDATION
  'VAL_001': 'Request body validation failed',
  'VAL_002': 'Unsupported language code',
  'VAL_003': 'Audio file too large (max 10MB)',
  'VAL_004': 'Audio format not supported',
  'VAL_005': 'Audio duration too long (max 60s)',
  'VAL_006': 'No speech detected in audio',

  // ASR
  'ASR_001': 'ASR service unavailable — falling back to offline',
  'ASR_002': 'Transcription confidence too low — retry',
  'ASR_003': 'Language model not loaded',

  // PROGRESS
  'PRG_001': 'Session already recorded for this gate today',
  'PRG_002': 'User not found',

  // CLASSROOM
  'CLS_001': 'Invalid join code',
  'CLS_002': 'Classroom full (max 35 students)',
  'CLS_003': 'Not authorized to view this classroom',
  'CLS_004': 'Student already in classroom',

  // BILLING
  'BIL_001': 'Payment failed',
  'BIL_002': 'Subscription not active',
  'BIL_003': 'Feature not available on current plan',

  // SYSTEM
  'SYS_001': 'Internal server error',
  'SYS_002': 'Service temporarily unavailable',
  'SYS_003': 'Rate limit exceeded',
} as const;
SECTION 27 — DATA FLOW DIAGRAMS
27.1 Core Reading Session Data Flow
text

COMPLETE DATA FLOW: Learner reads aloud → Progress updated

LEARNER DEVICE                REACT NATIVE APP              BACKEND SERVICES
─────────────                 ────────────────              ────────────────
                              
User approaches gate          Unity → RN Bridge
in game world        ──────► GATE_TRIGGERED event
                              │
                              ▼
                         Fetch gate content
                         GET /api/v1/content/:contentId ──────────────► content-svc
                                                                              │
                                                         ◄─── ContentItem ──┘
                              │
                              ▼
                         Display text overlay
                         Start countdown timer
                              │
Learner reads aloud  ──────► startRecording()
                              │
                              ▼ (AudioRecorder captures WAV 16kHz)
                              │
Learner stops / time ──────► stopRecording()
limit reached                 │
                              ▼
                         isOffline?
                         │         │
                         YES       NO
                         │         │
                         ▼         ▼
                    Whisper.cpp   POST /api/v1/asr/validate
                    (on-device)   (multipart: audio + metadata)
                         │              │
                         │              ▼
                         │         asr-svc:
                         │           1. Pre-process audio
                         │           2. Whisper large-v3 transcribe
                         │           3. Validate vs target text
                         │           4. Score + route outcome
                         │              │
                    Local validate  ◄───┘
                    (same logic)
                         │
                         └─────────┐
                                   ▼
                              ASRValidationResponse
                              { outcome, score, transcript,
                                phonemeBreakdown, coaching }
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                   PASS          RETRY         COACH
                    │              │              │
                    ▼              ▼              ▼
               Send to Unity  Send to Unity  Show Lex UI
               GATE_OPEN      RETRY_FEEDBACK  + POST to
               animation      animation       ai-tutor-svc
                    │                              │
                    └──────────────────────────────┘
                                   │
                                   ▼
                         POST /api/v1/progress/sessions
                         (or buffer to offline queue)
                                   │
                                   ▼
                              progress-svc:
                              1. Insert reading_sessions record
                              2. Update learner_profiles
                                 (words_read, accuracy, grade level)
                              3. Recalculate daily_stats
                              4. Check achievement triggers
                              5. Publish Kafka events:
                                 • litplay.learning.session.completed
                                 • litplay.learning.achievement.earned (if triggered)
                                   │
                    ┌──────────────┴─────────────────────┐
                    │                                     │
               analytics-svc                    notification-svc
               (consume event,              (consume event, check if
               insert ClickHouse)            streak milestone → push)

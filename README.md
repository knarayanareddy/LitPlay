# LitPlay — Literacy-First Educational Gaming Platform

> **Mission:** Make K-8 oral reading practice intrinsically motivating. Children read aloud to progress through Unity game worlds; ASR-powered reading gates validate fluency and unlock the next scene.

[![CI](https://github.com/knarayanareddy/LitPlay/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-132%20passing-brightgreen)](#testing)
[![COPPA](https://img.shields.io/badge/COPPA-compliant%20day%201-blue)](#coppa--privacy)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)](#)

Monorepo implementation of the [LitPlay Master System Design Document v2.0](litplaymasterdoc.md) (SSOT). Every section reference (§) below maps to the SSOT. The services now support PostgreSQL-backed runtime repositories when `DATABASE_URL` is set, with in-memory repositories retained for isolated tests/local prototypes.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Repository Structure](#repository-structure)
3. [Quick Start](#quick-start)
4. [Services](#services)
5. [The ASR Scoring Engine](#the-asr-scoring-engine)
6. [Offline-First Architecture](#offline-first-architecture)
7. [COPPA & Privacy](#coppa--privacy)
8. [Security](#security)
9. [Testing](#testing)
10. [Infrastructure & Deployment](#infrastructure--deployment)
11. [Roadmap Compliance](#roadmap-compliance)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  CLIENT LAYER                        │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │  React Native    │  │   Unity Game Client      │ │
│  │  (bare, RN 0.74) │◄─►│   (2022 LTS, URP)       │ │
│  │  Auth · Sync ·   │  │   Game worlds · Gates ·  │ │
│  │  Dashboards ·    │  │   Animation · Audio      │ │
│  │  ASR orchestr.   │  │   (react-native-unity)   │ │
│  └────────┬─────────┘  └──────────────────────────┘ │
└───────────┼─────────────────────────────────────────┘
            │ HTTPS / WSS
┌───────────▼─────────────────────────────────────────┐
│          API GATEWAY (AWS API Gateway + WAF)          │
└──┬───────┬───────┬───────┬───────┬──────────────────┘
   │       │       │       │       │
┌──▼──┐ ┌─▼───┐ ┌─▼───┐ ┌─▼───┐ ┌─▼────────┐
│Auth │ │Prog │ │Cont │ │Clss │ │  ASR      │
│Node │ │Node │ │Node │ │Node │ │  Python   │
└──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └───────────┘
   └────────┴───┬──┴───────┘
         ┌─────▼─────┐
         │ Kafka(MSK)│ ──► Analytics · Notifications · ClickHouse
         └───────────┘
```

### Service Inventory (§5.1)

| Service | Runtime | Port | Database | Responsibilities |
|---------|---------|------|----------|-----------------|
| auth-service | Node 20 / TS | 3001 | PostgreSQL `auth_db` | JWT, OAuth, COPPA consent, token rotation |
| progress-service | Node 20 / TS | 3002 | PostgreSQL `progress_db` + Redis | Sessions, gate attempts, WPM trends, offline sync |
| content-service | Node 20 / TS | 3003 | PostgreSQL `content_db` | Catalog, signed URLs, assignments |
| classroom-service | Node 20 / TS | 3004 | PostgreSQL `classroom_db` | Classrooms, join codes, goals |
| notification-service | Node 20 / TS | 3005 | PostgreSQL `notification_db` | Push (FCM/APNs), email digests |
| asr-service | Python 3.11 | 8080 | None (stateless) | Whisper GPU / Azure / scoring |

---

## Repository Structure

```
litplay/
├── packages/
│   ├── contracts/          # Shared SSOT: domain types, API schemas, events, bridge
│   │   ├── src/
│   │   │   ├── domain.ts   # §6 Domain Model
│   │   │   ├── api.ts      # §11 REST API contracts
│   │   │   ├── events.ts   # §15 Kafka events + envelope
│   │   │   ├── bridge.ts   # §9 RN↔Unity bridge types
│   │   │   └── schemas.ts  # Zod validation schemas + scoring thresholds
│   │   └── dist/           # Compiled output
│   ├── server-kit/         # Shared Fastify/JWT/eventbus utilities
│   └── db/                 # Flyway SQL migrations per service (§14)
│       ├── auth/
│       ├── progress/
│       ├── content/
│       ├── classroom/
│       └── notification/
│
├── services/
│   ├── auth-service/       # §10.2 — Auth, COPPA, JWT rotation
│   ├── progress-service/   # §10.3 — Sessions, fluency, offline sync
│   ├── content-service/    # §10.4 — Catalog, assignments, signed URLs
│   ├── classroom-service/  # §10.6 — Classrooms, join codes, goals
│   ├── notification-service/ # §10.8 — Push/email dispatch
│   └── asr-service/        # §10.5 — ASR pipeline (Python/FastAPI)
│
├── mobile/                 # §7 React Native client (bare workflow)
│   └── src/
│       ├── stores/         # Zustand (§7.3)
│       ├── services/       # MMKV, API, analytics
│       ├── offline/        # Sync queue (§13.2)
│       ├── unity/          # Bridge client (§9)
│       ├── hooks/          # useASR (§12)
│       └── i18n/           # Translations (§22)
│
├── tools/
│   └── seed.ts             # MVP content seed (§30.1)
│
├── .github/workflows/
│   └── ci.yml              # §26 CI/CD pipeline
├── docker-compose.yml      # §25.2 Local dev environment
├── Dockerfile.node         # Node.js service image
├── Dockerfile.asr          # ASR service image
└── tsconfig.base.json      # Shared TS config
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- Docker & Docker Compose (optional, for full stack)

### Option 1: Run Services Locally

```bash
# Install dependencies
npm install

# Build shared packages (required before services)
npx tsc -p packages/contracts/tsconfig.json
npx tsc -p packages/server-kit/tsconfig.json

# Run a service (terminal per service)
npm run dev:auth
npm run dev:progress
npm run dev:content
npm run dev:classroom
npm run dev:notification
```

### Option 2: Full Stack with Docker Compose

```bash
docker compose up
```

This starts all 6 services + 5 PostgreSQL databases + Redis + Kafka.

### Run Tests

```bash
# All Node.js service tests
npx jest --config services/auth-service/jest.config.cjs
npx jest --config services/progress-service/jest.config.cjs
npx jest --config services/content-service/jest.config.cjs
npx jest --config services/classroom-service/jest.config.cjs
npx jest --config services/notification-service/jest.config.cjs

# ASR service tests
cd services/asr-service && pip install -e '.[dev]' && python -m pytest tests/ -v
```

---

## Services

### auth-service (§10.2, §16, §17)

**Key Features:**
- Email/password + Google OAuth 2.0 registration
- JWT access tokens (15m TTL, **memory-only** per §16.3)
- Refresh tokens (30d TTL, **single-use rotation** in MMKV)
- **Token reuse detection** — reusing a rotated token revokes the entire family (§16.3 rule 5)
- COPPA consent flow — under-13 accounts blocked until parent verifies
- Account deletion → soft-delete + Kafka event → 72h data purge

**COPPA Flow (§17.1):**
```
Student registers (age < 13)
  → requiresParentalConsent = true
  → Consent record created (status: pending)
  → auth.user.created event → notification-service emails parent
  → Login BLOCKED until consent.verified
  → Parent clicks email link → consent.verified
  → Student can now log in and play
```

### progress-service (§10.3, §13)

**Key Features:**
- Session lifecycle (active → completed/abandoned)
- Gate-attempt recording (audio metadata only — **never audio**, §FR-017)
- Server-side WPM computation (authoritative; client estimates are display-only, §13.3)
- **Offline batch-sync** — sessions queued client-side, flushed in batches of 20 on reconnect
- Append-only design — no write conflicts across devices (§13.3)

### asr-service (§10.5, §12)

The core IP. See [The ASR Scoring Engine](#the-asr-scoring-engine).

### content-service (§10.4, §18)

**Key Features:**
- World → Scene → Gate hierarchy (§18.1)
- CloudFront signed URLs (24h TTL, §18.2)
- SHA-256 bundle integrity verification
- Lexile-by-grade mapping (§18.3)
- Teacher content assignments → Kafka event → push notification

### classroom-service (§10.6, §19)

**Key Features:**
- Classroom CRUD with auto-generated 6-char join codes
- Student self-join via code
- Per-student fluency goals (FR-044)
- Weekly digest (Sundays 8am local, §21.1)

### notification-service (§10.8, §21)

**Key Features:**
- Kafka consumer → dispatches push/email
- Quiet hours enforcement (7am–8pm local for students, §21.2 rule 2)
- Explicit opt-in requirement for push (§21.2 rule 1)
- Streak reminder suppression during school holidays

---

## The ASR Scoring Engine

The scoring engine determines whether a child's reading attempt unlocks the next scene. This is the highest-stakes logic in the system — **95% test coverage required** (§29.2).

### Scoring Formula (§12.3)

```
final_score = fuzzy_match × 0.70 + phonetic_match × 0.30
```

| Component | Weight | Method |
|-----------|--------|--------|
| Fuzzy string match | 70% | RapidFuzz `token_sort_ratio` (handles word reorder) |
| Phonetic match | 30% | Double Metaphone (catches pronunciation-correct / spelling-different) |

### Difficulty-Aware Thresholds (§12.3)

| Difficulty | PASS | PARTIAL |
|------------|------|---------|
| Easy | ≥ 75 | 55–74 |
| Medium | ≥ 82 | 62–81 |
| Hard | ≥ 88 | 70–87 |

Below PARTIAL threshold → FAIL.

### Provider Routing (FR-013)

```
Online → Whisper large-v3 (GPU)
  └─ latency > 1800ms or error → Azure Speech-to-Text (fallback)
Offline → whisper.cpp (quantized q4_0, ~75MB, on-device)
```

**Raw audio is NEVER stored** (FR-017, inviolable rule). Only metadata (duration, noise floor, VAD result) and the transcript are persisted.

### Test Scenarios

The scoring engine is tested against realistic child-reading scenarios:
- ✅ Fluent reader (identical transcript) → PASS
- ✅ Pronunciation variant ("elefant" vs "elephant") → boosted by phonetic component
- ✅ Struggling reader on Hard difficulty → FAIL
- ✅ Completely silent attempt → FAIL
- ✅ Word reordering → partially penalized (correct: out-of-order reading shouldn't pass perfectly)

---

## Offline-First Architecture

### Storage Split (§13.1)

| Layer | Library | Stores |
|-------|---------|--------|
| **MMKV** (encrypted KV) | react-native-mmkv | Auth tokens, calibration, last-sync timestamps, feature flags, small UI state |
| **SQLite** (queryable) | op-sqlite | Sync queue, session records, gate attempts, content manifests, assignment cache |

**Rule:** Query it (filter/sort/count) → SQLite. Look it up by key → MMKV.

### Sync Queue (§13.2)

```
Device offline → session played → queued in SQLite `sync_queue` table
Device reconnects → flushQueue() → POST /progress/sessions/batch-sync (batch of 20)
  ├─ 2xx → remove synced rows from SQLite
  ├─ per-item failures → mark row as `dead` for manual review
  ├─ 4xx batch error → move batch rows to dead queue
  └─ 5xx/network → keep rows pending, increment retry count, exponential backoff (5s base, 5m max)
Items older than 30 days → purged with warning log
```

### Offline Capability Map (§13.4)

| Feature | Offline |
|---------|---------|
| Core game + reading gates | ✅ |
| ASR validation | ✅ (whisper.cpp) |
| Progress recording | ✅ |
| Content browsing | ✅ (cached assignments) |
| Classroom/teacher dashboards | ❌ |
| Account management | ❌ |

---

## COPPA & Privacy

### Inviolable Rules (§32)
1. **Audio is NEVER stored** (FR-017)
2. **COPPA consent is REQUIRED** before any data collection for under-13 users (§17)
3. **Access tokens are NEVER persisted to disk** (§16.3)

### Data Minimization (§17.2)

| Data | Collected | Retention |
|------|-----------|-----------|
| Raw audio | ❌ Never | N/A |
| Transcripts | ✅ | 2 years |
| Gate scores | ✅ | 5 years |
| Device identifiers | ✅ Minimal (FCM token) | Account lifetime |
| Location / Biometrics | ❌ Never | N/A |

### Right to Erasure (§17.3)
```
DELETE /auth/me
  → Soft-delete user immediately
  → Publish litplay.auth.user.deleted
  → All services purge related data within 72 hours
  → ClickHouse analytics anonymized (not deleted)
  → Deletion confirmation email sent
```

---

## Security (§27)

| Control | Implementation |
|---------|---------------|
| Token storage | Access: memory-only. Refresh: MMKV encrypted |
| Token rotation | Single-use; reuse → family revocation |
| Rate limiting | 100 req/min (unauth), 1000 req/min (auth) |
| Input validation | Zod (Node), Pydantic (Python) on all endpoints |
| SQL injection | ORM-only (Prisma/SQLAlchemy); no raw SQL |
| CORS | Whitelist only (`app.litplay.app`, `admin.litplay.app`) |
| Certificate pinning | Enabled on ASR + auth endpoints |
| TLS | 1.2 minimum, 1.3 preferred |
| Dependency audit | Snyk + Trivy in CI |

---

## Testing (§29)

### Test Pyramid

```
       ┌─────────┐
       │   E2E   │  Detox (mobile), Playwright (web) — 30 critical journeys
       └─────────┘
     ┌─────────────┐
     │ Integration │  Supertest, Testcontainers — all endpoints + Kafka flows
     └─────────────┘
   ┌─────────────────┐
   │  Unit / Comp    │  Jest (Node/RN), pytest (Python) — business logic
   └─────────────────┘
```

### Current Test Count

| Service | Tests | Coverage Focus |
|---------|-------|----------------|
| asr-service | 58 | Scoring (95%), API, provider routing, auth enforcement |
| analytics-service | 5 | Event ingestion, ClickHouse row mapping |
| server-kit | 2 | Fastify 5 startup smoke, rate-limit registration |
| auth-service | 31 | COPPA (95%), token rotation, REST routes |
| progress-service | 11 | Offline sync (90%), fluency |
| content-service | 8 | Catalog, assignments |
| classroom-service | 7 | Join codes, goals |
| notification-service | 10 | Event dispatch, quiet hours |
| **Total** | **132** | |

### Key E2E Scenarios (§29.3)
1. New student registers → parent consents → student plays gate → progress recorded
2. Student plays offline → reconnects → progress syncs correctly
3. ASR returns FAIL 3 times → gate exhausted flow
4. Teacher creates classroom → assigns content → views progress
5. Parent deletes child account → all data purged within 72h
6. App backgrounded mid-session → resumed → data integrity preserved

---

## Infrastructure & Deployment (§25)

### AWS Architecture

| Component | Service |
|-----------|---------|
| Compute (Node) | ECS Fargate |
| Compute (ASR GPU) | EC2 g4dn.xlarge (NVIDIA T4) |
| Database | RDS PostgreSQL 16 (Multi-AZ) |
| Cache | ElastiCache Redis 7 |
| Message Bus | MSK (Managed Kafka) |
| Storage/CDN | S3 + CloudFront |
| API Gateway | API Gateway v2 + WAF |
| Secrets | AWS Secrets Manager |
| IaC | Terraform baseline: VPC, RDS per service, ECS/Fargate, ASR GPU ASG, MSK, Redis, ClickHouse/EFS, S3/CloudFront, ALB, WAF |

### Environments (§25.2)

| Env | Deploy Trigger | Data |
|-----|---------------|------|
| `local` | Manual | Seeded fixtures |
| `dev` | PR merge to `dev` | Anonymized snapshots |
| `staging` | Merge to `main` | Anonymized prod clone |
| `production` | Manual promote | Real data |

### CI/CD Pipeline (§26)
```
PR → Lint → Typecheck → Unit tests → Security scan → Build images
Merge dev → Integration tests → Deploy to dev → Smoke tests
Merge main → Full test suite → Deploy staging → Full E2E
Production → Canary 5% (30m) → Monitor error rate + ASR p95 → Full deploy
```

---

## Roadmap Compliance

### MVP (§30.1) — ✅ Implemented

| Feature | Status |
|---------|--------|
| User registration + COPPA consent | ✅ auth-service |
| Single Unity world (Grade 2, ≥5 scenes, ≥10 gates) | ✅ seed.ts |
| ASR gate mechanic (online) | ✅ asr-service |
| Progress recording | ✅ progress-service |
| Offline gameplay + sync | ✅ sync-queue + batch-sync |
| Teacher classroom (basic) | ✅ classroom-service |
| Parental progress view | ✅ progress-service fluency API |
| Speech calibration | ✅ asr-service /calibrate |
| Content download (WiFi) | ✅ content-service signed URLs |
| Feature flags | ✅ client store scaffold |

---

## API Documentation

Interactive docs available at runtime:
- Auth: `http://localhost:3001/docs`
- Progress: `http://localhost:3002/docs` (when enabled)
- ASR: `http://localhost:8080/docs`

All endpoints follow the contract in `packages/contracts/src/api.ts` (§11).

---

## License

Proprietary. © LitPlay.

---

*Built per the [LitPlay Master System Design Document v2.0](litplaymasterdoc.md). To propose changes, file an RFC per §32.*

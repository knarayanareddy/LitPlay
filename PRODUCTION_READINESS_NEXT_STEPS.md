# LitPlay Production Readiness — Remaining Operator Tasks

**Date:** 2026-06-14  
**Scope:** Follow-up after hardening pass against the remaining production gaps.

This document separates what has been implemented in-repo from what still requires external credentials, native build tooling, cloud access, or device validation.

---

## 1. What was fixed in the latest hardening pass

### 1.1 Offline gate-attempt idempotency
Implemented stable offline gate-attempt IDs.

- `CreateGateAttemptRequest.id?: string`
- Zod schema accepts optional `id`
- `ProgressService.recordGateAttempt()` uses client IDs when provided
- repositories expose `getGateAttempt()`
- duplicate gate-attempt IDs return the existing attempt instead of creating duplicates
- test updated to assert repeated offline sync does not duplicate gate attempts

### 1.2 Auth refresh/mobile foreground refresh
`POST /auth/refresh` now returns both tokens and user profile data:

```json
{
  "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 },
  "user": { "id": "...", "email": "...", "role": "student" }
}
```

Mobile foreground refresh can now restore Zustand auth state.

### 1.3 Parent scoping claims
Parent JWTs now embed `childIds` from the auth repository.

- `AuthRepository.listChildrenForParent(parentId)` added
- in-memory and Postgres implementations added
- `canAccessStudent()` checks `childIds`

### 1.4 ASR auth enforcement
ASR service now verifies JWT access tokens when `JWT_ACCESS_SECRET` is set or `ASR_AUTH_REQUIRED=true`.

Rules:

- missing/malformed token → `401`
- invalid/expired token → `401`
- role not `student` or `admin` → `403`
- student token subject must match request `studentId`

### 1.5 CI hardening
CI now includes:

- node lint step
- mobile typecheck/audit job
- analytics test job
- blocking root npm audit
- Docker image builds depend on `security-scan`

### 1.6 Service-level rate limiting
Rate limiting is enabled in runtime service factories and disabled only under `NODE_ENV=test`.

### 1.7 CloudFront URL signing
Content service now uses `@aws-sdk/cloudfront-signer` when signing keys are provided.

Required production env:

```bash
CLOUDFRONT_KEY_PAIR_ID=...
CLOUDFRONT_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
```

Missing signing keys in production now throws.

### 1.8 Classroom patch endpoint
Implemented:

```http
PATCH /api/v1/classrooms/:classroomId
```

Teacher-owner/admin scoped.

### 1.9 Notification push dispatch
Notification service now has real push dispatch plumbing:

- Android → FCM HTTP v1
- iOS → APNs HTTP/2 token auth
- opt-in and quiet hours enforced before assignment push
- device tokens read from DB
- delivery intent persisted as sent/failed

### 1.10 Analytics Kafka consumer
Analytics service now starts an `aiokafka` consumer when `KAFKA_BROKERS` is set and consumes:

- `litplay.progress.gate_attempt.recorded`
- `litplay.progress.session.completed`

### 1.11 RN ↔ Unity ACK deadlock
Fixed ACK correlation mismatch.

RN now accepts ACK IDs from either:

- top-level `msg.requestId`
- legacy payload `{ requestId }`

Unity now sends ACK IDs in both locations.

### 1.12 Unity native bridge stub
`LitPlayBridge.cs` no longer silently drops messages on device builds. It attempts to resolve `UnityMessageManager.SendMessageToRN(json)` by reflection and logs explicit errors if the native bridge package is missing.

### 1.13 ASR calibration event-loop blocking
CPU-heavy calibration RMS calculation now runs through FastAPI's threadpool helper.

### 1.14 Azure fallback
`AzureProvider.transcribe()` now calls Azure Speech REST API when credentials are configured.

Required env:

```bash
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_LANGUAGE=en-US
```

---

## 2. Latest validation results

Commands run locally:

```bash
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npm run typecheck --prefix mobile
npm audit --audit-level=high
npm audit --prefix mobile --audit-level=moderate
pytest services/asr-service/tests services/analytics-service/tests -q
```

Results:

- Node tests: **67 passed**
- Python tests: **63 passed**
- Total automated tests: **132 passed**
- Root npm audit: **0 vulnerabilities**
- Mobile npm audit: **0 vulnerabilities**
- Root lint/typecheck/build: passing
- Mobile typecheck: passing

---

## 3. What you still need to do before production

The remaining items require credentials, Docker/native build tooling, AWS account access, or physical/simulator device validation.

---

## 4. Native mobile / Unity tasks

### 4.1 Install and validate `react-native-unity-view`

The Unity bridge now calls the native Unity message manager, but this must be validated in a real RN + Unity mobile build.

You need to:

1. Add/import the actual `react-native-unity-view` package and native setup.
2. Export the Unity project into the RN iOS/Android native projects.
3. Verify `UnityMessageManager.SendMessageToRN(json)` exists at runtime.
4. Verify RN can call `LitPlayBridge.OnMessageFromRN(json)`.
5. Test on:
   - Android emulator
   - Android physical device
   - iOS simulator if supported by Unity export
   - iOS physical device

Acceptance test:

```txt
Unity starts → sends BRIDGE_READY → RN receives it → RN sends CONFIG_UPDATE → Unity ACKs → RN resolves ACK promise.
```

### 4.2 Implement native whisper.cpp JSI module

The JS hook now supports these native shapes:

```ts
global.LitPlayWhisperCpp.validate(input)
global.LitPlayWhisperCpp.transcribe(audioBase64)
```

You still need a real native implementation.

Recommended acceptance criteria:

- ships quantized q4_0 model with app or downloads it securely
- runs fully offline
- returns transcript within p95 ≤ 2500ms on target devices
- does not store raw audio
- releases native buffers after inference
- exposes deterministic error codes to JS
- has Android and iOS native tests

### 4.3 Real audio capture and VAD

Current app does not yet implement full microphone capture/VAD flow.

You need to integrate:

- mic permission request
- `react-native-audio-recorder-player` or equivalent
- VAD trimming
- calibration gain/noise-floor application
- WAV/OGG encoding to 16kHz mono
- raw audio memory cleanup after ASR response

---

## 5. Cloud / infrastructure tasks

### 5.1 Docker build validation

Docker is unavailable in the current sandbox, so you must run:

```bash
docker build -f Dockerfile.node --build-arg SERVICE_NAME=auth-service -t litplay/auth-service:test .
docker build -f Dockerfile.node --build-arg SERVICE_NAME=progress-service -t litplay/progress-service:test .
docker build -f Dockerfile.node --build-arg SERVICE_NAME=content-service -t litplay/content-service:test .
docker build -f Dockerfile.node --build-arg SERVICE_NAME=classroom-service -t litplay/classroom-service:test .
docker build -f Dockerfile.node --build-arg SERVICE_NAME=notification-service -t litplay/notification-service:test .
docker build -f Dockerfile.asr -t litplay/asr-service:test .
docker build -f Dockerfile.analytics -t litplay/analytics-service:test .
```

Then run:

```bash
docker compose up --build
```

Acceptance criteria:

- all containers start
- `/health` returns ok for each service
- API gateway routes to each service
- Node services connect to their Postgres DBs
- Kafka-backed event publishing works
- analytics consumes progress events

### 5.2 Terraform validation and environment-specific hardening

Terraform has been expanded from a skeleton into a production baseline covering:

- all five RDS databases
- ECS task definitions/services for Node services
- ECS EC2 GPU capacity provider for ASR
- Redis and MSK
- ClickHouse on ECS + EFS
- S3 + CloudFront key group/OAC
- ALB routing
- WAF managed rules in blocking mode

You still need to validate and adapt it in your AWS account:

```bash
cd infra/terraform
terraform init
terraform fmt
terraform validate
terraform plan -var='environment=staging' -var-file=staging.tfvars
```

Before production, review/add:

- ACM certificate and HTTPS listener for ALB/API Gateway
- API Gateway VPC Link/custom domain if API Gateway must front the ALB
- private service discovery DNS for ClickHouse (`clickhouse.local` placeholder)
- autoscaling policies per ECS service
- CloudWatch alarms and dashboards
- MSK authentication/encryption settings for your security policy
- backup windows, maintenance windows, and RDS parameter groups
- ASR GPU desired capacity/cost limits
- production ECR image URIs via `container_images` tfvars

### 5.3 Provision production secrets

Required minimum secrets/env:

```bash
JWT_ACCESS_SECRET=<32+ bytes>
JWT_REFRESH_SECRET=<32+ bytes>
GOOGLE_OAUTH_CLIENT_ID=...
DATABASE_URL=...
KAFKA_BROKERS=...
CLOUDFRONT_KEY_PAIR_ID=...
CLOUDFRONT_PRIVATE_KEY=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...
FCM_PROJECT_ID=...
FCM_ACCESS_TOKEN=...
APNS_TEAM_ID=...
APNS_KEY_ID=...
APNS_BUNDLE_ID=...
APNS_PRIVATE_KEY=...
```

Important: `FCM_ACCESS_TOKEN` is currently expected as an OAuth2 bearer token. For production, implement service-account JWT exchange/refresh or inject a short-lived token through your runtime secret manager/sidecar.

---

## 6. Integration tests still needed

### 6.1 Postgres repository tests

The Postgres repositories are implemented but need real DB integration tests.

Recommended approach:

- Testcontainers if Docker is available
- or CI service containers for Postgres

Minimum test matrix:

- auth repo create/login/refresh/revoke/delete
- progress offline sync idempotency
- content world/scene/gate hydration
- classroom join-code/member/goal update
- notification device tokens/preferences/logging

### 6.2 Kafka integration tests

Test:

```txt
progress-service emits gate_attempt.recorded
analytics-service consumes it
ClickHouse/in-memory repo receives row
notification-service consumes assignment.created
push/email log is written
```

### 6.3 ASR provider integration tests

With credentials configured:

```bash
AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... pytest services/asr-service/tests -m azure
```

You should add marked tests that are skipped unless credentials are present.

### 6.4 Mobile E2E tests

Use Detox or equivalent.

Critical flows:

1. Register student → parent consent → login.
2. Unity bridge ready → gate triggered → ASR result → gate unlocks.
3. Offline gate → local whisper.cpp → progress queued → reconnect sync.
4. App backgrounds >30m → access token cleared → foreground refresh restores user.
5. Teacher creates classroom → student joins → teacher sees progress.

---

## 7. Production launch checklist

Do not launch with children’s data until every item below is done.

### Security

- [ ] JWT secrets 32+ bytes in Secrets Manager
- [ ] Google OAuth production client ID configured
- [ ] ASR auth required in production
- [ ] API Gateway or internal networking prevents direct public service access
- [ ] CloudFront signing keys configured
- [x] WAF managed rules configured in blocking mode (`override_action none`)
- [ ] Snyk/Trivy enabled with real tokens/policies
- [ ] Mobile certificate pinning implemented for auth + ASR

### Privacy/COPPA

- [ ] Parent email/contact captured for under-13 registration
- [ ] Verifiable parental consent mechanism reviewed by counsel
- [ ] Audio buffer lifecycle validated on device
- [ ] Data deletion propagation tested across services
- [ ] Analytics anonymization policy implemented for ClickHouse

### Reliability

- [ ] Docker images build and run
- [ ] ECS/infra deployed to staging
- [ ] DB migrations run in staging
- [ ] Kafka topics provisioned
- [ ] ASR GPU capacity validated
- [ ] Azure fallback tested
- [ ] Push provider credentials tested
- [ ] Alerting dashboards configured

### Mobile/Game

- [ ] Real RN navigation/screens implemented
- [ ] Unity native bridge validated on device
- [ ] whisper.cpp native module implemented
- [ ] microphone permissions/audio capture implemented
- [x] offline SQLite sync queue implemented
- [ ] SQLite session/content manifest screens wired into production UI flows
- [ ] content download verifies checksum
- [ ] app store signing/release pipeline configured

---

## 8. Current honest readiness rating

After the latest fixes:

- Backend services: **8 / 10**
- ASR service: **7 / 10** without real GPU/Azure credential validation; **8+ / 10** after provider staging tests
- Mobile/Unity: **4.5 / 10** due to native whisper.cpp/audio/screens/device validation still pending
- Infrastructure: **5 / 10** until Terraform/ECS/Docker staging are completed

Overall: **6.5 / 10** — significantly hardened, test-clean, and much closer, but still requires native mobile and cloud deployment validation before production launch.

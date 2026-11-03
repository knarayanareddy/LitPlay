# LitPlay remediation plan

## 1) Phased roadmap with entry and exit criteria
This plan corrects the sampled evidence gaps without claiming live exploit proof, device progress, or legal compliance. It maps all five review disciplines to explicit owners and ends with an independent acceptance phase.

| Phase | Primary owners | Disciplines | Entry criteria | Exit criteria |
|---|---|---|---|---|
| P0. Historical baseline and scope lock | repo owner + DevOps owner | automation, operations | Current draft findings accepted as the working baseline; access to historical run metadata and candidate CI runs | Historical failing SHA and corrected candidate SHA are recorded separately; skipped checks are identified; no one is treating the pinned SHA as green |
| P1. Reading-gate boundary trace | Unity owner + mobile owner + backend owner | correctness, UI/UX | P0 complete; owner-approved access to bridge files and scene assets | The actual `TriggerGate` → bridge → RN → ASR → result → scene progression call path is documented with observed files/assets and runtime unknowns clearly labeled |
| P2. Gate-correctness repair | Unity owner + mobile owner + ASR owner | correctness, automation, security | P1 complete; owners agree which component is authoritative for attempts/gate identity | Offline unavailable-provider path fails closed; attempt counts propagate correctly; stale/wrong-gate results are rejected; regression and mutation controls exist |
| P3. Privacy, dependency-integrity, and copy boundary | privacy/security owner + ASR owner + release owner | security, operations, UI/UX | P0 complete; owner-approved staging/provider/document access; synthetic data plan approved | Production transport/auth/provider/logging/retention unknowns are resolved or explicitly recorded; dependency/secret checks are classified as blocking vs optional; public copy is owner-approved and bounded |
| P4. Coverage, device, and recovery proof | QA owner + release owner + DevOps owner | automation, operations, accessibility | P2 and P3 complete; staging/device/signing access approved | ASR quality gates measure the intended scope; a release candidate is exercised on device; rollback/recovery evidence exists from observation, not assumption |
| P5. Independent acceptance | independent verifier not authoring the fixes | all five | P4 complete; all artifacts/results available | An independent reviewer can reproduce the acceptance evidence, and deliberate breakage makes the intended checks fail |

## 2) Role-owned tasks

### LP-T01 — Record the historical CI failure and define the real release baseline
- **Links:** L-01, L-04
- **Owners:** DevOps owner, repo owner
- **Prerequisites:** (1) access to historical GitHub Actions metadata, (2) access to create or inspect a corrected candidate run, (3) agreement that the pinned SHA is evidence, not a release target.
- **Observed paths:** `.github/workflows/ci.yml`; historical run `27501005290`; job `81283752555`.
- **Steps:**
  1. Capture the historical run facts exactly: run SHA `1a497bf...`, failed job `Mobile - Typecheck and Audit`, failed step `Typecheck mobile`, skipped `Mobile audit`, and the public annotation `Cannot find module '@litplay/contracts' or its corresponding type declarations.` with its run/job URL provenance.
  2. Recover fuller compiler output if repository/organization access permits; if raw logs remain unavailable, record that limitation while distinguishing it from the public annotation already observed.
  3. Select the first candidate commit that claims to fix the issue, and record its full SHA separately from the historical failing SHA.
  4. Require a full CI run on that candidate SHA and record which jobs/steps turned green, which remained skipped by policy, and which artifacts were produced.
- **Expected deliverable:** a baseline note that distinguishes historical failing evidence from the first candidate that actually clears the intended release gates.
- **Verification:** compare the two SHAs side by side; confirm the candidate run includes the previously blocked mobile path and downstream image-build path when policy requires them.
- **Definition of done:**
  - [ ] Historical failing SHA and corrected candidate SHA are both recorded.
  - [ ] The failed historical step is named exactly as observed.
  - [ ] Skipped checks are listed separately from successful checks.
  - [ ] No document claims the pinned SHA is both the failure and the fix.

### LP-T02 — Trace the real reading-gate bridge and scene progression path
- **Links:** L-02
- **Owners:** Unity owner, mobile owner, backend owner
- **Prerequisites:** (1) LP-T01 complete, (2) access to `mobile/src/unity/bridge.ts` and `mobile/unity/Assets/Scripts/Bridge/*`, (3) access to the relevant Unity scene assets/prefabs, (4) owner-approved device or simulator plan.
- **Observed paths:** `mobile/unity/Assets/Scripts/Controllers/GateController.cs`; `mobile/src/hooks/use-asr.ts`; `services/asr-service/asr_app/main.py`.
- **Proposed paths to inspect next:** `mobile/src/unity/bridge.ts`; `mobile/unity/Assets/Scripts/Bridge/BridgeManager.cs`; `mobile/unity/Assets/Scripts/Bridge/LitPlayBridge.cs`; scene assets/prefabs that attach the gate controller and sequencer.
- **Steps:**
  1. Build a file-cited call graph from `TriggerGate(...)` through bridge emission, RN receipt, ASR validation, result return, Unity receipt, and scene progression.
  2. Determine whether the inspected in-file `SceneSequencer` stub is the runtime class, a development placeholder, or dead code shadowing a different sequencer.
  3. Record the exact scene assets/components that own gate progression and the preconditions for a visible unlock/advance transition.
  4. Write a device/simulator smoke script that names the expected user-visible outcome for PASS, PARTIAL, FAIL, exhaustion, and unavailable-offline-provider cases.
- **Expected deliverable:** a boundary trace document with observed files/assets, unverified edges, and a user-visible smoke procedure.
- **Verification:** an observed gate-to-scene check on device or simulator must match the traced call graph; if a traced component is removed or replaced, the smoke procedure must fail or expose the divergence.
- **Definition of done:**
  - [ ] Every step from gate trigger to scene progression has an observed owner or an explicit unknown label.
  - [ ] The status of the `SceneSequencer` stub is resolved or explicitly left open with evidence.
  - [ ] The smoke procedure names the expected visible result for each gate outcome.
  - [ ] No documentation still presents the sampled path as fully proved end to end without caveats.

### LP-T03 — Repair fail-closed offline behavior, attempt propagation, and gate-ID validation
- **Links:** L-03
- **Owners:** mobile owner, Unity owner, ASR owner
- **Prerequisites:** (1) LP-T02 complete, (2) agreement on authoritative attempt state, (3) test harnesses or fixtures for RN/Unity/ASR contract validation.
- **Observed paths:** `mobile/src/hooks/use-asr.ts`; `mobile/unity/Assets/Scripts/Controllers/GateController.cs`; `services/asr-service/asr_app/main.py`.
- **Proposed paths:** contract tests around the gate-result payload and any shared bridge schema definitions under `packages/contracts`.
- **Steps:**
  1. Remove or strictly development-gate the `decodeBase64Utf8(audioBase64)` fallback so unavailable native offline ASR yields an explicit fail-closed outcome rather than scoring arbitrary bytes as transcript text.
  2. Propagate the real attempt number from the authoritative gate/session state into the RN request and verify the ASR service computes `retriesRemaining` from that value.
  3. Reject stale or mismatched `gateId` responses before calling `OnGatePassed(...)`, and enforce retry exhaustion against the authoritative max/current state instead of trusting only a returned counter.
  4. Add regression tests for: unavailable native provider, matching-text bytes input, repeated failures until exhaustion, and stale/wrong-gate PASS.
- **Expected deliverable:** corrected gate-result contract handling plus regression coverage for the four observed failure modes.
- **Verification:**
  - pre-fix regression: the broken behavior must be reproducible in a controlled test or fixture before the fix;
  - post-fix regression: the same test must pass only with the fix in place;
  - mutation control: if the gate-ID guard or fail-closed path is deliberately removed, the assertion that expects rejection must fail.
- **Definition of done:**
  - [ ] Offline unavailable-provider handling no longer treats bytes as transcript text.
  - [ ] Attempt number is not hard-coded to `1` in the production path.
  - [ ] A wrong-gate PASS is rejected by code and by test.
  - [ ] Retry exhaustion is verified with repeated failures.

### LP-T04 — Trace the child-audio/auth/transport/provider boundary and correct public wording
- **Links:** L-05
- **Owners:** privacy/security owner, ASR owner, release owner, legal/privacy copy owner
- **Prerequisites:** (1) LP-T01 complete, (2) owner-approved staging/provider access using synthetic data only, (3) access to deployment configuration and provider documentation/console records, (4) approval to review public copy and consent wording.
- **Observed paths:** `mobile/src/hooks/use-asr.ts`; `services/asr-service/asr_app/main.py`; `README.md`.
- **Proposed paths:** ASR provider configuration, deployment manifests, ingress/gateway configuration, privacy-policy/legal-copy source files, consent screens/templates, and logging/telemetry configuration.
- **Steps:**
  1. Trace the effective production ASR endpoint, transport/TLS termination, auth setting for each environment, and whether `auth_required` can ever be false outside development.
  2. Trace where child audio/transcripts can flow beyond the ASR service: provider egress, request logs, metrics, traces, retry queues, and deletion/retention controls.
  3. Review the exact public wording for COPPA/privacy and child-audio handling; replace any broad compliance/certification implication with a bounded statement of verified behavior and explicit owner approval.
  4. Record any remaining unknowns as blockers instead of filling gaps with policy assumptions.
- **Expected deliverable:** a signed-off boundary matrix covering transport, auth, provider egress, logging, retention/deletion, consent copy, and approved public wording.
- **Verification:** run a synthetic staging request through the intended path and confirm the observed auth/transport/provider behavior matches the matrix; review records must show who approved the final copy.
- **Definition of done:**
  - [ ] Production endpoint and transport path are observed or explicitly blocked as unknown.
  - [ ] Provider egress and retention/deletion claims are evidenced or explicitly unknown.
  - [ ] Public COPPA/privacy copy is reviewed by the responsible owner.
  - [ ] No doc equates a badge or README line with legal compliance proof.

### LP-T05 — Classify dependency-integrity and secret-handling checks as blocking or optional
- **Links:** L-01, L-05
- **Owners:** security owner, DevOps owner
- **Prerequisites:** (1) LP-T01 complete, (2) access to CI settings/secrets policy, (3) access to release requirements for mobile and services.
- **Observed paths:** `.github/workflows/ci.yml`; root and mobile lockfiles as release inputs.
- **Steps:**
  1. Define which checks are blocking for release in each lane: root npm audit, mobile audit, Snyk, Trivy, image builds, and any signing/integrity verification.
  2. Review how missing secrets such as `SNYK_TOKEN` change the effective gate, and document whether skipped Snyk is acceptable, conditional, or release-blocking.
  3. Confirm which lockfiles/manifests are authoritative for dependency integrity and how candidate artifacts tie back to those inputs.
  4. Add a release record section for secret prerequisites and skipped-scan justification so skipped does not masquerade as passed.
- **Expected deliverable:** a release-gate policy that distinguishes success, skip-by-policy, and skip-due-to-misconfiguration for dependency/security checks.
- **Verification:** intentionally run a candidate without the required secret or with a known-vulnerable dependency in a controlled environment and confirm the expected gate behavior matches policy.
- **Definition of done:**
  - [ ] Blocking vs optional dependency/security checks are explicit.
  - [ ] Secret prerequisites for those checks are documented.
  - [ ] Skipped scans cannot be misreported as green scans.
  - [ ] Release artifacts are traceable to authoritative lockfiles/manifests.

### LP-T06 — Measure ASR scoring coverage and prove the gate is behavioral, not just labeled
- **Links:** L-06
- **Owners:** ASR owner, test owner
- **Prerequisites:** (1) LP-T03 complete, (2) access to ASR test configuration, (3) agreement on which files/functions count as the ASR scoring scope.
- **Observed paths:** `.github/workflows/ci.yml`; `services/asr-service/pyproject.toml`; `README.md`.
- **Proposed paths:** ASR test config, coverage config, and scoring/provider tests under `services/asr-service/tests/`.
- **Steps:**
  1. Define the authoritative ASR scoring coverage scope and wire the CI gate so it measures that scope explicitly rather than relying on a descriptive step label.
  2. Add or tighten behavioral tests for classification thresholds, provider-unavailable fallback behavior, malformed base64, wrong-student auth rejection, and retry accounting.
  3. Add a negative control that deliberately drops coverage or removes a critical guard and confirm the selected gate fails without lowering the required threshold.
  4. Record the resulting measured coverage and the exact command/report that enforces it.
- **Expected deliverable:** an ASR quality gate with measured coverage output plus behavioral tests aligned to the highest-stakes scoring logic.
- **Verification:** the CI artifact/report must show numeric coverage for the agreed scope, and a deliberately under-covered or guard-removed change must fail the gate.
- **Definition of done:**
  - [ ] The enforcing command/report is identified.
  - [ ] Numeric coverage is measured for the intended ASR scope.
  - [ ] Behavioral tests cover the sampled high-stakes paths.
  - [ ] A deliberate under-covered or guard-removed change fails the gate.

### LP-T07 — Prove device behavior, release candidate integrity, and rollback/recovery readiness
- **Links:** L-01, L-02, L-03, L-05
- **Owners:** QA/device owner, release owner, DevOps owner
- **Prerequisites:** (1) LP-T02 through LP-T06 complete, (2) owner-approved device/signing/staging access, (3) synthetic data set prepared, (4) rollback target/environment defined.
- **Observed paths:** `.github/workflows/ci.yml` build dependency chain; sampled gate/ASR paths above.
- **Proposed paths:** release notes, signing workflow, staging deployment/rollback runbook, and any device smoke artifacts.
- **Steps:**
  1. Build a release candidate from the corrected candidate SHA and record the exact artifact identifiers, signing inputs, and dependency-integrity inputs.
  2. Execute an observed device smoke that covers: gate trigger, online validation PASS, repeated FAIL to exhaustion, unavailable native offline provider, and stale/wrong-gate result handling.
  3. Perform an observed staging rollback or restore drill with synthetic data only, record the trigger, steps, outcome, and residual risk.
  4. Publish a release-readiness record that names what was observed directly versus what remains deferred or unknown.
- **Expected deliverable:** a candidate release record with device evidence and rollback/recovery evidence tied to the candidate SHA.
- **Verification:** if the gate handler, provider availability path, or rollback steps are deliberately broken in a controlled rehearsal, the smoke or drill must fail visibly rather than passing on assumptions.
- **Definition of done:**
  - [ ] Candidate artifact identifiers and SHA are recorded.
  - [ ] Device smoke covers the four gate-result edge cases named above.
  - [ ] Rollback or restore is observed, not inferred.
  - [ ] Remaining unknowns are called out explicitly in the release record.

### LP-T08 — Independent acceptance and mutation-backed signoff
- **Links:** all findings and preventive requirements
- **Owners:** independent verifier, not the primary fixer
- **Prerequisites:** (1) LP-T01 through LP-T07 complete, (2) access to the candidate run artifacts and device/recovery records, (3) authority to reject incomplete evidence.
- **Observed/proposed paths:** all deliverables from prior tasks; final candidate CI run; release/readiness record.
- **Steps:**
  1. Re-check that the accepted candidate SHA is not the same SHA as the historical failing run.
  2. Re-run or re-observe the negative controls: unavailable offline provider, wrong-gate PASS, repeated failures to exhaustion, and the coverage/guard-removal mutation control.
  3. Reconcile public privacy/COPPA wording against the approved evidence matrix and confirm no claim exceeds the observed facts.
  4. Accept or reject the candidate with a written decision that lists any residual unknowns.
- **Expected deliverable:** an independent acceptance record or rejection record tied to the candidate SHA.
- **Verification:** acceptance is valid only if at least one deliberate breakage causes the intended test/gate to fail; a purely green snapshot without negative controls is insufficient.
- **Definition of done:**
  - [ ] Independent verifier reviewed the candidate SHA and artifacts.
  - [ ] Negative controls were rechecked, not trusted second-hand.
  - [ ] Public wording was reconciled to approved evidence.
  - [ ] Residual risks/unknowns are documented in the final decision.

## 3) Task dependency map
| Task | Depends on | Why |
|---|---|---|
| LP-T01 | — | Establishes the real baseline and separates historical failure from future fixes |
| LP-T02 | LP-T01 | Needs the accepted baseline and owner access plan before tracing runtime paths |
| LP-T03 | LP-T02 | Must know the real bridge/scene ownership before changing gate correctness logic |
| LP-T04 | LP-T01 | Privacy/copy tracing can start once baseline scope and access are set |
| LP-T05 | LP-T01 | CI/security gate policy depends on the real historical and candidate CI behavior |
| LP-T06 | LP-T03 | Coverage and behavioral gate work should reflect corrected scoring/gate logic |
| LP-T07 | LP-T02, LP-T03, LP-T04, LP-T05, LP-T06 | Device and recovery proof only matter after runtime path, security/copy, gate policy, and coverage are settled |
| LP-T08 | LP-T01, LP-T02, LP-T03, LP-T04, LP-T05, LP-T06, LP-T07 | Independent acceptance depends on all prior evidence |

## 4) Production acceptance checklist
- [ ] Historical failing SHA and corrected candidate SHA are distinct and both recorded.
- [ ] The mobile typecheck failure has an identified cause or an explicit log-unavailable limitation.
- [ ] The real gate bridge and runtime sequencer path are traced with observed files/assets.
- [ ] Offline unavailable-provider behavior fails closed.
- [ ] Attempt counts and gate-ID validation are enforced and mutation-tested.
- [ ] Blocking versus optional dependency/security scans are documented; skipped scans are not mislabeled as passes.
- [ ] The ASR scoring gate reports measured coverage for the intended scope.
- [ ] Device smoke evidence exists for PASS, repeated FAIL, exhaustion, unavailable offline provider, and wrong-gate response handling.
- [ ] Rollback/recovery has been observed with synthetic data only.
- [ ] Public privacy/COPPA wording is owner-approved and bounded to verified behavior.
- [ ] Independent acceptance has rechecked negative controls.

## 5) Changes requiring owner approval
- Any change to public COPPA/privacy or child-audio copy.
- Any production setting for `auth_required`, provider routing, retention/deletion, or logging.
- Any alteration to release-blocking CI/security policy.
- Any mobile signing, store submission, staging deployment, rollback, or restore drill.
- Any use of real child/user data; verification should use synthetic data unless separately approved.

## 6) Rollback and release policy
- Do not promote a candidate whose evidence still depends on the historically failing SHA.
- Do not release if skipped security/dependency scans are unexplained, if the gate bridge is still untraced, or if the offline unavailable-provider path is still ambiguous.
- If the candidate regresses gate correctness, auth, consent, or startup behavior during rehearsal, stop promotion and roll back to the last known acceptable candidate before further feature changes.
- Recovery claims require an observed drill. If the drill is deferred, label recovery readiness as unknown rather than adequate.

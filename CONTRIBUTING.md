# Contributing to LitPlay

LitPlay follows the SSOT in `litplaymasterdoc.md`. Any change that modifies architecture, privacy rules, API contracts, bridge contracts, data retention, or ASR scoring thresholds must update the SSOT and include an RFC-style explanation.

## Local checks

Run before submitting changes:

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npm run typecheck --prefix mobile
npm audit --audit-level=high
npm audit --prefix mobile --audit-level=moderate

python3 -m venv .venv-test
. .venv-test/bin/activate
pip install -e 'services/asr-service[dev]' -e 'services/analytics-service[dev]'
pytest services/asr-service/tests services/analytics-service/tests -q
rm -rf .venv-test
```

## Migrations

SQL migrations live under `packages/db/<service>`. Apply locally with:

```bash
npm run migrate
```

Set service database URLs in `.env` or the shell.

## Code rules

- Do not store raw audio.
- Do not persist access tokens.
- Use shared contracts from `@litplay/contracts`.
- Add route-level RBAC tests for new protected endpoints.
- Add repository integration tests for new SQL behavior.

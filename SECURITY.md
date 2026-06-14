# Security Policy

## Supported versions

LitPlay is pre-release. Security fixes are applied to the active `main` branch.

## Reporting a vulnerability

Please do not open a public issue for suspected vulnerabilities involving:

- child data or COPPA/privacy controls
- authentication/session handling
- ASR/audio handling
- infrastructure secrets
- mobile native bridge vulnerabilities

Report privately to the repository owner/security contact. Include:

1. affected component/service,
2. reproduction steps,
3. impact assessment,
4. suggested fix if known.

## Security invariants

The following are non-negotiable product rules:

- raw audio is never persisted,
- access tokens are memory-only on mobile,
- under-13 data collection requires verified parental consent,
- service secrets must come from a secret manager in production,
- production services must run with strong JWT secrets and ASR auth enabled.

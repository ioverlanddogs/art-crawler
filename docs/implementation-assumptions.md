# Implementation assumptions

This file lists all explicit defaults chosen where docs were placeholders or ambiguous.

1. Auth uses NextAuth Credentials provider with basic email lookup in MVP; password validation is TODO.
2. Invite acceptance page is read-only in MVP and does not finalize password setup.
3. Fetch worker performs minimal SSRF guard (scheme + localhost block) and deterministic sample HTML.
4. Extract worker prioritizes JSON-LD regex fast path and falls back to mockable AI provider abstraction.
5. Scoring model defaults to static logistic coefficients; training pipeline writes placeholder artifact.
6. Dedup pass 2 embedding is represented by deterministic cluster prefix from fingerprint.
7. Enrichment and maturity are stubbed with telemetry + safe skip/success statuses.
8. Deployment workflows are safe placeholders pending platform-specific secrets/commands.
9. Playwright/Pact are not fully wired; test placeholders assert contracts and env requirements.
10. All DB schemas are MVP-complete for vertical slice, not full production DDL parity.

# Garden Journal contributor instructions

## Scope and product

This is `gladys-garden-journal`, an external Gladys Assistant integration based on the official JavaScript template. Node 22+, ESM, no frontend build. Gladys ≥ 5.2 renders all UI from manifest forms and SDK widget content. Do not initialize Git, create a remote repository, publish images/releases or send messages without explicit user authorization.

## Architecture

- `index.js`: SDK bootstrap and shutdown only.
- `src/runtime.js`: lifecycle and capability registration.
- `src/journal.js`: plant IDs, mutations, care and history.
- `src/store.js`: validated versioned state, serialized atomic writes under `/data`, backups.
- `src/weather.js`: user-authenticated Gladys weather API, normalization, per-plant risk evaluation.
- `src/engine.js`: scheduled checks, deduplication and durable outbox.
- `src/devices.js`: virtual indicators; publish only to added Gladys features.
- `src/widgets.js`: native declarative content, no HTML or external image loading.
- `src/actions.js`: configuration/scene handlers; scene mutations suppress manual events.
- `gladys-assistant-integration.json`: forms, capability declarations, localization and transport.

## Rules

1. Plant UUIDs and external IDs never derive from names. Keep feature, widget, action, trigger and config keys stable. Renames must preserve history and scene references.
2. A reminder asks to check a plant, not automatically water it. Snoozing is not completed care. No invented species-specific thresholds or automatic botanical diagnosis.
3. Missing weather is unknown, never zero or proof of safety. Validate timestamps, units and freshness. Use the normalized Gladys API, not a hard-coded weather vendor.
4. Weather requires a separate user API key in a `secret` field until the host API supports scoped reads. Never reuse the integration JWT on user routes; never log credentials, raw weather bodies or complete config. No redirects or user-controlled host for authenticated weather calls.
5. State is owned by one process. Serialize every mutation, validate before persisting, retain a failed/corrupt journal. Never write production data outside `/data`. Stop the service for CLI import/export.
6. Scene actions must not echo their corresponding manual triggers. Persist reminder/risk deduplication. Delivery can be at least once across a crash; document this boundary.
7. Keep every user-facing manifest/widget/action message and both guides in French and English. Errors should identify the problem without secrets. Respect SDK content budgets.
8. Add user-visible changes to `CHANGELOG.md` under `[Unreleased]`. Versions, lockfile and Docker tag move together through the release workflow. Publication ownership is valentinhttr; image/releases and the store topic remain deferred until explicitly authorized.
9. Use read-only runtime, non-root container, minimal dependencies. Maintain the four workflows and Dependabot. Full remote store admission requires a published image and `STORE_PUBLISHED=true`; local manifest validation never skips.
10. Tests do not contact external services. Use fixtures and dependency injection. Do not claim real Gladys installation, Docker build or release success without running it.

## Validation

```bash
npm ci
npm run format:check
npm run lint
npm test
docker build -t gladys-garden-journal:local .
```

Keep the official schema fixture provenance in `test/fixtures/README.md`; when updating it, review SDK/core compatibility. Run meaningful tests for persistence, time boundaries, provider failure, input validation and event loops. The host application owns typography, layout, accessibility and dark mode; do not introduce a separate site merely to preview widgets.

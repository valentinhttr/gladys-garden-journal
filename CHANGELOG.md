# Changelog

All notable changes to Garden Journal are documented here. Unreleased describes the implementation before its first release.

## [Unreleased]

### Added

- First release for Gladys 5.2.0 or later, using the official SDK 0.15.
- Public AMD64 and ARM64 container images for developer-mode installation; store listing remains disabled.
- Native house selectors and widget forms for optional care observations and postponement duration.
- English botanical cover with an optimized 800 × 534 JPEG for the manifest.

- Local plant and batch inventory, locations, growth phases, quantities and observations.
- Persistent movement history and outdoor duration, reversible archiving.
- Care records and configurable reminders for watering checks, fertilizer, repotting, pruning, inspection and harvest.
- Reminder postponement, daily summaries in a configured timezone and persisted event deduplication.
- Optional weather through Gladys' common house-weather API, with a separate Gladys API key and optional provider pinning.
- Per-plant cold, heat and wind thresholds, stale-data handling and metric/US conversion.
- Four native widgets, five scene triggers, four scene actions and virtual plant indicators.
- Atomic local persistence, rotating backups and validated offline export/import.
- French and English guides, security policy, agent instructions and Apache-2.0 license.
- CI, multi-architecture image builds, release automation, GitHub release backfill and Dependabot.
- Offline manifest schema, widget contract, persistence, weather, scene and lifecycle tests.

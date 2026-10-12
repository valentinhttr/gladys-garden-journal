# Changelog

All notable changes to Garden Journal are documented here. Unreleased describes the implementation before its first release.

## [Unreleased]

### Changed

- Replace the typographic cover with a botanical illustration and English-only lettering.

- Configure the public source repository under valentinhttr; image releases and Gladys store listing remain deferred, with local installation documented in both guides.

- Upgrade the official integration SDK to 0.15 and require Gladys 5.2.0 for native house selectors and widget action forms.
- Select houses by name in configuration, plant creation and movement forms while retaining stable selectors.
- Add an optional care observation and a configurable postponement duration (1–365 days) directly in the care widget. Form-less actions are refused to avoid accidental care records.
- Exercise discovery, state publication, widget form values, scene loop prevention and reconnection with the official SDK fake host, entirely offline.

### Added

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

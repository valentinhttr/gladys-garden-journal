# Fixture provenance

`manifest.schema.json` is the official Gladys integration-store schema, retrieved from the `main` branch on 2026-10-12 and formatted with this project's Prettier configuration. Source: <https://github.com/GladysAssistant/integration-store/blob/main/schemas/manifest.schema.json>. Upstream license: Apache-2.0.

It is vendored to make contract tests deterministic and offline. Updates are deliberate; a local copy cannot verify public repository topics, remote image existence or actual runtime installation.

Compatibility reviewed for SDK 0.15.0 and Gladys 5.2.0: `source: "houses"` requires Gladys >= 5.2.0 and cannot declare a default. Widget action forms pass user input separately in `values`; missing forms are rejected by the integration. The weather user-key requirement is unchanged.

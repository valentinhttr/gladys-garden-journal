# Security policy

## Supported versions

Security fixes target the latest released Garden Journal version. This working copy has not yet been published; no response SLA or private reporting address is claimed.

## Reporting a vulnerability

Do not disclose API keys, integration tokens, house identifiers, plant notes or exploit details in a public issue. Once a repository exists and private vulnerability reporting is enabled, use its **Security → Report a vulnerability** form. Before publication, contact the project owner through an existing private channel. If no private channel exists, request one without disclosing the vulnerability publicly.

Provide the affected version, reproduction steps, impact and a minimal redacted example. Never send a live key. Revoke a disclosed Gladys API key and replace the integration token if it was exposed.

## Trust boundaries

- Gladys authenticates integration configuration, actions, widgets and scenes. Garden Journal does not start a web server or accept arbitrary remote URLs.
- The SDK authenticates with an integration-scoped token. Optional weather access uses a **different user API key**, with the core's currently required `dashboard:write` scope. Although Garden Journal only performs weather GET requests, this key is broadly privileged; it is optional, kept in the Gladys `secret` configuration field and never included in journal exports or logs. A key limited to a future weather-only scope is preferable once supported.
- Weather requests only target `GLADYS_HOST_API_URL`, supplied by the supervisor, with a fixed house-weather route. Redirects are refused, responses bounded, and requests timed out. Plant inputs cannot override the host. Weather payloads, API bodies and credentials are not logged.
- Journal data, location labels, house selectors and observations are private household data. Local files are not encrypted by this project. Restrict host access and protect copied backups. Widgets follow Gladys' visibility rules and may be visible on a shared dashboard.
- Production runs as `node`, with a read-only container root filesystem and `/data` as the persistent writable volume. Do not mount the Docker socket or run privileged. Run only one writer per data directory.
- Updates are serialized and saved by atomic rename. Invalid/corrupt stored data fails closed; it is never silently replaced. Restore is offline, validates the schema and backs up existing data first. Stop the integration before using the backup CLI.
- Scene events are persisted and retried, with possible duplicate delivery across a crash. Scene-driven care/movement does not echo a manual event. Use idempotent scene actions.
- No dependency directly contacts a weather vendor. The installed Gladys provider owns its network access, licensing and data attribution.

Run `npm audit`, `npm run lint`, `npm run format:check` and `npm test` before releases. CI checks every pull request; never use pull-request-target with untrusted code and write credentials.

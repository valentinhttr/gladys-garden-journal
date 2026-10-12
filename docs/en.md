# Garden Journal — user guide

Garden Journal (`gladys-garden-journal`) manages indoor and outdoor plants in **Gladys Assistant 5.2.0 or later**, using Gladys native forms, widgets and scenes. No additional website or account is needed for the local journal.

## First plant

1. Open **Integrations → Garden Journal → Configuration**.
2. Use **Add a plant or batch**. Enter a name, quantity and location, such as Living room or Terrace. Choose inside/outside and pot/in-ground. Species, phase and notes are optional.
3. Open **Discovery** and add the corresponding device. This populates plant selectors in forms, widgets and scenes. Plant IDs remain stable when renamed.
4. Use **Configure a care reminder**, select the plant and care type, then an interval in days. With no first due date, the initial check is scheduled one interval from now.
5. Add the Garden Journal widgets to your dashboard.

A batch of 12 tomatoes has shared care records and reminders. To manage groups differently, create separate records and adjust their quantities. Locations are free-text labels, independent of Gladys rooms; use identical spelling to group records. “Outside since” initially means the date you added an already-outdoor plant to the journal. Use a note for earlier history.

## Care and movement

Record watering, fertilizing, repotting, pruning, inspection or harvest, with an optional observation. Dates default to now; historical dates must use ISO 8601 with a timezone, for example `2026-10-12T09:00:00+02:00`. Future completed care is rejected. Existing reminders advance from the latest actual care date; an older historical record cannot overwrite a newer completion.

A watering reminder means **check the plant**, not water automatically. When soil is still moist, use **Postpone a reminder** or **Postpone check**. Postponing does not record watering. Intervals are elapsed 24-hour days; only the daily summary follows local civil time.

**Edit plant and protection thresholds** changes name, species, quantity, notes, growth phase and risk thresholds. Blank fields preserve existing values. Phases are seedling, growing, flowering, fruiting and dormant. They are manual labels and do not prescribe or automatically modify care. To pause seasonal reminders, disable the relevant reminder; enabling it later creates a new due date.

**Record a move** logs the location and date. Moving between outdoor locations preserves the beginning of the outdoor stay. Moving indoors ends the stay; the next outdoor move starts a new one. Historical moves remain in the journal. Weather advice never records a move automatically.

**Archive or restore** stops reminders and weather checks without deleting history. Turn “Archived” off to restore; old reminders may immediately be due again. The corresponding Gladys device remains selectable. Garden Journal never deletes your Gladys devices or scenes. Renaming a plant in the journal does not automatically rename an already-added Gladys device.

## Weather through Gladys

Garden Journal reads Gladys’ common weather API, automatically using its provider or a pinned service. It needs no direct third-party weather API key. External weather integrations can supply it if they expose Gladys’ normalized weather format; functionality depends on the fields they provide.

**Current limitation:** SDK 0.15 has no weather-read method for integration tokens. `GET /api/v1/house/:house_selector/weather` requires a separate Gladys user API key. The verified core currently requires **`dashboard:write` scope**, even for this read-only request. This key has broader privileges than weather alone. If you do not want to provide it, keep weather disabled; inventory, care, reminders, journal and care scenes still work.

Setup:

1. Set the house coordinates and confirm that Gladys’ normal weather widget works.
2. Choose **Default house** from the Gladys house list in Configuration. Its stable selector is stored automatically; no manual identifier copy is needed.
3. Create a dedicated Gladys API key. The official endpoint is `POST /api/v1/session/api_key`, authenticated with your user session, with body `{"scope":["dashboard:write"],"useragent":"Garden Journal"}`. Use a key-management UI if your Gladys version offers one for this scope. A key restricted to MCP and the Gladys Plus Open API key are not interchangeable with this key. Never put credentials in this repository or public messages.
4. Choose **Default house** and fill **Gladys API key** in Configuration, then enable weather. The key is stored in a Gladys-managed `secret` field.
5. Leave provider empty for automatic selection. To pin one, use its `service_name` returned by `GET /api/v1/weather/provider`.
6. Run **Test / refresh Gladys weather**. An invalid/revoked key or missing scope can return 401; an unknown house or stopped provider also prevents weather retrieval.
7. Configure thresholds for each plant. No species-specific recommendations are invented. “Remove existing thresholds first” clears all thresholds before applying any newly entered values.

A plant’s optional house overrides the default house. A blank house during a move preserves the existing association. The provider setting is global. Only the SDK’s Gladys host is contacted, with redirects refused; transport is **local**, though Gladys’ weather provider may use the cloud.

Temperatures are normalized to °C and wind to km/h, including for US-unit accounts. Threshold comparisons are inclusive. Cold uses minimum ≤ threshold; heat and wind use maximum ≥ threshold. Current data is included. Hourly forecasts are filtered to the selected horizon; daily forecasts include the civil days touched by that horizon and can therefore cover hours beyond it. Without forecasts, current risks may still appear, and the widget reports missing temperature forecasts.

Only active outdoor plants are evaluated. A cold-risk plant in a pot is marked “Bring inside”; an in-ground plant is marked “Protect”. Heat and wind advice is “Protect”. Missing or stale values never become zero or a guarantee of safety. Metrics absent from the provider cannot be evaluated. After an API failure, cached observations are usable only within the configured maximum age.

## Widgets

- **Plant inventory:** quantities, records, inside/outside, details and notes; optional location filter and archived records.
- **Care checks:** overdue checks. Buttons act only on the first task on the page, explicitly named in the text. Recording care opens a form with an optional observation and requires confirmation; **Postpone check** accepts 1–365 days (default 1), without recording care.
- **Plants to protect:** plant, risk, value, threshold and advice, with unavailable weather, missing forecasts and unconfigured thresholds reported.
- **Plant journal:** location, phase, outside-since date, status and dated history.

Lists show eight entries per page. Change **Page** in widget settings or create location-filtered widgets. Plant creation and editing stay in Configuration. Care widget buttons open a form for an observation or the postponement duration. These forms require Gladys 5.2; actions without a submitted form are refused. Content refreshes within 60 seconds and mutations request an immediate refresh.

Virtual devices expose care-check count and days outside. They are calculated journal indicators, not physical sensors. Days outside becomes zero when moved indoors or archived.

## Scenes and notifications

Notifications use your Gladys scenes and existing communication channels. Nothing is sent until you configure them.

| Trigger                | Main variables                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| Care check due         | `name`, `care`, `due_at`, `location`                                   |
| Plant weather risk     | `name`, `risk`, `value`, `threshold`, `location`, `advice`, `forecast` |
| Care recorded manually | `name`, `care`, `at`                                                   |
| Plant moved manually   | `name`, `location`, `environment`                                      |
| Daily garden summary   | `date`, `due_count`, `risk_count`, `plant_count`                       |

Example: **Plant weather risk**, filtered to cold, followed by your notification channel action: `Check {{triggerEvent.data.name}}: {{triggerEvent.data.value}} °C, threshold {{triggerEvent.data.threshold}} °C.` Care keys are `water`, `fertilize`, `repot`, `prune`, `inspect`, `harvest`. Advice keys are `bring_inside` and `protect`.

To reduce notifications, use only **Daily garden summary**: `Garden: {{triggerEvent.data.due_count}} checks due and {{triggerEvent.data.risk_count}} weather risks.` Configure an IANA timezone and hour. No summary fires when nothing is due at the first check after that hour. A restart catches up only the current day.

Scene actions: **Record completed care**, **Record a move**, **Postpone a reminder**, **Test / refresh Gladys weather**. They return `updated`. Scene-driven care/moves do not emit the corresponding manual event, avoiding loops. Do not automatically record an indoor move on a cold alert unless the plant has actually been moved.

Each due time and weather episode triggers once, including across restarts. A risk can trigger again after a measured recovery, threshold change or move. Pending events are persisted and retried; a crash between delivery and local acknowledgement can duplicate an event. These events are suitable for notifications, not irreversible commands.

## Backups and restore

Data lives in `/data/journal.json`. **Create a local backup** writes `/data/backups` and keeps the last ten copies. Configuration and API keys are not included. Copy backups off the host to protect against disk failure. Uninstalling the integration may remove the data volume: export first.

Offline tools need Node 22+. **Stop the integration before using them** and point at the actual mounted data directory:

```bash
GARDEN_DATA_DIR=/path/to/data npm run backup -- export /path/to/backup.json
GARDEN_DATA_DIR=/path/to/data npm run backup -- import /path/to/backup.json --replace
```

Export refuses to overwrite an existing file. Import validates the journal, backs up current data and then replaces the whole journal. Pending events and weather cache are reset. Plant IDs are preserved; retain the integration selector too to preserve Gladys references. Due reminders may notify again after import.

Writes use atomic rename and disk synchronization. Corrupt data blocks startup instead of silently resetting the journal. Stop the service, rename the corrupt file away from `journal.json` to preserve it, then import a valid backup. Limits: 10 house overrides plus the default house, 500 records, 20,000 historical entries, 16 MiB. No history is automatically deleted; if full, export and trim history in an offline copy before importing it. Archiving does not free storage slots.

## Publication and validation boundaries

A public image is required for store installation. The public source repository is `valentinhttr/gladys-garden-journal`, with release `v1.0.0` and its AMD64/ARM64 image; store listing remains deferred. In Gladys 5.2.0 or later, open **Integrations → Install an integration → Developer mode** and paste the [release manifest](https://raw.githubusercontent.com/valentinhttr/gladys-garden-journal/v1.0.0/gladys-assistant-integration.json). The Gladys host must be able to pull `ghcr.io/valentinhttr/gladys-garden-journal:1.0.0`. For local testing, build the image on Gladys’ Docker host and set `docker_image` to `gladys-garden-journal:local` in a copy of the manifest used in developer mode. Schema validation does not imply an existing publication or a live installation tested on your Gladys instance.

The project uses Apache-2.0. Weather data conditions and attribution remain those of the provider configured in Gladys. Photos, plant identification, diagnosis, sensors, automatic irrigation and vacation mode are not implemented in this release.

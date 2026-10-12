# Native Gladys surfaces

Garden Journal extends existing Gladys forms and dashboard widgets. There is no independent visual system or new application shell. Colors, spacing, typography, focus states, responsiveness and dark mode are controlled by Gladys' renderer.

- Inventory uses the native list variant, with details for long notes and eight entries per page.
- Tasks put the due count and ordered task list first; action copy names which plant/task is affected. Completion opens an optional observation form and asks for confirmation; postponement opens a day-count form (1–365, default 1) and does not record care.
- Weather separates actionable risks from missing data. Absence of risk entries uses neutral styling, never a green “safe” state.
- A plant's journal shows its location, phase and outdoor date before chronological entries.
- Content is bilingual. No HTML, styles, images from arbitrary URLs, or provider-branded visuals are sent through widgets.
- House fields use Gladys’ native house selector; optional movement fields preserve the existing association when blank.
- Empty content explains the next native Configuration/Discovery action. Large lists paginate through widget settings.

Validation uses the official SDK's widget-content validator for empty, populated and long-content cases. This does not assert visual inspection in a live Gladys 5.2 renderer. The cover is an AI-generated botanical illustration with English-only lettering (Garden Journal / Gladys Assistant), not an application screenshot. The source asset is `cover.png`; `cover.jpg` is the optimized 800 × 534 publication asset.

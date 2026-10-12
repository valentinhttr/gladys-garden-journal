import { dueCare } from './journal.js';
import { risksFor, weatherFor } from './weather.js';
import { fail } from './validation.js';
export const WIDGET_KEYS = ['garden_inventory', 'garden_tasks', 'garden_weather', 'plant_journal'];
export const CARE_LABELS = {
  water: { en: 'Check watering', fr: 'Vérifier l’arrosage' },
  fertilize: { en: 'Fertilize', fr: 'Engrais' },
  repot: { en: 'Repot', fr: 'Rempotage' },
  prune: { en: 'Prune', fr: 'Taille' },
  inspect: { en: 'Inspect', fr: 'Inspection' },
  harvest: { en: 'Harvest', fr: 'Récolte' },
};
const t = (en, fr) => ({ en, fr });
const line = (text) => ({ type: 'text', variant: 'body', text });
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function paginate(items, settings = {}) {
  const page = Math.max(1, Math.floor(Number(settings.page) || 1));
  return {
    page,
    pages: Math.max(1, Math.ceil(items.length / 8)),
    items: items.slice((page - 1) * 8, page * 8),
  };
}
function filterPlants(state, settings = {}) {
  return state.plants.filter(
    (p) =>
      (settings.include_archived || !p.archived) &&
      (!settings.location || p.location === settings.location),
  );
}
function dateLabel(at, lang, timezone) {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CH' : 'en-GB', {
    timeZone: timezone,
    dateStyle: 'medium',
  }).format(new Date(at));
}
export function widgetContent(
  key,
  { store, journal, config, clock = () => Date.now() },
  request = {},
) {
  const state = store.snapshot(),
    now = clock(),
    settings = request.settings ?? {},
    lang = request.language === 'fr' ? 'fr' : 'en',
    plants = filterPlants(state, settings);
  let components;
  if (key === 'garden_inventory') {
    const page = paginate(plants, settings);
    components = [
      {
        type: 'value',
        label: t('Plants', 'Plantes'),
        value: plants.reduce((n, p) => n + p.quantity, 0),
        icon: 'sun',
      },
      { type: 'value', label: t('Records', 'Fiches'), value: plants.length },
    ];
    if (page.items.length)
      components.push({
        type: 'card-list',
        display: 'list',
        items: page.items.map((p) => ({
          title: p.name,
          subtitle: clip(`${p.quantity} × ${p.species || p.location}`, 60),
          badge: {
            text: p.archived
              ? t('Archived', 'Archivée')
              : p.environment === 'inside'
                ? t('Inside', 'Intérieur')
                : t('Outside', 'Extérieur'),
            color: p.archived ? 'neutral' : 'info',
          },
          description: t(
            `Location: ${p.location}\nSpecies: ${p.species || '—'}\nPhase: ${p.phase}\n${p.notes}`,
            `Emplacement : ${p.location}\nEspèce : ${p.species || '—'}\nPhase : ${phaseLabel(p.phase, 'fr')}\n${p.notes}`,
          ),
        })),
      });
    components.push(
      line(
        plants.length
          ? t(
              `Page ${page.page}/${page.pages}. Add or edit plants in the integration Configuration.`,
              `Page ${page.page}/${page.pages}. Ajoutez ou modifiez les plantes dans la Configuration de l’intégration.`,
            )
          : t(
              'Your journal is ready. Add your first plant in Configuration, then add its device from Discovery.',
              'Votre carnet est prêt. Ajoutez votre première plante dans Configuration, puis son appareil dans Découverte.',
            ),
      ),
    );
  } else if (key === 'garden_tasks') {
    const allowed = new Set(plants.map((p) => p.id)),
      due = dueCare(state, now).filter((d) => allowed.has(d.plant.id)),
      page = paginate(due, settings);
    components = [
      {
        type: 'value',
        label: t('Checks due', 'Soins à vérifier'),
        value: due.length,
        icon: 'check-circle',
      },
    ];
    if (page.items.length) {
      components.push({
        type: 'card-list',
        display: 'list',
        items: page.items.map((d) => ({
          title: d.plant.name,
          subtitle: CARE_LABELS[d.care],
          date: d.dueAt,
          description: t(
            `Location: ${d.plant.location}. Check actual needs before acting.`,
            `Emplacement : ${d.plant.location}. Vérifiez les besoins réels avant d’agir.`,
          ),
        })),
      });
      const first = page.items[0],
        params = {
          plant: journal.externalId(first.plant.id),
          care: first.care,
          dueAt: first.dueAt,
        };
      components.push(
        line(
          t(
            `Buttons apply to ${first.plant.name}: ${CARE_LABELS[first.care].en}. Page ${page.page}/${page.pages}.`,
            `Les boutons concernent ${first.plant.name} : ${CARE_LABELS[first.care].fr}. Page ${page.page}/${page.pages}.`,
          ),
        ),
      );
      components.push(
        {
          type: 'button',
          label: t('Record care done', 'Noter le soin réalisé'),
          icon: 'check',
          action: {
            key: 'complete_care',
            params,
            confirm: true,
            fields: [
              {
                key: 'note',
                type: 'string',
                label: t('Observation (optional)', 'Observation (facultative)'),
              },
            ],
          },
        },
        {
          type: 'button',
          label: t('Postpone check', 'Reporter le contrôle'),
          icon: 'clock',
          style: 'secondary',
          action: {
            key: 'snooze_care',
            params,
            fields: [
              {
                key: 'days',
                type: 'number',
                label: t('Days before next check', 'Jours avant le contrôle'),
                required: true,
                default: 1,
                min: 1,
                max: 365,
              },
            ],
          },
        },
      );
    } else
      components.push(
        line(
          t(
            'No checks due on this page. Reminders are configured per plant and care type in Configuration.',
            'Aucune vérification à faire sur cette page. Configurez les rappels par plante et par soin dans Configuration.',
          ),
        ),
      );
  } else if (key === 'garden_weather') {
    const outside = plants.filter((p) => p.environment === 'outside' && !p.archived),
      risks = outside.flatMap((p) => risksFor(p, state, config, now)),
      page = paginate(risks, settings);
    const statuses = outside.map((p) => weatherFor(p, state, config, now)),
      unknown = statuses.filter((w) => !['fresh', 'cached'].includes(w.status)).length,
      forecastMissing = statuses.filter(
        (w) => ['fresh', 'cached'].includes(w.status) && !w.forecast,
      ).length,
      unset = outside.filter((p) => Object.values(p.thresholds).every((v) => v === null)).length;
    components = [
      {
        type: 'value',
        label: t('Risks detected', 'Risques détectés'),
        value: risks.length,
        color: risks.length ? 'warning' : 'neutral',
      },
    ];
    const unavailableChecks = outside.reduce((count, p) => {
      const w = weatherFor(p, state, config, now);
      return (
        count +
        [
          ['cold', 'min'],
          ['heat', 'max'],
          ['wind', 'wind'],
        ].filter(([rule, metric]) => p.thresholds[rule] !== null && typeof w[metric] !== 'number')
          .length
      );
    }, 0);
    components.push({
      type: 'status',
      items: [
        {
          label: t('Cached after error', 'Cache après erreur'),
          value: statuses.filter((w) => w.status === 'cached').length,
          color: statuses.some((w) => w.status === 'cached') ? 'warning' : 'neutral',
        },
        {
          label: t('Checks unavailable', 'Contrôles impossibles'),
          value: unavailableChecks,
          color: unavailableChecks ? 'warning' : 'neutral',
        },
      ],
    });
    if (page.items.length)
      components.push({
        type: 'card-list',
        display: 'list',
        items: page.items.map((r) => ({
          title: r.plant.name,
          subtitle: clip(`${r.plant.location} · ${riskLabel(r.kind, lang)}`, 60),
          badge: {
            text:
              r.advice === 'bring_inside'
                ? t('Bring inside', 'À rentrer')
                : t('Protect', 'À protéger'),
            color: 'warning',
          },
          description: t(
            `Value: ${r.value} ${r.kind === 'wind' ? 'km/h' : '°C'}; configured threshold: ${r.threshold}. ${r.forecast ? 'Forecast and current data.' : 'Current conditions only.'}`,
            `Valeur : ${r.value} ${r.kind === 'wind' ? 'km/h' : '°C'} ; seuil configuré : ${r.threshold}. ${r.forecast ? 'Prévisions et données actuelles.' : 'Conditions actuelles uniquement.'}`,
          ),
        })),
      });
    const message = !config.weather_enabled
      ? t(
          'Weather is disabled. Enable it in Configuration with a Gladys API key and house.',
          'Météo désactivée. Activez-la dans Configuration avec une clé API Gladys et une maison.',
        )
      : t(
          `${outside.length} outside records · ${unknown} without usable weather · ${forecastMissing} without temperature forecasts · ${unset} without thresholds. Page ${page.page}/${page.pages}. Missing data cannot rule out a risk.`,
          `${outside.length} fiches dehors · ${unknown} sans météo exploitable · ${forecastMissing} sans prévisions de température · ${unset} sans seuils. Page ${page.page}/${page.pages}. Les données manquantes ne permettent pas d’exclure un risque.`,
        );
    components.push(line(message));
  } else if (key === 'plant_journal') {
    const p = state.plants.find(
      (p) => journal.externalId(p.id) === settings.plant || p.id === settings.plant,
    );
    if (!p)
      components = [
        line(
          t(
            'Select a plant in this widget’s settings. Add it from Discovery first.',
            'Choisissez une plante dans les paramètres du widget. Ajoutez d’abord son appareil depuis Découverte.',
          ),
        ),
      ];
    else {
      const entries = state.history
          .filter((h) => h.plant === p.id)
          .sort((a, b) => b.at.localeCompare(a.at)),
        page = paginate(entries, settings);
      components = [
        { type: 'text', variant: 'heading', text: clip(p.name, 40) },
        {
          type: 'status',
          items: [
            { label: t('Location', 'Emplacement'), value: p.location, color: 'neutral' },
            { label: t('Phase', 'Phase'), value: phaseLabel(p.phase, lang), color: 'neutral' },
            {
              label: t('Outside since', 'Dehors depuis'),
              value: p.outsideSince ? dateLabel(p.outsideSince, lang, config.timezone) : '—',
              color: 'neutral',
            },
            {
              label: t('Status', 'Statut'),
              value: p.archived ? t('Archived', 'Archivée') : t('Active', 'Active'),
              color: 'neutral',
            },
          ],
        },
      ];
      if (page.items.length)
        components.push({
          type: 'card-list',
          display: 'list',
          items: page.items.map((h) => ({
            title: historyLabel(h.kind, lang),
            date: h.at,
            subtitle: clip(h.note || p.name, 60),
            description: h.note || p.name,
          })),
        });
      components.push(
        line(
          t(
            clip(`Page ${page.page}/${page.pages}. ${p.notes}`, 300),
            clip(`Page ${page.page}/${page.pages}. ${p.notes}`, 300),
          ),
        ),
      );
    }
  } else throw new Error('Unknown widget');
  return { ttl_seconds: 60, components };
}
function riskLabel(kind, lang) {
  return { cold: t('Cold', 'Froid'), heat: t('Heat', 'Chaleur'), wind: t('Wind', 'Vent') }[kind][
    lang
  ];
}
function phaseLabel(kind, lang) {
  return {
    seed: t('Seedling', 'Semis'),
    growing: t('Growing', 'Croissance'),
    flowering: t('Flowering', 'Floraison'),
    fruiting: t('Fruiting', 'Fructification'),
    dormant: t('Dormant', 'Repos'),
  }[kind][lang];
}
function historyLabel(kind, lang) {
  return (
    CARE_LABELS[kind]?.[lang] ??
    {
      added: t('Added', 'Ajout'),
      updated: t('Updated', 'Modification'),
      moved: t('Moved', 'Déplacement'),
      reminder: t('Reminder', 'Rappel'),
      snoozed: t('Postponed', 'Report'),
      archived: t('Archived', 'Archivage'),
      restored: t('Restored', 'Restauration'),
    }[kind]?.[lang] ??
    kind
  );
}
export async function widgetAction(context, key, action, params, { values } = {}) {
  if (key !== 'garden_tasks' || !['complete_care', 'snooze_care'].includes(action))
    throw new Error('Unknown widget action');
  if (!values || typeof values !== 'object' || Array.isArray(values))
    fail(
      'Open the form on Gladys 5.2 or later and submit it.',
      'Ouvrez le formulaire sur Gladys 5.2 ou plus récent et validez-le.',
    );
  if (typeof params?.dueAt !== 'string' || !params.dueAt)
    fail('Refresh the widget before acting.', 'Actualisez le widget avant d’agir.');
  if (action === 'snooze_care' && !Number.isInteger(values.days))
    fail(
      'Enter a whole number of days from 1 to 365.',
      'Saisissez un nombre entier de jours entre 1 et 365.',
    );
  if (action === 'complete_care')
    await context.journal.care({
      plant: params.plant,
      care: params.care,
      expectedDueAt: params.dueAt,
      note: values.note,
    });
  else
    await context.journal.snooze({
      plant: params.plant,
      care: params.care,
      days: values.days,
      expectedDueAt: params.dueAt,
    });
  return t('Journal updated.', 'Carnet mis à jour.');
}
export function refreshWidgets(gladys) {
  for (const key of WIDGET_KEYS) gladys.requestWidgetRefresh(key);
}

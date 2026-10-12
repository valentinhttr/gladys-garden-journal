import { randomUUID } from 'node:crypto';
import {
  DAY,
  CARE_TYPES,
  PHASES,
  text,
  number,
  choice,
  date,
  bool,
  present,
  fail,
} from './validation.js';
export const TRIGGERS = [
  'care_due',
  'weather_risk',
  'care_recorded',
  'plant_moved',
  'daily_summary',
];
export function enqueue(state, key, data) {
  state.outbox.push({ id: randomUUID(), key, data });
}
export function history(state, plant, kind, note, now) {
  if (state.history.length >= 20000)
    fail(
      'History full. Export and archive old data first.',
      'Historique plein. Exportez et archivez les anciennes données.',
    );
  state.history.push({ plant: plant.id, kind, note, at: new Date(now).toISOString() });
}
export class Journal {
  constructor(store, { clock = () => Date.now(), externalId = (id) => id } = {}) {
    this.store = store;
    this.clock = clock;
    this.externalId = externalId;
  }
  resolve(state, ref, { archived = false } = {}) {
    const p = state.plants.find((p) => p.id === ref || this.externalId(p.id) === ref);
    if (!p || (p.archived && !archived))
      fail('Plant not found or archived.', 'Plante introuvable ou archivée.');
    return p;
  }
  async add(f) {
    return this.store.transaction((s) => {
      if (s.plants.length >= 500) fail('Maximum 500 plant records.', 'Maximum de 500 fiches.');
      const now = this.clock(),
        at = new Date(now).toISOString();
      const p = {
        id: randomUUID(),
        name: text(f.name, 'name'),
        species: text(f.species ?? '', 'species', 100, false),
        quantity: number(f.quantity ?? 1, 'quantity', 1, 10000, true),
        location: text(f.location, 'location', 40),
        environment: choice(f.environment ?? 'inside', ['inside', 'outside'], 'environment'),
        growing: choice(f.growing ?? 'pot', ['pot', 'ground'], 'growing'),
        house: text(f.house ?? '', 'house', 100, false),
        phase: choice(f.phase ?? 'growing', PHASES, 'phase'),
        notes: text(f.notes ?? '', 'notes', 1000, false),
        archived: false,
        createdAt: at,
        movedAt: at,
        outsideSince: null,
        thresholds: { cold: null, heat: null, wind: null },
        reminders: {},
      };
      if (p.environment === 'outside') p.outsideSince = at;
      s.plants.push(p);
      history(s, p, 'added', '', now);
      return p.id;
    });
  }
  async update(f) {
    return this.store.transaction((s) => {
      const p = this.resolve(s, f.plant);
      const previousPhase = p.phase;
      for (const [key, max] of [
        ['name', 60],
        ['species', 100],
        ['notes', 1000],
      ])
        if (present(f[key])) p[key] = text(f[key], key, max);
      if (present(f.quantity)) p.quantity = number(f.quantity, 'quantity', 1, 10000, true);
      if (present(f.phase)) p.phase = choice(f.phase, PHASES, 'phase');
      if (f.clear_thresholds === true) p.thresholds = { cold: null, heat: null, wind: null };
      for (const [key, min, max] of [
        ['cold', -50, 50],
        ['heat', 0, 70],
        ['wind', 1, 250],
      ])
        if (present(f[key])) p.thresholds[key] = number(f[key], key, min, max);
      if (
        p.thresholds.cold !== null &&
        p.thresholds.heat !== null &&
        p.thresholds.cold >= p.thresholds.heat
      )
        fail(
          'Cold threshold must be below heat threshold.',
          'Le seuil de froid doit être inférieur au seuil de chaleur.',
        );
      history(
        s,
        p,
        'updated',
        p.phase !== previousPhase ? `${previousPhase} → ${p.phase}` : '',
        this.clock(),
      );
    });
  }
  async move(f, { emit = true } = {}) {
    return this.store.transaction((s) => {
      const p = this.resolve(s, f.plant),
        now = this.clock();
      const old = p.location,
        environment = choice(f.environment, ['inside', 'outside'], 'environment'),
        location = text(f.location, 'location', 40);
      const house = present(f.house) ? text(f.house, 'house', 100) : p.house;
      if (location === p.location && environment === p.environment && house === p.house) return;
      if (environment === 'outside' && p.environment !== 'outside')
        p.outsideSince = new Date(now).toISOString();
      if (environment === 'inside') p.outsideSince = null;
      p.location = location;
      p.environment = environment;
      p.house = house;
      p.movedAt = new Date(now).toISOString();
      history(s, p, 'moved', `${old} → ${location}`, now);
      if (emit)
        enqueue(s, 'plant_moved', {
          plant: this.externalId(p.id),
          name: p.name,
          location,
          environment,
        });
    });
  }
  async care(f, { emit = true } = {}) {
    return this.store.transaction((s) => {
      const p = this.resolve(s, f.plant),
        kind = choice(f.care, CARE_TYPES, 'care'),
        now = this.clock();
      const at = present(f.at) ? date(f.at) : new Date(now).toISOString();
      if (Date.parse(at) > now)
        fail(
          'A care record cannot be in the future.',
          'Un soin réalisé ne peut pas être dans le futur.',
        );
      const r = p.reminders[kind];
      if (f.expectedDueAt && r?.dueAt !== f.expectedDueAt)
        fail(
          'This reminder has already changed. Refresh the widget.',
          'Ce rappel a déjà changé. Actualisez le widget.',
        );
      if (r && (!r.lastDone || at > r.lastDone)) {
        r.lastDone = at;
        r.dueAt = new Date(Date.parse(at) + r.intervalDays * DAY).toISOString();
      }
      history(s, p, kind, text(f.note ?? '', 'note', 1000, false), Date.parse(at));
      if (emit)
        enqueue(s, 'care_recorded', { plant: this.externalId(p.id), name: p.name, care: kind, at });
    });
  }
  async reminder(f) {
    return this.store.transaction((s) => {
      const p = this.resolve(s, f.plant),
        kind = choice(f.care, CARE_TYPES, 'care');
      if (f.enabled === false) {
        delete p.reminders[kind];
        return;
      }
      const intervalDays = number(f.interval_days, 'interval_days', 1, 3650, true),
        now = this.clock();
      p.reminders[kind] = {
        intervalDays,
        dueAt: present(f.due_at)
          ? date(f.due_at)
          : new Date(now + intervalDays * DAY).toISOString(),
        lastDone: p.reminders[kind]?.lastDone ?? null,
      };
      history(s, p, 'reminder', kind, now);
    });
  }
  async snooze(f) {
    return this.store.transaction((s) => {
      const p = this.resolve(s, f.plant),
        kind = choice(f.care, CARE_TYPES, 'care'),
        r = p.reminders[kind];
      if (f.expectedDueAt && r?.dueAt !== f.expectedDueAt)
        fail('This reminder has already changed.', 'Ce rappel a déjà changé.');
      if (!r) fail('No reminder for this care.', 'Aucun rappel pour ce soin.');
      r.dueAt = new Date(
        this.clock() + number(f.days ?? 1, 'days', 1, 365, true) * DAY,
      ).toISOString();
      history(s, p, 'snoozed', kind, this.clock());
    });
  }
  async archive(f) {
    return this.store.transaction((s) => {
      const p = this.resolve(s, f.plant, { archived: true });
      p.archived = bool(f.archived, 'archived');
      history(
        s,
        p,
        p.archived ? 'archived' : 'restored',
        text(f.note ?? '', 'note', 1000, false),
        this.clock(),
      );
    });
  }
}
export function dueCare(state, now) {
  return state.plants
    .filter((p) => !p.archived)
    .flatMap((p) =>
      Object.entries(p.reminders)
        .filter(([, r]) => Date.parse(r.dueAt) <= now)
        .map(([care, r]) => ({ plant: p, care, ...r })),
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

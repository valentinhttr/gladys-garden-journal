import { mkdir, readFile, rename, open, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CARE_TYPES, PHASES, text, number, choice, date, bool } from './validation.js';
export const MAX_BYTES = 16 * 1024 * 1024;
export function initialState() {
  return {
    version: 1,
    plants: [],
    history: [],
    weather: {},
    notices: {},
    outbox: [],
    digestDate: null,
  };
}
function keysOnly(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('Invalid journal fields');
}
export function validateState(s) {
  keysOnly(s, ['version', 'plants', 'history', 'weather', 'notices', 'outbox', 'digestDate']);
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.plants) ||
    s.plants.length > 500 ||
    !Array.isArray(s.history) ||
    s.history.length > 20000 ||
    !Array.isArray(s.outbox) ||
    s.outbox.length > 5000
  )
    throw new Error('Sauvegarde invalide / Invalid journal');
  const ids = new Set();
  for (const p of s.plants) {
    keysOnly(p, [
      'id',
      'name',
      'species',
      'location',
      'house',
      'notes',
      'quantity',
      'environment',
      'growing',
      'phase',
      'archived',
      'createdAt',
      'movedAt',
      'outsideSince',
      'reminders',
      'thresholds',
    ]);
    if (!/^[a-f0-9-]{36}$/.test(p.id) || ids.has(p.id)) throw new Error('Invalid plant ID');
    ids.add(p.id);
    text(p.name, 'name');
    text(p.species, 'species', 100, false);
    text(p.location, 'location', 40);
    text(p.house, 'house', 100, false);
    text(p.notes, 'notes', 1000, false);
    number(p.quantity, 'quantity', 1, 10000, true);
    choice(p.environment, ['inside', 'outside'], 'environment');
    choice(p.growing, ['pot', 'ground'], 'growing');
    choice(p.phase, PHASES, 'phase');
    bool(p.archived, 'archived');
    date(p.createdAt);
    date(p.movedAt);
    if (p.outsideSince !== null) date(p.outsideSince);
    if (!p.reminders || !p.thresholds) throw new Error('Invalid plant settings');
    keysOnly(p.thresholds, ['cold', 'heat', 'wind']);
    keysOnly(p.reminders, CARE_TYPES);
    for (const [key, min, max] of [
      ['cold', -50, 50],
      ['heat', 0, 70],
      ['wind', 1, 250],
    ])
      if (p.thresholds[key] !== null) number(p.thresholds[key], key, min, max);
    for (const [kind, r] of Object.entries(p.reminders)) {
      keysOnly(r, ['intervalDays', 'dueAt', 'lastDone']);
      choice(kind, CARE_TYPES, 'care');
      number(r.intervalDays, 'interval', 1, 3650, true);
      date(r.dueAt);
      if (r.lastDone !== null) date(r.lastDone);
    }
  }
  if (new Set(s.plants.map((p) => p.house).filter(Boolean)).size > 10)
    throw new Error('Maximum 10 house overrides / Maximum 10 maisons spécifiques');
  for (const h of s.history) {
    keysOnly(h, ['plant', 'kind', 'note', 'at']);
    if (!ids.has(h.plant)) throw new Error('Unknown history plant');
    choice(
      h.kind,
      [...CARE_TYPES, 'added', 'updated', 'moved', 'reminder', 'snoozed', 'archived', 'restored'],
      'history kind',
    );
    text(h.note, 'note', 1200, false);
    date(h.at);
  }
  if (
    !s.weather ||
    typeof s.weather !== 'object' ||
    Array.isArray(s.weather) ||
    !s.notices ||
    typeof s.notices !== 'object' ||
    Array.isArray(s.notices)
  )
    throw new Error('Invalid state');
  if (s.digestDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(s.digestDate))
    throw new Error('Invalid digest date');
  for (const value of Object.values(s.notices)) text(value, 'notice', 200);
  for (const entry of Object.values(s.weather)) {
    keysOnly(entry, ['data', 'error']);
    bool(entry.error, 'weather error');
    if (!entry.data) continue;
    const w = entry.data;
    keysOnly(w, ['receivedAt', 'current', 'hours', 'days']);
    date(w.receivedAt);
    if (
      !Array.isArray(w.hours) ||
      w.hours.length > 48 ||
      !Array.isArray(w.days) ||
      w.days.length > 8
    )
      throw new Error('Invalid forecast');
    for (const sample of [w.current, ...w.hours]) {
      keysOnly(sample, ['at', 'temperature', 'wind']);
      date(sample.at);
      if (sample.temperature !== null) number(sample.temperature, 'temperature', -150, 150);
      if (sample.wind !== null) number(sample.wind, 'wind', 0, 1000);
    }
    for (const sample of w.days) {
      keysOnly(sample, ['at', 'min', 'max', 'wind']);
      date(sample.at);
      for (const key of ['min', 'max'])
        if (sample[key] !== null) number(sample[key], key, -150, 150);
      if (sample.wind !== null) number(sample.wind, 'wind', 0, 1000);
    }
  }
  for (const e of s.outbox) {
    keysOnly(e, ['id', 'key', 'data']);
    text(e.id, 'event ID', 36);
    choice(
      e.key,
      ['care_due', 'weather_risk', 'care_recorded', 'plant_moved', 'daily_summary'],
      'event',
    );
    const fields = {
      care_due: ['plant', 'name', 'care', 'due_at', 'location'],
      weather_risk: [
        'plant',
        'name',
        'location',
        'risk',
        'value',
        'threshold',
        'advice',
        'forecast',
      ],
      care_recorded: ['plant', 'name', 'care', 'at'],
      plant_moved: ['plant', 'name', 'location', 'environment'],
      daily_summary: ['date', 'due_count', 'risk_count', 'plant_count'],
    }[e.key];
    keysOnly(e.data, fields);
    if (Object.keys(e.data).length !== fields.length) throw new Error('Incomplete event');
    for (const value of Object.values(e.data))
      if (
        !['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && !Number.isFinite(value)) ||
        (typeof value === 'string' && value.length > 200)
      )
        throw new Error('Invalid event value');
  }
  return s;
}
export class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = join(directory, 'journal.json');
    this.state = null;
    this.tail = Promise.resolve();
  }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      if ((await stat(this.file)).size > MAX_BYTES) throw new Error('Journal too large');
      this.state = validateState(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.state = initialState();
      await this.write(this.state);
    }
    return this;
  }
  snapshot() {
    if (!this.state) throw new Error('Store not loaded');
    return structuredClone(this.state);
  }
  async write(state) {
    const body = JSON.stringify(state, null, 2) + '\n';
    if (Buffer.byteLength(body) > MAX_BYTES)
      throw new Error('Journal full: export history before adding more / Journal plein');
    const tmp = join(this.directory, `.journal-${randomUUID()}.tmp`);
    try {
      const fd = await open(tmp, 'wx', 0o600);
      try {
        await fd.writeFile(body);
        await fd.sync();
      } finally {
        await fd.close();
      }
      await rename(tmp, this.file);
      const directory = await open(this.directory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  transaction(fn) {
    const job = this.tail.then(async () => {
      const next = this.snapshot();
      const result = await fn(next);
      validateState(next);
      if (JSON.stringify(next) !== JSON.stringify(this.state)) await this.write(next);
      this.state = next;
      return result;
    });
    this.tail = job.catch(() => {});
    return job;
  }
  async backup() {
    await this.tail;
    const folder = join(this.directory, 'backups');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const filename = `journal-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.json`;
    const fd = await open(join(folder, filename), 'wx', 0o600);
    try {
      await fd.writeFile(JSON.stringify(this.snapshot(), null, 2) + '\n');
      await fd.sync();
    } finally {
      await fd.close();
    }
    const files = (await readdir(folder)).filter((n) => /^journal-.*\.json$/.test(n)).sort();
    for (const old of files.slice(0, -10)) await unlink(join(folder, old));
    return filename;
  }
  async close() {
    await this.tail;
  }
}

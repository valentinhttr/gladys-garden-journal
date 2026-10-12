import { dueCare, enqueue } from './journal.js';
import { risksFor, weatherFor } from './weather.js';
export class Engine {
  constructor({ store, journal, gladys, clock = () => Date.now() }) {
    Object.assign(this, { store, journal, gladys, clock });
    this.busy = null;
  }
  async tick(config) {
    if (this.busy) return this.busy;
    this.busy = this.run(config).finally(() => {
      this.busy = null;
    });
    return this.busy;
  }
  async run(config) {
    const now = this.clock();
    await this.store.transaction((s) => {
      const active = s.plants.filter((p) => !p.archived),
        due = dueCare(s, now),
        risks = active.flatMap((p) => risksFor(p, s, config, now));
      const candidates = [];
      for (const item of due)
        candidates.push({
          id: `care:${item.plant.id}:${item.care}`,
          value: item.dueAt,
          key: 'care_due',
          data: {
            plant: this.journal.externalId(item.plant.id),
            name: item.plant.name,
            care: item.care,
            due_at: item.dueAt,
            location: item.plant.location,
          },
        });
      for (const r of risks)
        candidates.push({
          id: `risk:${r.plant.id}:${r.kind}`,
          value: `${r.threshold}:${r.plant.movedAt}`,
          key: 'weather_risk',
          data: {
            plant: this.journal.externalId(r.plant.id),
            name: r.plant.name,
            location: r.plant.location,
            risk: r.kind,
            value: r.value,
            threshold: r.threshold,
            advice: r.advice,
            forecast: r.forecast,
          },
        });
      s.outbox = s.outbox.filter((e) => {
        if (e.key === 'care_due')
          return candidates.some(
            (c) =>
              c.key === e.key &&
              c.data.plant === e.data.plant &&
              c.data.care === e.data.care &&
              c.data.due_at === e.data.due_at,
          );
        if (e.key === 'weather_risk') {
          const keep = candidates.some(
            (c) => c.key === e.key && c.data.plant === e.data.plant && c.data.risk === e.data.risk,
          );
          if (!keep) {
            const p = s.plants.find((p) => this.journal.externalId(p.id) === e.data.plant);
            if (p) delete s.notices[`risk:${p.id}:${e.data.risk}`];
          }
          return keep;
        }
        return true;
      });
      const current = new Set(candidates.map((c) => c.id));
      for (const id of Object.keys(s.notices)) {
        // A missing/stale forecast must not reset deduplication and cause an
        // alert burst when the same forecast becomes reachable again.
        if (id.startsWith('risk:')) {
          const [, plantId, kind] = id.split(':');
          const p = active.find((p) => p.id === plantId);
          if (!p || p.environment !== 'outside' || p.thresholds[kind] === null)
            delete s.notices[id];
          else if (!current.has(id)) {
            const w = weatherFor(p, s, config, now);
            const metric = { cold: 'min', heat: 'max', wind: 'wind' }[kind];
            if (w.status === 'fresh' && typeof w[metric] === 'number') delete s.notices[id];
          }
        } else if (!current.has(id)) delete s.notices[id];
      }
      for (const c of candidates)
        if (s.notices[c.id] !== c.value) {
          s.notices[c.id] = c.value;
          enqueue(s, c.key, c.data);
        }
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: config.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(now)
          .map((p) => [p.type, p.value]),
      );
      const day = `${parts.year}-${parts.month}-${parts.day}`;
      s.outbox = s.outbox.filter(
        (e) => e.key !== 'daily_summary' || (e.data.date === day && (due.length || risks.length)),
      );
      for (const e of s.outbox)
        if (e.key === 'daily_summary') {
          e.data.due_count = due.length;
          e.data.risk_count = risks.length;
          e.data.plant_count = active.reduce((n, p) => n + p.quantity, 0);
        }

      if (
        config.digest_enabled &&
        Number(parts.hour) >= config.digest_hour &&
        s.digestDate !== day
      ) {
        s.digestDate = day;
        if (due.length || risks.length)
          enqueue(s, 'daily_summary', {
            date: day,
            due_count: due.length,
            risk_count: risks.length,
            plant_count: active.reduce((n, p) => n + p.quantity, 0),
          });
      }
    });
    // Bounded delivery remains below the core's rate limit. A durable outbox
    // retries after reconnect. A crash after delivery may replay an event.
    for (const event of this.store.snapshot().outbox.slice(0, 60)) {
      await this.gladys.publishSceneEvent(event.key, event.data);
      await this.store.transaction((s) => {
        s.outbox = s.outbox.filter((e) => e.id !== event.id);
      });
    }
  }
}

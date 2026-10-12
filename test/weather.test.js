import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context } from './helpers/context.js';
import {
  normalizeWeather,
  fetchWeather,
  weatherFor,
  weatherKey,
  risksFor,
  WeatherService,
} from '../src/weather.js';
const payload = (now, extra = {}) => ({
  units: 'metric',
  datetime: new Date(now).toISOString(),
  temperature: 10,
  wind_speed: 2,
  ...extra,
});
async function setWeather(c, raw) {
  c.config = { ...c.config, weather_enabled: true, weather_api_key: 'test-only', house: 'home' };
  await c.store.transaction((s) => {
    s.weather[weatherKey('home')] = { data: normalizeWeather(raw, c.clock()), error: false };
  });
}
test('US units normalize Fahrenheit and mph; missing values stay unknown', () => {
  const w = normalizeWeather(
    payload(Date.now(), {
      units: 'us',
      temperature: 32,
      wind_speed: 10,
      days: [{ datetime: '2026-10-13T00:00:00Z', temperature_min: null }],
    }),
  );
  assert.equal(w.current.temperature, 0);
  assert.equal(w.current.wind, 16.09344);
  assert.equal(w.days[0].min, null);
  assert.throws(() => normalizeWeather({ temperature: 0 }));
});
test('fetch uses Gladys house API, optional provider and separate API key without redirects', async () => {
  let request;
  const now = Date.now();
  const data = await fetchWeather({
    host: 'http://gladys.test:80',
    house: 'my house',
    apiKey: 'private',
    provider: 'ext-meteo',
    now,
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(payload(now)), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(request.url.pathname, '/api/v1/house/my%20house/weather');
  assert.equal(request.url.searchParams.get('service'), 'ext-meteo');
  assert.equal(request.options.headers.authorization, 'private');
  assert.equal(request.options.redirect, 'error');
  assert.equal(data.current.temperature, 10);
});
test('HTTP failures never echo response body or credentials', async () => {
  await assert.rejects(
    () =>
      fetchWeather({
        host: 'http://gladys.test',
        house: 'home',
        apiKey: 'secret',
        fetcher: async () => new Response('secret body', { status: 401 }),
      }),
    (e) => e.message.includes('401') && !e.message.includes('secret'),
  );
});
test('only exposed plants trigger configured cold, heat or wind thresholds', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.update({ plant: id, cold: 5, wind: 20 });
  await setWeather(
    c,
    payload(c.clock(), {
      hours: [
        { datetime: new Date(c.clock() + 3600000).toISOString(), temperature: 2, wind_speed: 8 },
      ],
    }),
  );
  const p = c.store.snapshot().plants[0];
  const risks = risksFor(p, c.store.snapshot(), c.config, c.clock());
  assert.deepEqual(
    risks.map((r) => r.kind),
    ['cold', 'wind'],
  );
  assert.equal(risks[0].advice, 'bring_inside');
  assert.equal(
    risksFor({ ...p, environment: 'inside' }, c.store.snapshot(), c.config, c.clock()).length,
    0,
  );
  assert.equal(
    risksFor({ ...p, growing: 'ground' }, c.store.snapshot(), c.config, c.clock())[0].advice,
    'protect',
  );
});
test('past forecasts and forecasts beyond horizon are excluded', async (t) => {
  const c = await context(t);
  await c.plant();
  await setWeather(
    c,
    payload(c.clock(), {
      hours: [
        { datetime: new Date(c.clock() - 3600000).toISOString(), temperature: -20 },
        { datetime: new Date(c.clock() + 72 * 3600000).toISOString(), temperature: -10 },
      ],
    }),
  );
  const w = weatherFor(c.store.snapshot().plants[0], c.store.snapshot(), c.config, c.clock());
  assert.equal(w.min, 10);
  assert.equal(w.forecast, false);
});
test('stale observation or future observation is never presented as safe fresh weather', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.update({ plant: id, cold: 5 });
  await setWeather(c, payload(c.clock() - 3 * 3600000, { temperature: -5 }));
  let p = c.store.snapshot().plants[0];
  assert.equal(weatherFor(p, c.store.snapshot(), c.config, c.clock()).status, 'stale');
  assert.deepEqual(risksFor(p, c.store.snapshot(), c.config, c.clock()), []);
  await setWeather(c, payload(c.clock() + 3600000));
  assert.equal(weatherFor(p, c.store.snapshot(), c.config, c.clock()).status, 'stale');
});
test('missing metrics do not become zero and create false frost alarms', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.update({ plant: id, cold: 5 });
  await setWeather(c, payload(c.clock(), { temperature: null, wind_speed: null }));
  const p = c.store.snapshot().plants[0];
  assert.equal(weatherFor(p, c.store.snapshot(), c.config, c.clock()).min, null);
  assert.deepEqual(risksFor(p, c.store.snapshot(), c.config, c.clock()), []);
});
test('failed refresh keeps a bounded-age cache and reports degraded status', async (t) => {
  const c = await context(t);
  await c.plant();
  await setWeather(c, payload(c.clock()));
  const service = new WeatherService(c.store, {
    host: 'http://gladys.test',
    clock: c.clock,
    fetcher: async () => {
      throw new Error('unavailable');
    },
  });
  assert.deepEqual(await service.refresh(c.config), { ok: 0, failed: 1 });
  assert.equal(
    weatherFor(c.store.snapshot().plants[0], c.store.snapshot(), c.config, c.clock()).status,
    'cached',
  );
  c.advance(121 * 60000);
  assert.equal(
    weatherFor(c.store.snapshot().plants[0], c.store.snapshot(), c.config, c.clock()).status,
    'stale',
  );
});
test('provider changes never reuse another provider cache', async (t) => {
  const c = await context(t);
  await c.plant();
  await setWeather(c, payload(c.clock()));
  assert.equal(
    weatherFor(
      c.store.snapshot().plants[0],
      c.store.snapshot(),
      { ...c.config, provider: 'other' },
      c.clock(),
    ).status,
    'pending',
  );
});

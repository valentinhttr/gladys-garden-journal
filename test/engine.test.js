import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, fakeGladys } from './helpers/context.js';
import { Engine } from '../src/engine.js';
import { DAY } from '../src/validation.js';
import { normalizeWeather, weatherKey } from '../src/weather.js';
async function setup(t) {
  const c = await context(t),
    id = await c.plant();
  const gladys = fakeGladys(),
    engine = new Engine({ ...c, gladys });
  await c.journal.reminder({ plant: id, care: 'water', interval_days: 1 });
  c.advance(DAY);
  return { ...c, id, gladys, engine };
}
test('due reminder emits once across repeated checks and restart', async (t) => {
  const c = await setup(t);
  await c.engine.tick(c.config);
  await c.engine.tick(c.config);
  const restarted = new Engine({ ...c });
  await restarted.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'care_due').length, 1);
  assert.equal(c.gladys.events.filter((e) => e.key === 'daily_summary').length, 1);
});
test('notification retries after failure and durable outbox is cleared after success', async (t) => {
  const c = await setup(t);
  const send = c.gladys.publishSceneEvent;
  c.gladys.publishSceneEvent = async () => {
    throw new Error('offline');
  };
  await assert.rejects(() => c.engine.tick(c.config));
  assert.ok(c.store.snapshot().outbox.length > 0);
  c.gladys.publishSceneEvent = send;
  await c.engine.tick(c.config);
  assert.equal(c.store.snapshot().outbox.length, 0);
  assert.equal(c.gladys.events.filter((e) => e.key === 'care_due').length, 1);
});
test('completed reminder is not delivered from stale offline outbox', async (t) => {
  const c = await setup(t);
  const send = c.gladys.publishSceneEvent;
  c.gladys.publishSceneEvent = async () => {
    throw new Error('offline');
  };
  await assert.rejects(() => c.engine.tick(c.config));
  await c.journal.care({ plant: c.id, care: 'water' }, { emit: false });
  c.gladys.publishSceneEvent = send;
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'care_due').length, 0);
});
test('postponed reminder triggers again only at its new due time', async (t) => {
  const c = await setup(t);
  await c.engine.tick(c.config);
  await c.journal.snooze({ plant: c.id, care: 'water', days: 2 });
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'care_due').length, 1);
  c.advance(2 * DAY);
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'care_due').length, 2);
});
test('daily summary uses local day and survives DST repeated hour', async (t) => {
  const c = await setup(t);
  c.config.digest_hour = 13;
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'daily_summary').length, 0);
  c.advance(3600000);
  await c.engine.tick(c.config);
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'daily_summary').length, 1);
  c.advance(DAY);
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'daily_summary').length, 2);
});
test('risk notifications do not repeat on polls or temporary missing telemetry', async (t) => {
  const c = await setup(t);
  await c.journal.update({ plant: c.id, cold: 5 });
  c.config = { ...c.config, weather_enabled: true, weather_api_key: 'test', house: 'home' };
  const put = async (temperature) =>
    c.store.transaction((s) => {
      s.weather[weatherKey('home')] = {
        data: normalizeWeather(
          { units: 'metric', datetime: new Date(c.clock()).toISOString(), temperature },
          c.clock(),
        ),
        error: false,
      };
    });
  await put(2);
  await c.engine.tick(c.config);
  await put(null);
  await c.engine.tick(c.config);
  await put(2);
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'weather_risk').length, 1);
  await put(10);
  await c.engine.tick(c.config);
  await put(2);
  await c.engine.tick(c.config);
  assert.equal(c.gladys.events.filter((e) => e.key === 'weather_risk').length, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context } from './helpers/context.js';
import { DAY } from '../src/validation.js';
import { dueCare } from '../src/journal.js';
import { Store } from '../src/store.js';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
test('plant batches retain stable IDs, quantity and outside start across restart and rename', async (t) => {
  const c = await context(t),
    id = await c.plant({ quantity: 12 });
  c.advance(2 * DAY);
  await c.journal.update({ plant: id, name: 'Tomates' });
  const fresh = await new Store(c.store.directory).load(),
    p = fresh.snapshot().plants[0];
  assert.equal(p.id, id);
  assert.equal(p.quantity, 12);
  assert.equal(p.name, 'Tomates');
  assert.equal(p.outsideSince, '2026-10-12T10:00:00.000Z');
});
test('outdoor-to-outdoor move preserves outside start, moving inside clears it', async (t) => {
  const c = await context(t),
    id = await c.plant();
  c.advance(DAY);
  await c.journal.move({ plant: id, location: 'Balcon', environment: 'outside' });
  assert.equal(c.store.snapshot().plants[0].outsideSince, '2026-10-12T10:00:00.000Z');
  await c.journal.move({ plant: id, location: 'Salon', environment: 'inside' });
  assert.equal(c.store.snapshot().plants[0].outsideSince, null);
  c.advance(DAY);
  await c.journal.move({ plant: id, location: 'Jardin', environment: 'outside' });
  assert.equal(c.store.snapshot().plants[0].outsideSince, new Date(c.clock()).toISOString());
});
test('same-location move is idempotent', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.move({ plant: id, location: 'Terrasse', environment: 'outside' });
  assert.equal(c.store.snapshot().history.length, 1);
  assert.equal(c.store.snapshot().outbox.length, 0);
});
test('care advances reminder from actual care time; postponing is not watering', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.reminder({ plant: id, care: 'water', interval_days: 7 });
  c.advance(7 * DAY);
  assert.equal(dueCare(c.store.snapshot(), c.clock()).length, 1);
  await c.journal.snooze({ plant: id, care: 'water', days: 1 });
  assert.equal(c.store.snapshot().plants[0].reminders.water.lastDone, null);
  c.advance(DAY);
  await c.journal.care({ plant: id, care: 'water' });
  const r = c.store.snapshot().plants[0].reminders.water;
  assert.equal(r.lastDone, new Date(c.clock()).toISOString());
  assert.equal(Date.parse(r.dueAt), c.clock() + 7 * DAY);
});
test('historical care cannot move a newer reminder backwards', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.reminder({ plant: id, care: 'water', interval_days: 7 });
  await c.journal.care({ plant: id, care: 'water' });
  const before = c.store.snapshot().plants[0].reminders.water;
  await c.journal.care({ plant: id, care: 'water', at: '2026-10-01T10:00:00Z' });
  assert.deepEqual(c.store.snapshot().plants[0].reminders.water, before);
});
test('future care, invalid quantity, unknown plant and invalid thresholds roll back', async (t) => {
  const c = await context(t),
    id = await c.plant();
  const before = c.store.snapshot();
  for (const change of [
    () => c.journal.care({ plant: id, care: 'water', at: '2030-01-01T00:00:00Z' }),
    () => c.journal.update({ plant: id, quantity: -2 }),
    () => c.journal.update({ plant: 'unknown', name: 'X' }),
    () => c.journal.update({ plant: id, cold: 30, heat: 20 }),
  ])
    await assert.rejects(change);
  assert.deepEqual(c.store.snapshot(), before);
});
test('disabled reminders and archived plants stop due checks; restoration keeps history', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.reminder({ plant: id, care: 'water', interval_days: 1 });
  c.advance(DAY);
  await c.journal.archive({ plant: id, archived: true });
  assert.equal(dueCare(c.store.snapshot(), c.clock()).length, 0);
  await assert.rejects(() => c.journal.care({ plant: id, care: 'water' }));
  await c.journal.archive({ plant: id, archived: false });
  assert.equal(dueCare(c.store.snapshot(), c.clock()).length, 1);
  await c.journal.reminder({ plant: id, care: 'water', enabled: false });
  assert.equal(dueCare(c.store.snapshot(), c.clock()).length, 0);
});
test('concurrent additions are serialized without losing records', async (t) => {
  const c = await context(t);
  await Promise.all(Array.from({ length: 20 }, (_, i) => c.plant({ name: `Plant ${i}` })));
  assert.equal(c.store.snapshot().plants.length, 20);
  assert.equal(new Set(c.store.snapshot().plants.map((p) => p.id)).size, 20);
});
test('failed storage write does not commit memory; later writes recover', async (t) => {
  const c = await context(t);
  const write = c.store.write.bind(c.store);
  c.store.write = async () => {
    throw new Error('disk full');
  };
  await assert.rejects(() => c.plant());
  assert.equal(c.store.snapshot().plants.length, 0);
  c.store.write = write;
  await c.plant();
  assert.equal(c.store.snapshot().plants.length, 1);
});
test('corrupt data is never silently overwritten', async (t) => {
  const c = await context(t);
  await writeFile(c.store.file, 'broken');
  await assert.rejects(() => new Store(c.store.directory).load());
  assert.equal(await readFile(c.store.file, 'utf8'), 'broken');
});
test('backup rotation keeps ten complete restorable journals', async (t) => {
  const c = await context(t);
  await c.plant();
  for (let i = 0; i < 12; i++) await c.store.backup();
  const files = await readdir(join(c.store.directory, 'backups'));
  assert.equal(files.length, 10);
  for (const f of files)
    assert.equal(
      JSON.parse(await readFile(join(c.store.directory, 'backups', f), 'utf8')).plants.length,
      1,
    );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { context, fakeGladys } from './helpers/context.js';
import { widgetContent, widgetAction, WIDGET_KEYS } from '../src/widgets.js';
import { registerIntegration } from '../src/runtime.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { ACTION_KEYS, SCENE_KEYS, runAction } from '../src/actions.js';
import { TRIGGERS } from '../src/journal.js';
import { DAY } from '../src/validation.js';
const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
test('manifest validates against vendored official schema and all capability handlers exist', async () => {
  const schema = JSON.parse(
      await readFile(new URL('./fixtures/manifest.schema.json', import.meta.url), 'utf8'),
    ),
    validate = new Ajv({ allErrors: true }).compile(schema);
  assert.ok(validate(manifest), JSON.stringify(validate.errors, null, 2));
  const keys = (entries) => entries.map((e) => e.key).sort();
  assert.deepEqual(keys(manifest.actions), [...ACTION_KEYS].sort());
  assert.deepEqual(keys(manifest.scene_actions), [...SCENE_KEYS].sort());
  assert.deepEqual(keys(manifest.widgets), [...WIDGET_KEYS].sort());
  assert.deepEqual(keys(manifest.scene_triggers), [...TRIGGERS].sort());
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'gladys-garden-journal');
  assert.equal(pkg.version, manifest.version);
  assert.ok(manifest.docker_image.endsWith(`:${pkg.version}`));
  assert.equal(manifest.gladys_version, '>=5.2.0');
  assert.deepEqual(manifest.transports, ['local']);
  for (const f of manifest.config_schema)
    if (f.default !== undefined) assert.equal(f.default, DEFAULT_CONFIG[f.key]);
});
test('configuration rejects invalid timezone, booleans and limits', () => {
  for (const value of [
    { timezone: 'Mars/Olympus' },
    { weather_enabled: 'true' },
    { weather_interval: 0 },
    { digest_hour: 24 },
  ])
    assert.throws(() => normalizeConfig(value));
});
test('empty widgets have valid native content in both languages', async (t) => {
  const c = await context(t);
  for (const key of WIDGET_KEYS)
    for (const language of ['fr', 'en'])
      assert.deepEqual(validateWidgetContent(widgetContent(key, c, { language })), [], key);
});
test('populated widgets remain within SDK budgets with long notes and pagination', async (t) => {
  const c = await context(t);
  let id;
  for (let i = 0; i < 10; i++) {
    id = await c.plant({ name: 'N'.repeat(60), notes: 'a'.repeat(1000), location: 'L'.repeat(40) });
    await c.journal.reminder({ plant: id, care: 'water', interval_days: 1 });
  }
  c.advance(DAY);
  for (const key of WIDGET_KEYS)
    for (const language of ['fr', 'en'])
      for (const page of [1, 2, 3])
        assert.deepEqual(
          validateWidgetContent(
            widgetContent(key, c, {
              language,
              settings: { plant: c.journal.externalId(id), page },
            }),
          ),
          [],
          `${key}/${language}/${page}`,
        );
  const list = widgetContent('garden_inventory', c, { settings: { page: 2 } }).components.find(
    (x) => x.type === 'card-list',
  );
  assert.equal(list.items.length, 2);
});
test('widget action completes only selected reminder and rejects a double click', async (t) => {
  const c = await context(t),
    id = await c.plant();
  await c.journal.reminder({ plant: id, care: 'water', interval_days: 1 });
  c.advance(DAY);
  const button = widgetContent('garden_tasks', c).components.find((x) => x.type === 'button');
  await widgetAction(c, 'garden_tasks', button.action.key, button.action.params, {
    values: { note: 'Terre sèche' },
  });
  await assert.rejects(() =>
    widgetAction(c, 'garden_tasks', button.action.key, button.action.params, { values: {} }),
  );
  assert.equal(c.store.snapshot().history.filter((h) => h.kind === 'water').length, 1);
  assert.equal(c.store.snapshot().history.at(-1).note, 'Terre sèche');
});

test('widget forms validate input, refuse missing forms and preserve the selected reminder', async (t) => {
  const c = await context(t),
    id = await c.plant(),
    other = await c.plant({ name: 'Menthe' });
  await c.journal.reminder({ plant: id, care: 'water', interval_days: 1 });
  await c.journal.reminder({ plant: other, care: 'water', interval_days: 1 });
  c.advance(DAY);
  const buttons = widgetContent('garden_tasks', c).components.filter((x) => x.type === 'button');
  const [complete, snooze] = buttons;
  const before = c.store.snapshot();
  for (const button of buttons)
    await assert.rejects(() =>
      widgetAction(c, 'garden_tasks', button.action.key, button.action.params),
    );
  await assert.rejects(() =>
    widgetAction(c, 'garden_tasks', complete.action.key, complete.action.params, {
      values: { note: 'x'.repeat(1001) },
    }),
  );
  for (const days of [0, -1, 1.5, 366, '3'])
    await assert.rejects(() =>
      widgetAction(c, 'garden_tasks', snooze.action.key, snooze.action.params, {
        values: { days },
      }),
    );
  assert.deepEqual(c.store.snapshot(), before);
  await widgetAction(c, 'garden_tasks', snooze.action.key, snooze.action.params, {
    values: { days: 3, plant: other },
  });
  const after = c.store.snapshot();
  assert.equal(after.plants[0].reminders.water.dueAt, new Date(c.clock() + 3 * DAY).toISOString());
  assert.deepEqual(after.plants[1], before.plants[1]);
  assert.equal(after.history.at(-1).kind, 'snoozed');
  assert.equal(after.history.filter((h) => h.kind === 'water').length, 0);
  await assert.rejects(() =>
    widgetAction(c, 'garden_tasks', complete.action.key, complete.action.params, { values: {} }),
  );
});

test('SDK 0.15 fake host exercises discovery, widget form relay, scenes and reconnect', async (t) => {
  const c = await context(t);
  const gladys = createFakeGladys({ selector: 'gladys-garden-journal' });
  const runtime = registerIntegration(gladys, c.store, { clock: c.clock, logger: { warn() {} } });
  t.after(async () => {
    await runtime.close();
    await gladys.disconnect();
  });
  await gladys.connect();
  assert.equal(
    (await gladys.fake.action('add_plant', { name: 'Menthe', location: 'Cuisine' })).success,
    true,
  );
  const device = gladys.fake.discoveredDevices[0];
  assert.ok(device);
  assert.equal(gladys.fake.states.length, 0, 'discovery does not add devices');
  await gladys.fake.deviceCreated(device);
  await gladys.fake.action('set_reminder', {
    plant: device.external_id,
    care: 'water',
    interval_days: 1,
  });
  c.advance(DAY);
  await runtime.tick();
  assert.ok(gladys.fake.states.length > 0);
  const content = widgetContent('garden_tasks', runtime.context);
  assert.deepEqual(validateWidgetContent(content), []);
  const button = content.components.find((x) => x.type === 'button');
  const ack = await gladys.fake.widgetAction(
    'garden_tasks',
    button.action.key,
    button.action.params,
    { settings: {}, values: { note: 'Feuilles vérifiées' } },
  );
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.equal(c.store.snapshot().history.at(-1).note, 'Feuilles vérifiées');
  assert.equal(
    (
      await gladys.fake.widgetAction('garden_tasks', button.action.key, button.action.params, {
        values: {},
      })
    ).success,
    false,
  );
  await runtime.tick();
  const eventCount = gladys.fake.sceneEvents.length;
  assert.equal(
    (await gladys.fake.sceneAction('record_care', { plant: device.external_id, care: 'inspect' }))
      .success,
    true,
  );
  await runtime.tick();
  assert.equal(gladys.fake.sceneEvents.length, eventCount);
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(c.store.snapshot().plants.length, 1);
});
test('scene mutations do not echo care or move events', async (t) => {
  const c = await context(t),
    id = await c.plant();
  assert.deepEqual(
    await runAction(c, 'record_care', { plant: id, care: 'water' }, { scene: true }),
    { updated: true },
  );
  await runAction(
    c,
    'move_plant',
    { plant: id, location: 'Salon', environment: 'inside' },
    { scene: true },
  );
  assert.equal(c.store.snapshot().outbox.length, 0);
});
test('runtime registers real handlers; add/discover/care/widget/reconnect preserve state', async (t) => {
  const c = await context(t),
    gladys = fakeGladys(),
    runtime = registerIntegration(gladys, c.store, { clock: c.clock, logger: { warn() {} } });
  t.after(() => runtime.close());
  await gladys.handlers.events.connected();
  assert.equal(gladys.statuses.at(-1)[0], true);
  await gladys.handlers.actions.add_plant({ name: 'Menthe', location: 'Cuisine' });
  const p = c.store.snapshot().plants[0],
    ref = gladys.externalIds('plant', p.id).device;
  assert.equal(gladys.discoveries.at(-1)[0].external_id, ref);
  await gladys.handlers.actions.set_reminder({ plant: ref, care: 'water', interval_days: 1 });
  c.advance(DAY);
  await runtime.tick();
  assert.equal(gladys.events.filter((e) => e.key === 'care_due').length, 1);
  const content = await gladys.handlers.widgets.garden_tasks({ language: 'fr', settings: {} });
  assert.deepEqual(validateWidgetContent(content), []);
  await gladys.handlers.scenes.record_care({ plant: ref, care: 'water' });
  await runtime.tick();
  assert.equal(gladys.events.filter((e) => e.key === 'care_recorded').length, 0);
  gladys.handlers.events.disconnected();
  await gladys.handlers.events.connected();
  assert.equal(c.store.snapshot().plants.length, 1);
  for (const event of gladys.events) {
    const declaration = manifest.scene_triggers.find((t) => t.key === event.key);
    const allowed = new Set(
      [...(declaration.fields ?? []), ...(declaration.variables ?? [])].map((f) => f.key),
    );
    for (const key of Object.keys(event.data)) assert.ok(allowed.has(key), `${event.key}.${key}`);
  }
});

test('virtual features use supported categories and respect state rate limits', async (t) => {
  const { buildDevices, publishPlantStates } = await import('../src/devices.js');
  const { DEVICE_FEATURE_CATEGORIES } = await import('@gladysassistant/integration-sdk');
  const c = await context(t);
  await c.plant();
  const s = c.store.snapshot(),
    base = s.plants[0];
  s.plants = Array.from({ length: 200 }, (_, i) => ({ ...base, id: `plant-${i}` }));
  const gladys = fakeGladys(),
    devices = buildDevices(gladys, s);
  for (const device of devices)
    for (const feature of device.features)
      assert.ok(Object.values(DEVICE_FEATURE_CATEGORIES).includes(feature.category));
  await gladys.publishDiscoveredDevices(devices);
  await publishPlantStates(gladys, s, c.clock());
  assert.equal(gladys.published.length, 300);
  await publishPlantStates(gladys, s, c.clock());
  assert.equal(gladys.published.length, 300);
  c.advance(60000);
  await publishPlantStates(gladys, s, c.clock());
  assert.equal(gladys.published.length, 400);
  await publishPlantStates(gladys, s, c.clock());
  assert.equal(gladys.published.length, 400);
});

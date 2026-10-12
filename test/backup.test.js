import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { context } from './helpers/context.js';
import { Store } from '../src/store.js';
const exec = promisify(execFile);
test('offline export/import preserves IDs, resets events and backs up previous state', async (t) => {
  const c = await context(t),
    id = await c.plant();
  const file = join(c.store.directory, 'export.json');
  const run = (...args) =>
    exec(process.execPath, ['scripts/backup.mjs', ...args], {
      env: { ...process.env, GARDEN_DATA_DIR: c.store.directory },
    });
  await run('export', file);
  await assert.rejects(() => run('export', file));
  await c.plant({ name: 'Menthe' });
  await run('import', file, '--replace');
  const imported = await new Store(c.store.directory).load();
  assert.equal(imported.snapshot().plants.length, 1);
  assert.equal(imported.snapshot().plants[0].id, id);
  assert.deepEqual(imported.snapshot().outbox, []);
  const backups = await readdir(join(c.store.directory, 'backups'));
  const old = JSON.parse(await readFile(join(c.store.directory, 'backups', backups[0]), 'utf8'));
  assert.equal(old.plants.length, 2);
});
test('invalid backup cannot replace live data or smuggle configuration', async (t) => {
  const c = await context(t);
  await c.plant();
  const before = await readFile(c.store.file, 'utf8'),
    file = join(c.store.directory, 'bad.json');
  await writeFile(
    file,
    JSON.stringify({ ...c.store.snapshot(), weather_api_key: 'should-not-exist' }),
  );
  await assert.rejects(() =>
    exec(process.execPath, ['scripts/backup.mjs', 'import', file, '--replace'], {
      env: { ...process.env, GARDEN_DATA_DIR: c.store.directory },
    }),
  );
  assert.equal(await readFile(c.store.file, 'utf8'), before);
});

import { readFile, stat, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store, MAX_BYTES, validateState } from '../src/store.js';
const [command, file, confirmation] = process.argv.slice(2);
if (
  !['export', 'import'].includes(command) ||
  !file ||
  (command === 'import' && confirmation !== '--replace')
) {
  console.error(
    'Stop the integration first. Usage: GARDEN_DATA_DIR=/data npm run backup -- export /path/backup.json | import /path/backup.json --replace',
  );
  process.exitCode = 1;
} else {
  try {
    const store = await new Store(process.env.GARDEN_DATA_DIR || '/data').load();
    if (resolve(file) === resolve(store.file))
      throw new Error('Choose a file outside journal.json');
    if (command === 'export') {
      const fd = await open(file, 'wx', 0o600);
      try {
        await fd.writeFile(JSON.stringify(store.snapshot(), null, 2) + '\n');
        await fd.sync();
      } finally {
        await fd.close();
      }
    } else {
      if ((await stat(file)).size > MAX_BYTES) throw new Error('Backup too large');
      const data = validateState(JSON.parse(await readFile(file, 'utf8')));
      await store.backup();
      // Operational events/cache belong to the old installation. Do not
      // replay notifications or disclose old house observations on import.
      data.outbox = [];
      data.weather = {};
      data.notices = {};
      data.digestDate = null;
      await store.transaction((s) => {
        for (const key of Object.keys(s)) delete s[key];
        Object.assign(s, data);
      });
    }
    console.log(
      command === 'export'
        ? 'Export complete.'
        : 'Import complete; previous journal saved in backups.',
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

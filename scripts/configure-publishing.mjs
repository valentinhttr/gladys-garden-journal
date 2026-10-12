import { readFile, writeFile } from 'node:fs/promises';
const [owner] = process.argv.slice(2);
if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner ?? '')) {
  console.error(
    'Usage: node scripts/configure-publishing.mjs GITHUB_OWNER (edits local metadata only)',
  );
  process.exitCode = 1;
} else {
  const file = new URL('../gladys-assistant-integration.json', import.meta.url);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  const original = await readFile(file, 'utf8');
  const result = original
    .replace(
      manifest.docker_image,
      `ghcr.io/${owner.toLowerCase()}/gladys-garden-journal:${manifest.version}`,
    )
    .replace(
      manifest.cover_image,
      `https://raw.githubusercontent.com/${owner}/gladys-garden-journal/main/cover.png`,
    );
  await writeFile(file, result);
  console.log(
    'Local publication metadata configured. No repository, image or release was created.',
  );
}

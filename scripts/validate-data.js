// Validate the v2 data files without modifying them. See docs/setup.md.
import path from 'node:path';
import fs from 'fs-extra';
import { dashboardSchema, parseOrThrow, rawGamesSchema } from '../src/lib/model.js';
import { checkTags, loadAnnotations, loadTags } from '../src/process/annotations.js';

try {
  const tags = await loadTags('data/tags.json');
  const annotations = await loadAnnotations('data/annotations.json');
  checkTags(annotations, tags, 'data/annotations.json');
  const dashboard = parseOrThrow(dashboardSchema, await fs.readJson('data/games.json'), 'data/games.json');
  checkTags(dashboard.games, tags, 'data/games.json');

  const rawFiles = (await fs.readdir('data/raw', { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join('data/raw', entry.name))
    .sort();
  for (const file of rawFiles) parseOrThrow(rawGamesSchema, await fs.readJson(file), file);
  console.log(`Validated annotations, tags, dashboard and ${rawFiles.length} raw data files.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

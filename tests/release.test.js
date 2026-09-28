import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolvedCommit, updateWebsite, verifyLock } from '../scripts/update-website.js';

const url = 'git+https://github.com/willbradshaw/gameplot.git';
const sha = 'a'.repeat(40);
const manifest = (tag) => ({ dependencies: { gameplot: `${url}#${tag}` } });
const lockfile = (tag, commit, protocol = url) => ({
  lockfileVersion: 3,
  packages: {
    '': manifest(tag),
    'node_modules/gameplot': { version: tag.slice(1), resolved: `${protocol}#${commit}` },
    'node_modules/unrelated': { version: '1.0.0', integrity: 'unchanged' },
  },
});

test('release lock verification repairs SSH but refuses a wrong commit, source or manifest', () => {
  const lock = lockfile('v2.1.1', sha, 'git+ssh://git@github.com/willbradshaw/gameplot.git');
  const packageJson = { dependencies: { gameplot: 'github:willbradshaw/gameplot#v2.1.1' } };
  lock.packages[''].dependencies.gameplot = packageJson.dependencies.gameplot;
  verifyLock(packageJson, lock, 'v2.1.1', sha);
  assert.equal(packageJson.dependencies.gameplot, `${url}#v2.1.1`);
  assert.equal(lock.packages[''].dependencies.gameplot, `${url}#v2.1.1`);
  assert.equal(lock.packages['node_modules/gameplot'].resolved, `${url}#${sha}`);
  assert.deepEqual(lock.packages['node_modules/unrelated'], { version: '1.0.0', integrity: 'unchanged' });
  assert.throws(() => verifyLock(manifest('v2.1.1'), lock, 'v2.1.1', 'b'.repeat(40)), /different commit/);
  assert.throws(() => verifyLock(manifest('v2.1.0'), lock, 'v2.1.1', sha), /both manifests/);
  assert.throws(
    () => verifyLock(manifest('v2.1.1'), lockfile('v2.1.0', sha), 'v2.1.1', sha),
    /both manifests/,
  );
  lock.packages['node_modules/gameplot'].version = '2.1.0';
  assert.throws(() => verifyLock(manifest('v2.1.1'), lock, 'v2.1.1', sha), /version/);
  for (const value of [undefined, 'https://example.com/a', `${url}#main`, `${url}-other#${sha}`]) {
    assert.throws(() => resolvedCommit(value), /pinned to a commit/);
  }
});

test('website updater compares locked data with the release, normalizes HTTPS and is repeatable', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameplot-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sourceDir = path.join(dir, 'source');
  const websiteDir = path.join(dir, 'website');
  await mkdir(path.join(sourceDir, 'data'), { recursive: true });
  await mkdir(websiteDir);
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
      { cwd: sourceDir, encoding: 'utf8' },
    ).trim();
  git('init', '--quiet');
  const json = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  await json(path.join(sourceDir, 'data/games.json'), { generatedAt: '2026-09-27T12:00:00Z', games: [{}] });
  git('add', '.');
  git('commit', '--quiet', '-m', 'Before');
  const before = git('rev-parse', 'HEAD');
  await json(path.join(sourceDir, 'data/games.json'), {
    generatedAt: '2026-09-28T12:00:00Z',
    games: [{}, {}],
  });
  git('add', '.');
  git('commit', '--quiet', '-m', 'After');
  git('tag', 'v2.1.1');
  const after = git('rev-parse', 'HEAD');
  await json(path.join(websiteDir, 'package.json'), manifest('v2.1.0'));
  await json(path.join(websiteDir, 'package-lock.json'), lockfile('v2.1.0', before));
  const bodyPath = path.join(dir, 'body.md');
  const install = async (cwd, spec) => {
    assert.equal(cwd, websiteDir);
    assert.equal(spec, `${url}#v2.1.1`);
    await json(path.join(cwd, 'package.json'), manifest('v2.1.1'));
    await json(
      path.join(cwd, 'package-lock.json'),
      lockfile('v2.1.1', after, 'git+ssh://git@github.com/willbradshaw/gameplot.git'),
    );
  };
  const options = { sourceDir, websiteDir, tag: 'v2.1.1', bodyPath, install };
  await updateWebsite(options);
  const updated = await readFile(path.join(websiteDir, 'package-lock.json'), 'utf8');
  assert.equal(JSON.parse(updated).packages['node_modules/gameplot'].resolved, `${url}#${after}`);
  const body = await readFile(bodyPath, 'utf8');
  assert.match(body, /releases\/tag\/v2.1.1/);
  assert.match(body, /\| Games \| 1 \| 2 \|/);
  assert.match(body, /2026-09-27T12:00:00Z \| 2026-09-28T12:00:00Z/);
  await updateWebsite(options);
  assert.equal(await readFile(path.join(websiteDir, 'package-lock.json'), 'utf8'), updated);
  assert.match(await readFile(bodyPath, 'utf8'), /\| Games \| 2 \| 2 \|/);
  for (const tag of ['--help', 'main', 'v2.1.1; echo bad', 'v2.1.1\n']) {
    await assert.rejects(
      updateWebsite({ ...options, tag, install: () => assert.fail('must not install') }),
      /release tag/,
    );
  }
});

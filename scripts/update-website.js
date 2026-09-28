import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'willbradshaw/gameplot';
const dependencyUrl = `git+https://github.com/${repository}.git`;
const resolvedPattern =
  /^git\+(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)willbradshaw\/gameplot(?:\.git)?#([a-f0-9]{40})$/;

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

export function resolvedCommit(resolved) {
  const match = resolvedPattern.exec(resolved);
  if (!match) throw new Error('Expected a gameplot GitHub git dependency pinned to a commit in the lockfile');
  return match[1];
}

function dataSummary(sourceDir, commit) {
  const data = JSON.parse(git(sourceDir, 'show', `${commit}:data/games.json`));
  if (
    !Array.isArray(data.games) ||
    typeof data.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.generatedAt))
  ) {
    throw new Error(`Invalid dashboard data at ${commit}`);
  }
  return { count: data.games.length, generatedAt: data.generatedAt };
}

export function verifyLock(packageJson, lock, tag, commit) {
  const spec = `${dependencyUrl}#${tag}`;
  const equivalentSpecs = new Set([
    spec,
    `github:${repository}#${tag}`,
    `git+ssh://git@github.com/${repository}.git#${tag}`,
  ]);
  if (
    !equivalentSpecs.has(packageJson.dependencies?.gameplot) ||
    !equivalentSpecs.has(lock.packages?.['']?.dependencies?.gameplot)
  ) {
    throw new Error('npm did not save the requested release tag in both manifests');
  }
  const entry = lock.packages['node_modules/gameplot'];
  if (resolvedCommit(entry?.resolved) !== commit) {
    throw new Error('npm resolved gameplot to a different commit than the requested release');
  }
  // npm can save GitHub shorthand and an SSH URL even when installation requests HTTPS.
  packageJson.dependencies.gameplot = spec;
  lock.packages[''].dependencies.gameplot = spec;
  entry.resolved = `${dependencyUrl}#${commit}`;
  if (entry.version !== tag.slice(1))
    throw new Error('The installed package version does not match the release tag');
  return lock;
}

export async function updateWebsite({ sourceDir, websiteDir, tag, bodyPath, install = installDependency }) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag))
    throw new Error('Expected a release tag such as v2.1.1');
  const manifestPath = path.join(websiteDir, 'package.json');
  const lockPath = path.join(websiteDir, 'package-lock.json');
  const manifest = await readJson(manifestPath);
  const oldLock = await readJson(lockPath);
  if (!manifest.dependencies?.gameplot) throw new Error('The website must already depend on gameplot');
  const beforeCommit = resolvedCommit(oldLock.packages?.['node_modules/gameplot']?.resolved);
  const afterCommit = git(sourceDir, 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
  const before = dataSummary(sourceDir, beforeCommit);
  const after = dataSummary(sourceDir, afterCommit);
  const spec = `${dependencyUrl}#${tag}`;
  await install(websiteDir, spec);
  const updatedManifest = await readJson(manifestPath);
  const lock = verifyLock(updatedManifest, await readJson(lockPath), tag, afterCommit);
  await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const body = `Update gameplot to [${tag}](https://github.com/${repository}/releases/tag/${tag}).

Dashboard data in \`data/games.json\`:

| | Before | After |
|---|---|---|
| Games | ${before.count} | ${after.count} |
| generatedAt | ${before.generatedAt} | ${after.generatedAt} |

The dependency and resolved commit use HTTPS so deployment does not require a GitHub SSH key.

Review and merge manually; this workflow does not enable auto-merge.
`;
  await writeFile(bodyPath, body);
}

function installDependency(websiteDir, spec) {
  execFileSync(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', spec],
    {
      cwd: websiteDir,
      stdio: 'inherit',
    },
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceDir, websiteDir, tag, bodyPath] = process.argv.slice(2);
  updateWebsite({ sourceDir, websiteDir, tag, bodyPath }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

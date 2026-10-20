// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for small GitHub repositories answered in tests/helpers.ts and below. Each edge case
// of where skills live has a path in ./fixture; fixture/README.md maps them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const REPOSITORY = fileURLToPath(new URL('..', import.meta.url));
const ROOT = pathToFileURL(FIXTURE).href;

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

/** The printed skill whose link is the fixture's `path`: its name line and its `also in` line, if any. */
function entry(path: string): { name: string; also?: string } {
  const lines = fixture.stdout.split('\n');
  const index = lines.indexOf(`  ${ROOT}/${path}`);
  assert.notEqual(index, -1, `${path} is not printed as a skill:\n${fixture.stdout}`);
  const also = lines[index + 1]?.startsWith('  also in ') ? lines[index + 1].slice('  also in '.length) : undefined;
  return { name: lines[index - 1], also };
}

/** Neither printed nor warned about. */
function assertNotCounted(text: string) {
  assert.ok(!fixture.stdout.includes(text), `${text} is printed:\n${fixture.stdout}`);
  assert.ok(!fixture.stderr.includes(text), `${text} is warned about:\n${fixture.stderr}`);
}

function warnings(): string[] {
  return fixture.stderr.split('\n').filter((line) => line.startsWith('warning: '));
}

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every unique skill in an agent folder, sorted by name, linked to its file, with its copies', () => {
  assert.equal(fixture.code, 0, fixture.stderr);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 7 skills',
      'code-review — Review a change before it is merged.',
      `  ${ROOT}/.cursor/skills/review/SKILL.md`,
      "code-style — Follow the project's code style.",
      `  ${ROOT}/.codex/skills/code-style/SKILL.md`,
      '  also in .github/skills/code-style/SKILL.md',
      'commits — Write commit messages the way this repository does.',
      `  ${ROOT}/.agents/skills/commits/SKILL.md`,
      '  also in .claude/skills/commits/SKILL.md, .junie/skills/commits/SKILL.md',
      'commits — Write commit messages for the editor module.',
      `  ${ROOT}/modules/editor/.claude/skills/commits/SKILL.md`,
      'release-checklist',
      `  ${ROOT}/.agents/skills/release-checklist/SKILL.md`,
      'test-runner — Run the tests the way CI does.',
      `  ${ROOT}/.claude/skills/test-runner/SKILL.md`,
      'writing-lint-checks — Write Android Lint checks.',
      `  ${ROOT}/agent/skills/writing-lint-checks/SKILL.md`,
    ].join('\n'),
  );
});

test('a skill kept for both Claude and Codex is counted once, the other folder listed under also in', () => {
  assert.match(entry('.agents/skills/commits/SKILL.md').also ?? '', /(^|, )\.claude\/skills\/commits\/SKILL\.md(,|$)/);
  assert.ok(!fixture.stdout.includes(`  ${ROOT}/.claude/skills/commits/SKILL.md`), 'the Claude copy is printed as a skill of its own');
});

test('copies whose bytes differ are one skill, with a warning naming both paths', () => {
  assert.equal(entry('.codex/skills/code-style/SKILL.md').also, '.github/skills/code-style/SKILL.md');
  const differ = warnings().filter((line) => line.includes('.codex/skills/code-style/SKILL.md'));
  assert.equal(differ.length, 1, fixture.stderr);
  assert.match(differ[0], /\.github\/skills\/code-style\/SKILL\.md/);
  assert.match(differ[0], /differ/);
});

test('a copy that differs only in line endings is a copy, without a warning', () => {
  assert.match(entry('.agents/skills/commits/SKILL.md').also ?? '', /(^|, )\.junie\/skills\/commits\/SKILL\.md$/);
  assert.ok(!fixture.stderr.includes('.junie'), fixture.stderr);
});

test('a shipped copy of a skill is neither counted nor listed as a copy', () => {
  assertNotCounted('plugins/tools');
});

test('the same skill directory in a nested package is a separate skill', () => {
  const editor = entry('modules/editor/.claude/skills/commits/SKILL.md');
  assert.equal(editor.name, 'commits — Write commit messages for the editor module.');
  assert.equal(editor.also, undefined);
});

test('agent/skills without a leading dot is an agent folder', () => {
  assert.equal(entry('agent/skills/writing-lint-checks/SKILL.md').name, 'writing-lint-checks — Write Android Lint checks.');
});

test('skills shipped to users are not counted: plugin resources, plugin skills folders and skills collections', () => {
  for (const name of ['aspect-generator', 'plugins/style/skills/code-style', 'collection']) assertNotCounted(name);
});

test('a skills folder that is not an agent folder is not counted', () => {
  assertNotCounted('deploy');
});

test('a front matter name that is not the directory name is printed, with a warning', () => {
  assert.equal(entry('.cursor/skills/review/SKILL.md').name, 'code-review — Review a change before it is merged.');
  const mismatch = warnings().filter((line) => line.includes('.cursor/skills/review/SKILL.md'));
  assert.equal(mismatch.length, 1, fixture.stderr);
  assert.match(mismatch[0], /code-review/);
});

test('skills under test data directories are neither counted nor warned about', () => {
  for (const name of ['test-data-skill', 'test-data-plugin', 'test-data-fixture']) assertNotCounted(name);
});

test('a skill directory named like test data is counted', () => {
  assert.equal(entry('.claude/skills/test-runner/SKILL.md').name, 'test-runner — Run the tests the way CI does.');
});

test('a SKILL.md inside a skill belongs to it and is not counted', () => {
  assertNotCounted('test-runner/examples');
  assert.ok(!fixture.stdout.split('\n').some((line) => line.startsWith('example')), fixture.stdout);
});

test('only files named exactly SKILL.md are skills', () => {
  assertNotCounted('lowercase');
  assertNotCounted('backup');
});

test('a symlinked agent folder is neither counted nor listed as a copy', () => {
  assertNotCounted('.gemini');
});

test('./fixture warns only about the malformed skill, the differing copies and the mismatched name', () => {
  assert.equal(warnings().length, 3, fixture.stderr);
  assert.ok(warnings().some((line) => /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /.test(line)));
});

test('this repository has no skills of its own: fixture/ is test data, so the count is 0 and the exit code 0', async () => {
  const scanned = await atlas(['scan', REPOSITORY]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^\S+ · 0 skills$/);
});

test('a truncated GitHub tree without GITHUB_TOKEN finds root-level agent folders and warns that nested ones were skipped', async () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const api = 'https://api.github.com/repos/JetBrains/huge';
  // What GitHub answers for a repository whose tree is too large for one answer.
  const huge = replay({
    [api]: { status: 200, body: { full_name: 'JetBrains/huge', default_branch: 'main' } },
    [`${api}/commits/main`]: { status: 200, body: { sha: commit } },
    [`${api}/git/trees/${commit}?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
    [`${api}/git/trees/${commit}`]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          { path: '.claude', mode: '040000', type: 'tree', sha: 'claude' },
          { path: 'plugins', mode: '040000', type: 'tree', sha: 'plugins' },
        ],
      },
    },
    [`${api}/git/trees/claude`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: 'skills' }] },
    },
    [`${api}/git/trees/skills?recursive=1`]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          { path: 'commits', mode: '040000', type: 'tree', sha: 'commits' },
          { path: 'commits/SKILL.md', mode: '100644', type: 'blob', sha: 'file' },
        ],
      },
    },
    [`https://raw.githubusercontent.com/JetBrains/huge/${commit}/.claude/skills/commits/SKILL.md`]: {
      status: 200,
      body: '---\nname: commits\ndescription: Write commit messages.\n---\n',
    },
  });
  const result = await scan(await openGitHub('https://github.com/JetBrains/huge', { fetch: huge }));
  assert.deepEqual(
    result.skills.map((skill) => skill.path),
    ['.claude/skills/commits/SKILL.md'],
  );
  assert.equal(result.warnings.length, 1, result.warnings.join('\n'));
  assert.match(result.warnings[0], /too large/);
  assert.match(result.warnings[0], /nested ones were skipped/);
  assert.match(result.warnings[0], /GITHUB_TOKEN/);
});

test('a /tree/<ref> URL scans that commit from its tree, even with GITHUB_TOKEN', async () => {
  const commit = 'fedcba9876543210fedcba9876543210fedcba98';
  const api = 'https://api.github.com/repos/JetBrains/pinned';
  // What GitHub answers for a tag; there is no code search answer, so a search would fail the scan.
  const pinned = replay({
    [api]: { status: 200, body: { full_name: 'JetBrains/pinned', default_branch: 'main' } },
    [`${api}/commits/v1.0`]: { status: 200, body: { sha: commit } },
    [`${api}/git/trees/${commit}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob', sha: 'file' }] },
    },
    [`https://raw.githubusercontent.com/JetBrains/pinned/${commit}/.claude/skills/commits/SKILL.md`]: {
      status: 200,
      body: '---\nname: commits\ndescription: Write commit messages.\n---\n',
    },
  });
  const result = await scan(await openGitHub('https://github.com/JetBrains/pinned/tree/v1.0', { fetch: pinned, token: 'test' }));
  assert.deepEqual(
    result.skills.map((skill) => `${skill.commit} ${skill.path}`),
    [`${commit} .claude/skills/commits/SKILL.md`],
  );
});

test('an unknown ref → a clear message, exit code 1', async () => {
  const api = 'https://api.github.com/repos/JetBrains/pinned';
  const unknown = replay({
    [api]: { status: 200, body: { full_name: 'JetBrains/pinned', default_branch: 'main' } },
    [`${api}/commits/no-such-ref`]: { status: 404, body: { message: 'Not Found' } },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/pinned/tree/no-such-ref', { fetch: unknown }), {
    message: 'Not found in https://github.com/JetBrains/pinned: no-such-ref',
  });
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('a short rate limit is retried after the wait GitHub asks for, then the scan goes on', async () => {
  const api = 'https://api.github.com/repos/JetBrains/MPS';
  const answered: string[] = [];
  let limited = true;
  // Code-search-style secondary limit: one 429 that asks for no wait, then the answer.
  const once = replay({
    [`${api}/commits/master`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${api}/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: { status: 200, body: { truncated: false, tree: [] } },
  });
  const fetch = async (url: string) => {
    answered.push(url);
    if (url !== api) return once(url);
    if (limited) {
      limited = false;
      return new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit. Please wait.' }), {
        status: 429,
        headers: { 'retry-after': '0' },
      });
    }
    return new Response(JSON.stringify({ full_name: 'JetBrains/MPS', default_branch: 'master' }), { status: 200 });
  };
  const source = await openGitHub('https://github.com/JetBrains/MPS/tree/master', { fetch });
  assert.equal(source.repository.commit, EXAMPLE_COMMIT);
  assert.deepEqual(answered.slice(0, 2), [api, api]);
});

test('a rate limit that asks for a longer wait → the rate-limit message, without waiting', async () => {
  let requests = 0;
  const fetch = async () => {
    requests++;
    return new Response(JSON.stringify({ message: 'try again in 60s' }), { status: 429 });
  };
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch, token: 'test' }), {
    message: 'GitHub rate limit reached; try again in a minute',
  });
  assert.equal(requests, 1);
});

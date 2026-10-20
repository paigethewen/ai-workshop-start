// The organization scan in spec/cli.md, on what the real command prints for small GitHub
// organizations answered below and in tests/helpers.ts: `scan https://github.com/<owner>` without a repository.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openGitHubOrganization, type Fetch } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { ACME, API, atlas, listed, RAW, repository, skill } from './helpers.ts';

/** `skill-atlas scan <url>`, with GitHub answering from `recording` and a token, as code search would want. */
function scanOrganization(url: string, fetch: Fetch) {
  return atlas(['scan', url], { openOrganization: (input) => openGitHubOrganization(input, { fetch, token: 'test' }) });
}

test('an owner URL without a repository counts the repositories with skills, then each one with its count, most first', async () => {
  const scanned = await scanOrganization('https://github.com/acme', replay(ACME));
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['Acme · 2 of 4 repositories with skills', 'Acme/app · 2 skills', 'Acme/tools · 1 skill'].join('\n'));
});

test('an organization scan does not scan forks', async () => {
  const asked: string[] = [];
  const recorded = replay(ACME);
  await scanOrganization('https://github.com/acme', (url, init) => (asked.push(url), recorded(url, init)));
  assert.ok(!asked.some((url) => url.includes('Acme/upstream')), asked.join('\n'));
});

test('an organization is scanned from each repository tree, even with GITHUB_TOKEN', async () => {
  const asked: string[] = [];
  const recorded = replay(ACME);
  await scanOrganization('https://github.com/acme', (url, init) => (asked.push(url), recorded(url, init)));
  assert.ok(!asked.some((url) => url.includes('/search/')), asked.join('\n'));
});

test('a repository that cannot be scanned is a warning naming it, and the scan goes on', async () => {
  const scanned = await scanOrganization('https://github.com/acme', replay(ACME));
  assert.equal(scanned.code, 0);
  assert.equal(scanned.stderr, 'warning: Acme/empty: GitHub answered 409 for https://api.github.com/repos/Acme/empty/commits/main: Git Repository is empty.');
});

test("a repository's warnings are named after it", async () => {
  const mismatched = replay({
    [`${API}/users/Acme`]: { status: 200, body: { login: 'Acme' } },
    [`${API}/users/Acme/repos?per_page=100&page=1`]: { status: 200, body: [listed('Acme/app')] },
    ...repository('Acme/app', 'a'.repeat(40), { '.claude/skills/commits/SKILL.md': skill('commit-messages') }),
  });
  const scanned = await scanOrganization('https://github.com/Acme', mismatched);
  assert.equal(scanned.stdout, ['Acme · 1 of 1 repository with skills', 'Acme/app · 1 skill'].join('\n'));
  assert.equal(
    scanned.stderr,
    'warning: Acme/app: .claude/skills/commits/SKILL.md: the front matter name commit-messages is not the directory name commits',
  );
});

test('a truncated tree in an organization scan says to scan that repository alone', async () => {
  const commit = 'd'.repeat(40);
  const huge = replay({
    [`${API}/users/Acme`]: { status: 200, body: { login: 'Acme' } },
    [`${API}/users/Acme/repos?per_page=100&page=1`]: { status: 200, body: [listed('Acme/huge')] },
    [`${API}/repos/Acme/huge/commits/main`]: { status: 200, body: { sha: commit } },
    [`${API}/repos/Acme/huge/git/trees/${commit}?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
    [`${API}/repos/Acme/huge/git/trees/${commit}`]: { status: 200, body: { truncated: false, tree: [] } },
  });
  const scanned = await scanOrganization('https://github.com/Acme', huge);
  assert.equal(scanned.stdout, 'Acme · 0 of 1 repository with skills');
  assert.match(scanned.stderr, /^warning: Acme\/huge: the tree is too large to list at once; .* nested ones were skipped \(scan this repository alone, with GITHUB_TOKEN, to search everywhere\)$/);
});

test("an owner's repositories are listed past the first page of 100", async () => {
  const forks = Array.from({ length: 100 }, (_, index) => listed(`Acme/fork-${index}`, true));
  const paged = replay({
    [`${API}/users/Acme`]: { status: 200, body: { login: 'Acme' } },
    [`${API}/users/Acme/repos?per_page=100&page=1`]: { status: 200, body: forks },
    [`${API}/users/Acme/repos?per_page=100&page=2`]: { status: 200, body: [listed('Acme/tools')] },
    ...repository('Acme/tools', 'b'.repeat(40), { '.cursor/skills/lint/SKILL.md': skill('lint') }),
  });
  const scanned = await scanOrganization('https://github.com/Acme', paged);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['Acme · 1 of 1 repository with skills', 'Acme/tools · 1 skill'].join('\n'));
});

test('an owner without repositories → 0 of 0, exit code 0', async () => {
  const empty = replay({
    [`${API}/users/Nobody-home`]: { status: 200, body: { login: 'Nobody-home' } },
    [`${API}/users/Nobody-home/repos?per_page=100&page=1`]: { status: 200, body: [] },
  });
  const scanned = await scanOrganization('github.com/Nobody-home/', empty);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, 'Nobody-home · 0 of 0 repositories with skills');
});

test('an unknown owner → a clear message, exit code 1', async () => {
  const unknown = replay({ [`${API}/users/no-such-owner`]: { status: 404, body: { message: 'Not Found' } } });
  const scanned = await scanOrganization('https://github.com/no-such-owner', unknown);
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(scanned.stderr, 'Organization or user not found: https://github.com/no-such-owner');
});

test('a rate limit stops the whole organization scan: the message, exit code 1', async () => {
  const limited = replay({
    ...ACME,
    [`${API}/repos/Acme/tools/commits/main`]: { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  });
  const scanned = await scanOrganization('https://github.com/acme', limited);
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(scanned.stderr, 'GitHub rate limit reached; try again in a minute');
});

test('a rate limit on a raw file stops the whole organization scan: the message, exit code 1', async () => {
  const limited = replay({
    ...ACME,
    [`${RAW}/Acme/app/${'a'.repeat(40)}/.claude/skills/release/SKILL.md`]: { status: 429, body: '429: Too Many Requests' },
  });
  const scanned = await scanOrganization('https://github.com/acme', limited);
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(scanned.stderr, 'GitHub rate limit reached; try again in a minute');
});

test('GitHub out of reach stops the whole organization scan, exit code 1', async () => {
  const { [`${API}/repos/Acme/docs/commits/main`]: _, ...unanswered } = ACME;
  const scanned = await scanOrganization('https://github.com/acme', replay(unanswered));
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stderr, 'Cannot reach GitHub: not recorded: https://api.github.com/repos/Acme/docs/commits/main');
});

test('a repository URL is still one repository, not an organization', async () => {
  const scanned = await atlas(['scan', 'https://github.com/JetBrains/example']);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^JetBrains\/example · 1 skill\n/);
});

// The organization scan in spec/cli.md, on what the real command prints for small GitHub
// organizations answered below and in tests/helpers.ts: `scan https://github.com/<owner>` without a repository.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openGitHubOrganization, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
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

/**
 * An owner, Many, of `count` repositories, each with one skill, or forks, which are not scanned; its
 * listing pages and repository count as GitHub answers them.
 */
function many(count: number, { publicRepos = count, forks = false } = {}): Recording {
  const names = Array.from({ length: count }, (_, index) => `Many/repo-${String(index).padStart(3, '0')}`);
  const recording: Recording = { [`${API}/users/Many`]: { status: 200, body: { login: 'Many', public_repos: publicRepos } } };
  for (let page = 0; page * 100 < count || page === 0; page++) {
    recording[`${API}/users/Many/repos?per_page=100&page=${page + 1}`] = {
      status: 200,
      body: names.slice(page * 100, page * 100 + 100).map((id) => listed(id, forks)),
    };
  }
  for (const id of names) Object.assign(recording, repository(id, 'e'.repeat(40), { '.claude/skills/lint/SKILL.md': skill('lint') }));
  return recording;
}

/** A fetch that answers after `delay` ms and notes each request: its URL, when it started, and how many were in flight. */
function watched(fetch: Fetch, delay = 20) {
  const asked: { url: string; at: number }[] = [];
  let inFlight = 0;
  let peak = 0;
  const watching: Fetch = async (url, init) => {
    asked.push({ url, at: Date.now() });
    peak = Math.max(peak, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await fetch(url, init);
    } finally {
      inFlight--;
    }
  };
  return { fetch: watching, asked, peak: () => peak };
}

test('an organization scan asks two API requests a repository, its commit and its tree, besides the listing', async () => {
  const github = watched(replay(many(30)), 0);
  const scanned = await scanOrganization('https://github.com/Many', github.fetch);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^Many · 30 of 30 repositories with skills\n/);
  const api = github.asked.filter(({ url }) => url.startsWith(API));
  assert.equal(api.length, 2 + 30 * 2, api.map(({ url }) => url).join('\n'));
});

test('an organization scan scans many repositories at once', async () => {
  const github = watched(replay(many(30)));
  await scanOrganization('https://github.com/Many', github.fetch);
  const commits = github.asked.filter(({ url }) => url.endsWith('/commits/main'));
  const first = commits[0].at;
  assert.ok(commits.filter(({ at }) => at - first < 15).length >= 16, 'the first 16 repositories start together');
  assert.ok(github.peak() >= 16, `peak ${github.peak()} in flight`);
});

test("an organization scan's API requests are paced: 60 at once, then 14 a second", async () => {
  const github = watched(replay(many(40)), 0);
  const start = Date.now();
  await scanOrganization('https://github.com/Many', github.fetch);
  const api = github.asked.filter(({ url }) => url.startsWith(API));
  assert.equal(api.length, 82);
  for (const elapsed of [0, 500, 1000]) {
    const started = api.filter(({ at }) => at - start <= elapsed + 50).length;
    assert.ok(started <= 60 + Math.ceil((14 * (elapsed + 50)) / 1000), `${started} started by ${elapsed} ms`);
  }
  assert.ok(Date.now() - start >= ((82 - 60) / 14) * 1000 - 100, 'the requests past the first 60 wait their turn');
});

test("a short pause GitHub asks for holds every repository's requests", async () => {
  const recording = many(20);
  const limited = `${API}/repos/Many/repo-000/commits/main`;
  let answered = 0;
  let pausedAt = 0;
  const recorded = replay(recording);
  const github = watched(async (url, init) => {
    if (url === limited && answered++ === 0) {
      pausedAt = Date.now();
      return new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), { status: 403, headers: { 'retry-after': '1' } });
    }
    return recorded(url, init);
  });
  const scanned = await scanOrganization('https://github.com/Many', github.fetch);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^Many · 20 of 20 repositories with skills\n/);
  const held = github.asked.filter(({ url, at }) => url.startsWith(API) && at > pausedAt && at < pausedAt + 950);
  assert.deepEqual(held, [], 'no API request starts during the pause');
});

test("the listing's pages are asked for at once, as many as the owner's repository count says", async () => {
  const github = watched(replay(many(250, { forks: true })));
  await scanOrganization('https://github.com/Many', github.fetch);
  const pages = github.asked.filter(({ url }) => url.includes('/users/Many/repos?'));
  assert.equal(pages.length, 3);
  assert.ok(pages[2].at - pages[0].at < 15, 'the three pages start together');
});

test('a repository count that lags the listing: the pages past it are still asked for while the last is full', async () => {
  const github = watched(replay(many(150, { publicRepos: 40, forks: true })), 0);
  const scanned = await scanOrganization('https://github.com/Many', github.fetch);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.deepEqual(
    github.asked.map(({ url }) => url),
    [`${API}/users/Many`, `${API}/users/Many/repos?per_page=100&page=1`, `${API}/users/Many/repos?per_page=100&page=2`],
  );
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

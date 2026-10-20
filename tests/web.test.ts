// The decisions in spec/web.md, checked on what the web view's server answers for ./fixture, for
// JetBrains/example and for the Acme organization, as tests/helpers.ts answers them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { openGitHubOrganization, parseGitHubOwner, type Fetch } from '../src/core/github.ts';
import type { Organization } from '../src/core/organization.ts';
import { replay } from '../src/core/replay.ts';
import type { Source } from '../src/core/scan.ts';
import { createWebServer, listen, type WebOrganization, type WebScan } from '../src/web/server.ts';
import { ACME, API, atlas, CLI, EXAMPLE_COMMIT, FIXTURE, open, openOrganization } from './helpers.ts';

/** A web view on a free port, closed after the test. */
async function webView(
  t: { after(fn: () => void): void },
  openSource = open,
  openOwner: (input: string) => Promise<Organization> | undefined = openOrganization,
) {
  const server = createWebServer({ open: openSource, openOrganization: openOwner });
  const url = await listen(server, 0);
  t.after(() => server.close());
  return { url, get: (path: string, headers?: Record<string, string>) => fetch(new URL(path, url), { headers }) };
}

async function scanned(t: { after(fn: () => void): void }, repo: string, openSource = open): Promise<WebScan> {
  const response = await (await webView(t, openSource)).get(`/api/scan?repo=${encodeURIComponent(repo)}`);
  assert.equal(response.status, 200);
  return response.json() as Promise<WebScan>;
}

/** What the CLI opens for an owner URL, with GitHub answering from `fetch`. */
function owner(fetch: Fetch) {
  return (input: string) => (parseGitHubOwner(input) ? openGitHubOrganization(input, { fetch, token: 'test' }) : undefined);
}

async function scannedOrganization(t: { after(fn: () => void): void }, url: string, fetch: Fetch) {
  const view = await webView(t, open, owner(fetch));
  return view.get(`/api/scan?repo=${encodeURIComponent(url)}`);
}

/** One SKILL.md, in a repository of its own. */
function oneSkill(text: string): () => Promise<Source> {
  const path = '.claude/skills/x/SKILL.md';
  return async () => ({
    repository: { id: 'local', organization: 'local', name: 'local', url: 'file:///local', commit: '' },
    paths: [path],
    warnings: [],
    read: async (asked) => (asked === path ? new TextEncoder().encode(text) : undefined),
  });
}

test('the web view lists the same skills, in the same order and with the same warnings, as the CLI prints', async (t) => {
  const web = await scanned(t, FIXTURE);
  const cli = await atlas(['scan', FIXTURE]);
  assert.equal(web.repository.id, 'fixture');
  assert.equal(cli.stdout.split('\n')[0], `fixture · ${web.skills.length} skills`);
  for (const skill of web.skills) assert.ok(cli.stdout.includes(`  ${skill.link}`), `${skill.link} is not printed:\n${cli.stdout}`);
  assert.deepEqual(web.skills.map((skill) => skill.link), cli.stdout.split('\n').filter((line) => /^ {2}file:/.test(line)).map((line) => line.trim()));
  assert.deepEqual(web.warnings.map((warning) => `warning: ${warning}`), cli.stderr.split('\n'));
});

test('each skill comes with its SKILL.md: the file as it is, its copies, its other front matter keys, its body as HTML', async (t) => {
  const web = await scanned(t, FIXTURE);
  const commits = web.skills.find((skill) => skill.path === '.agents/skills/commits/SKILL.md');
  assert.ok(commits);
  assert.equal(commits.source, readFileSync(join(FIXTURE, commits.path), 'utf8'));
  assert.deepEqual(commits.copies, ['.claude/skills/commits/SKILL.md', '.junie/skills/commits/SKILL.md']);
  assert.match(commits.html, /^<h1>Commits<\/h1>/);
  assert.ok(!commits.html.includes('description:'), 'the front matter is not part of the body');

  const properties = await scanned(t, 'local', oneSkill('---\nname: x\ndescription: X.\nlicense: MIT\n---\nBody\n'));
  assert.deepEqual(properties.skills[0].properties, { license: 'MIT' });
});

test('a GitHub skill links to its SKILL.md at the scanned commit', async (t) => {
  const web = await scanned(t, 'https://github.com/JetBrains/example');
  assert.deepEqual(web.repository, { id: 'JetBrains/example', url: 'https://github.com/JetBrains/example', commit: EXAMPLE_COMMIT });
  assert.deepEqual(web.skills.map((skill) => skill.link), [
    `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
  ]);
});

test("a SKILL.md's own HTML is shown as text, and links that are not to the web are dropped", async (t) => {
  const web = await scanned(t, 'local', oneSkill('---\nname: x\n---\n<script>alert(1)</script>\n\n[ok](https://example.com) [bad](javascript:alert(1)) <img src=x onerror=alert(1)>\n'));
  const { html } = web.skills[0];
  assert.ok(!/<script|<img|javascript:/i.test(html), html);
  assert.match(html, / bad /);
  assert.match(html, /&#60;script&#62;/);
  assert.match(html, /<a href="https:\/\/example\.com">ok<\/a>/);
});

test('a repository that cannot be scanned → 400 and the message the CLI prints', async (t) => {
  const view = await webView(t);
  const missing = await view.get(`/api/scan?repo=${encodeURIComponent(join(FIXTURE, 'no-such-directory'))}`);
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { error: string }).error, /^Not a GitHub URL or a readable directory: .*no-such-directory$/);

  const empty = await view.get('/api/scan?repo=');
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: 'Enter a GitHub URL or a directory' });
});

test('an owner URL lists the same repositories, counts, order and warnings as the CLI prints', async (t) => {
  const response = await scannedOrganization(t, 'https://github.com/acme', replay(ACME));
  assert.equal(response.status, 200);
  const web = (await response.json()) as WebOrganization;
  const cli = await atlas(['scan', 'https://github.com/acme'], { openOrganization: owner(replay(ACME)) });
  assert.equal(cli.code, 0, cli.stderr);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  assert.deepEqual(
    [
      `${web.organization.id} · ${web.repositories.length} of ${plural(web.total, 'repository', 'repositories')} with skills`,
      ...web.repositories.map((repository) => `${repository.id} · ${plural(repository.skills.length, 'skill', 'skills')}`),
    ],
    cli.stdout.split('\n'),
  );
  assert.deepEqual(web.warnings.map((warning) => `warning: ${warning}`), cli.stderr.split('\n'));
  assert.deepEqual(web.organization, { id: 'Acme', url: 'https://github.com/Acme' });
  assert.equal(web.total, 4, 'the fork is neither scanned nor counted');
});

test("each repository of an organization comes with its skills' names and a URL that scans it alone", async (t) => {
  const web = (await (await scannedOrganization(t, 'https://github.com/acme', replay(ACME))).json()) as WebOrganization;
  assert.deepEqual(web.repositories, [
    { id: 'Acme/app', url: 'https://github.com/Acme/app', commit: 'a'.repeat(40), skills: ['commits', 'release'] },
    { id: 'Acme/tools', url: 'https://github.com/Acme/tools', commit: 'b'.repeat(40), skills: ['lint'] },
  ]);
  const app = await scanned(t, 'https://github.com/JetBrains/example');
  assert.equal(app.repository.id, 'JetBrains/example', 'a repository URL is still one repository');
});

test('an organization without repositories with skills → 0 of N, and an empty list', async (t) => {
  const empty = replay({
    [`${API}/users/Nobody-home`]: { status: 200, body: { login: 'Nobody-home' } },
    [`${API}/users/Nobody-home/repos?per_page=100&page=1`]: { status: 200, body: [] },
  });
  const response = await scannedOrganization(t, 'https://github.com/Nobody-home', empty);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    organization: { id: 'Nobody-home', url: 'https://github.com/Nobody-home' },
    total: 0,
    repositories: [],
    warnings: [],
  });
});

test('an organization that cannot be scanned → 400 and the message the CLI prints', async (t) => {
  const unknown = replay({ [`${API}/users/no-such-owner`]: { status: 404, body: { message: 'Not Found' } } });
  const missing = await scannedOrganization(t, 'https://github.com/no-such-owner', unknown);
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: 'Organization or user not found: https://github.com/no-such-owner' });

  const limited = replay({
    ...ACME,
    [`${API}/repos/Acme/tools/commits/main`]: { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  });
  const stopped = await scannedOrganization(t, 'https://github.com/acme', limited);
  assert.equal(stopped.status, 400);
  assert.deepEqual(await stopped.json(), { error: 'GitHub rate limit reached; try again in a minute' });
});

test('the page is served with a policy that runs only its own scripts', async (t) => {
  const view = await webView(t);
  const page = await view.get('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  const html = await page.text();
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.match(html, /<main id="organization"/);
  assert.equal((await view.get('/app.js')).status, 200);
  assert.equal((await view.get('/style.css')).status, 200);
  assert.equal((await view.get('/no-such-file')).status, 404);
});

test('the web view answers only requests addressed to localhost', async (t) => {
  const view = await webView(t);
  // fetch sets Host from the URL; a rebound name keeps its own.
  const { request } = await import('node:http');
  const status = await new Promise<number>((resolve, reject) => {
    const url = new URL('/api/scan?repo=.', view.url);
    request({ host: url.hostname, port: url.port, path: url.pathname + url.search, headers: { Host: 'attacker.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    }).on('error', reject).end();
  });
  assert.equal(status, 403);
});

test('serve prints the URL of the web view and keeps running; a bad port → usage, exit code 1', async () => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      child.stdout.on('data', (data: Buffer) => {
        const match = /^Skill Atlas web view: (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(String(data));
        if (match) resolve(match[1]);
      });
      child.on('exit', (code) => reject(new Error(`serve exited with ${code}`)));
    });
    assert.equal((await fetch(url)).status, 200);
  } finally {
    child.kill();
  }

  for (const args of [['--port', 'x'], ['--port', '70000'], ['--port'], ['4173']]) {
    const result = await atlas(['serve', ...args]);
    assert.deepEqual([result.code, result.stderr], [1, 'Usage: skill-atlas serve [--port <port>]'], args.join(' '));
  }
});

test('a port in use → a clear message', async (t) => {
  const busy: Server = createServer();
  const url = await listen(busy, 0);
  t.after(() => busy.close());
  const port = Number(new URL(url).port);
  await assert.rejects(listen(createWebServer({ open }), port), { message: `Port ${port} is in use; try --port <another port>` });
});

test('serve in the browser terminal → it runs from the command line', async () => {
  assert.equal(await createBrowserBackend().run('skill-atlas serve'), 'The web view runs from the command line: ./skill-atlas serve');
});

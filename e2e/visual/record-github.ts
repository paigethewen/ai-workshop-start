// node e2e/visual/record-github.ts: GitHub's answers for what the visual tests scan, recorded once into
// recordings/<name>.json, so every run shows the same data, offline. Needs GITHUB_TOKEN.
// Run it again only to move the tests to newer data: every screenshot changes with it.
import { writeFile } from 'node:fs/promises';
import { openGitHub, openGitHubOrganization, type Fetch } from '../../src/core/github.ts';
import type { Recording } from '../../src/core/replay.ts';
import { scanForWeb, scanOrganizationForWeb } from '../../src/web/server.ts';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Set GITHUB_TOKEN: GITHUB_TOKEN=$(gh auth token) node e2e/visual/record-github.ts');
  process.exit(1);
}

/** The keys src/core/github.ts reads from GitHub's answers: the rest is left out, so the files stay small. */
const READ = new Set(['sha', 'full_name', 'default_branch', 'fork', 'login', 'total_count', 'items', 'path', 'truncated', 'tree', 'mode', 'type', 'message']);

function slim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(slim);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => READ.has(key)).map(([key, item]) => [key, slim(item)]));
}

/** The real fetch, keeping each answer; a recursive tree keeps only what may be a SKILL.md. */
function recorder(recording: Recording): Fetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    const text = await response.clone().text();
    let body: unknown = text;
    if (url.startsWith('https://api.github.com/')) {
      body = slim(JSON.parse(text));
      if (url.endsWith('?recursive=1') && response.ok) {
        const tree = body as { tree: { path: string }[] };
        tree.tree = tree.tree.filter((item) => /skill\.md/i.test(item.path));
      }
    }
    recording[url] = { status: response.status, body };
    return response;
  };
}

async function repository(name: string, url: string) {
  const recording: Recording = {};
  const open = (input: string) => openGitHub(input, { fetch: recorder(recording), token });
  const scan = await scanForWeb(url, { open });
  await save(name, recording);
  console.log(`${name}: ${scan.repository.id} at ${scan.repository.commit}, ${scan.skills.length} skills`);
}

/** The organization, and each of its repositories with skills as the page opens it: with its own scan. */
async function organization(name: string, url: string) {
  const recording: Recording = {};
  const fetch = recorder(recording);
  const result = await scanOrganizationForWeb(await openGitHubOrganization(url, { fetch, token }));
  for (const { url } of result.repositories) await scanForWeb(url, { open: (input) => openGitHub(input, { fetch, token }) });
  await save(name, recording);
  console.log(`${name}: ${result.repositories.length} of ${result.total} repositories with skills`);
}

async function save(name: string, recording: Recording) {
  const sorted = Object.fromEntries(Object.entries(recording).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(new URL(`recordings/${name}.json`, import.meta.url), `${JSON.stringify(sorted, null, 1)}\n`);
}

await repository('kotlin', 'https://github.com/JetBrains/kotlin');
await organization('modelcontextprotocol', 'https://github.com/modelcontextprotocol');

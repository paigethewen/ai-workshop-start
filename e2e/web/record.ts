// GITHUB_TOKEN=... node e2e/web/record.ts: scans what the web tests enter, on live GitHub, and saves GitHub's
// answers as e2e/web/github.json, which serve.ts replays. Run it again only to change the tests' data: the
// screenshots change with it. Trees keep only what the scan reads, so the recording stays small.
import { writeFile } from 'node:fs/promises';
import { openGitHub, openGitHubOrganization, parseGitHubOwner, parseGitHubUrl, type Fetch } from '../../src/core/github.ts';
import { AGENT_FOLDERS } from '../../src/core/find.ts';
import type { Recording } from '../../src/core/replay.ts';
import { createWebServer, listen, type WebOrganization } from '../../src/web/server.ts';
import { ORGANIZATION, REPOSITORY } from './serve.ts';

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('set GITHUB_TOKEN: the scans read live GitHub, the organization from many repositories');

const recording: Recording = {};
const recorded: Fetch = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.clone().text();
  recording[url] = { status: response.status, body: url.startsWith('https://api.github.com/') ? (response.ok ? trim(url, JSON.parse(text)) : JSON.parse(text)) : text };
  return response;
};

/** Only what the scan reads: the paths of skills and of the folders that lead to them, the repositories' names. */
function trim(url: string, body: any): unknown {
  if (Array.isArray(body)) return body.map(({ full_name, default_branch, fork }) => ({ full_name, default_branch, fork }));
  if (url.includes('/search/code?')) return { total_count: body.total_count, items: body.items.map(({ path }: any) => ({ path })) };
  if (url.includes('/git/trees/')) {
    const kept = (item: any) => item.path.endsWith('SKILL.md') || (item.type === 'tree' && [...AGENT_FOLDERS, 'skills'].includes(item.path));
    return { truncated: body.truncated, tree: body.tree.filter(kept).map(({ path, mode, type, sha }: any) => ({ path, mode, type, sha })) };
  }
  if (url.includes('/commits/')) return { sha: body.sha };
  if (url.includes('/users/')) return { login: body.login, public_repos: body.public_repos };
  if (body.full_name) return { full_name: body.full_name, default_branch: body.default_branch };
  return body;
}

const open = (input: string) => openGitHub(input, { fetch: recorded, token });
const openOrganization = (input: string) => (parseGitHubOwner(input) ? openGitHubOrganization(input, { fetch: recorded, token }) : undefined);
const server = createWebServer({ open: (input) => (parseGitHubUrl(input) ? open(input) : Promise.reject(new Error(input))), openOrganization });
const base = await listen(server, 0);
const scan = async (repo: string): Promise<unknown> => {
  const response = await fetch(`${base}api/scan?repo=${encodeURIComponent(repo)}`);
  if (!response.ok) throw new Error(`${repo}: ${response.status} ${await response.text()}`);
  return response.json();
};
try {
  await scan(REPOSITORY);
  // The organization's first repository is the one the test opens, with a scan of its own.
  const organization = (await scan(ORGANIZATION)) as WebOrganization;
  await scan(organization.repositories[0].url);
} finally {
  server.close();
}
const sorted = Object.fromEntries(Object.entries(recording).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(new URL('github.json', import.meta.url), `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`e2e/web/github.json: ${Object.keys(sorted).length} answers`);

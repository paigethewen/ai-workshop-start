// node e2e/web/serve.ts <port>: the web view as `./skill-atlas serve` runs it, with a token, but GitHub answering
// from github.json, as record.ts saved it, a little later, as live: the tests see the same data on every run, and never the network.
import { readFileSync } from 'node:fs';
import { openGitHub, openGitHubOrganization, parseGitHubOwner, parseGitHubUrl, type Fetch } from '../../src/core/github.ts';
import { replay, type Recording } from '../../src/core/replay.ts';
import { openDirectory } from '../../src/local.ts';
import { createWebServer, listen } from '../../src/web/server.ts';

/** What the web tests scan on GitHub: a large repository, through code search, and an organization. */
export const REPOSITORY = 'https://github.com/JetBrains/kotlin';
export const ORGANIZATION = 'https://github.com/modelcontextprotocol';

/** How long GitHub takes to answer, as live, so a scan in progress shows: an organization's, about three seconds. */
const LATENCY = 200;

if (import.meta.main) {
  const recording: Recording = JSON.parse(readFileSync(new URL('github.json', import.meta.url), 'utf8'));
  const replayed = replay(recording);
  const fetch: Fetch = (url, init) => new Promise((resolve) => setTimeout(resolve, LATENCY)).then(() => replayed(url, init));
  const github = { fetch, token: 'replayed' };
  const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, github) : openDirectory(input));
  const openOrganization = (input: string) => (parseGitHubOwner(input) ? openGitHubOrganization(input, github) : undefined);
  console.log(`Skill Atlas web view: ${await listen(createWebServer({ open, openOrganization }), Number(process.argv[2]))}`);
}

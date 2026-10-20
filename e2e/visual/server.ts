// node e2e/visual/server.ts [--port <port>]: the web view, as `./skill-atlas serve` runs it, with GitHub
// answering from recordings/: the same data on every run, offline. A GitHub request not recorded fails.
import { readdirSync, readFileSync } from 'node:fs';
import { openGitHub, openGitHubOrganization, parseGitHubOwner, parseGitHubUrl } from '../../src/core/github.ts';
import { replay, type Recording } from '../../src/core/replay.ts';
import { openDirectory } from '../../src/local.ts';
import { createWebServer, listen } from '../../src/web/server.ts';

const recordings = new URL('recordings/', import.meta.url);
const recording: Recording = Object.assign(
  {},
  ...readdirSync(recordings).map((file) => JSON.parse(readFileSync(new URL(file, recordings), 'utf8')) as Recording),
);
const fetch = replay(recording);
// Recorded with a token: the same requests, code search among them, as a scan with GITHUB_TOKEN makes.
const token = 'recorded';
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input));
const openOrganization = (input: string) => (parseGitHubOwner(input) ? openGitHubOrganization(input, { fetch, token }) : undefined);

const at = process.argv.indexOf('--port');
const port = at === -1 ? 0 : Number(process.argv[at + 1]);
console.log(`Skill Atlas web view: ${await listen(createWebServer({ open, openOrganization }), port)}`);

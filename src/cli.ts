#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr; or the web view, `serve`. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, openGitHubOrganization, parseGitHubOwner, parseGitHubUrl } from './core/github.ts';
import { openDirectory } from './local.ts';
import { createWebServer, listen } from './web/server.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input));
const openOrganization = (input: string) => (parseGitHubOwner(input) ? openGitHubOrganization(input, { fetch, token }) : undefined);

process.exitCode = await run(process.argv.slice(2), {
  open,
  openOrganization,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  // The server keeps the process running until Ctrl+C.
  serve: (port) => listen(createWebServer({ open, openOrganization }), port),
});

// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below; and ACME, a small
// organization, as GitHub answers it.
import { fileURLToPath } from 'node:url';
import { run, type Context } from '../src/commands.ts';
import { openGitHub, openGitHubOrganization, parseGitHubOwner, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

const github = replay(EXAMPLE);

/** What the CLI opens; with a token, through code search, as EXAMPLE answers it. */
export const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input));

/** What the CLI opens for an owner URL without a repository. */
export const openOrganization = (input: string) =>
  parseGitHubOwner(input) ? openGitHubOrganization(input, { fetch: github, token: 'test' }) : undefined;

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE unless `context` says otherwise. */
export async function atlas(args: string[], context: Partial<Context> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    openOrganization,
    ...context,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

export const API = 'https://api.github.com';
export const RAW = 'https://raw.githubusercontent.com';

/** A repository in an owner's list. */
export function listed(id: string, fork = false) {
  return { full_name: id, default_branch: 'main', fork };
}

/** What GitHub answers for a repository at `commit` whose tree holds `files`, path → SKILL.md text. */
export function repository(id: string, commit: string, files: Record<string, string>): Recording {
  const recording: Recording = {
    [`${API}/repos/${id}/commits/main`]: { status: 200, body: { sha: commit } },
    [`${API}/repos/${id}/git/trees/${commit}?recursive=1`]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          { path: 'README.md', mode: '100644', type: 'blob', sha: 'readme' },
          ...Object.keys(files).map((path) => ({ path, mode: '100644', type: 'blob', sha: path })),
        ],
      },
    },
  };
  for (const [path, text] of Object.entries(files)) recording[`${RAW}/${id}/${commit}/${path}`] = { status: 200, body: text };
  return recording;
}

export const skill = (name: string) => `---\nname: ${name}\ndescription: The ${name} skill.\n---\n`;

/**
 * Acme: app with two skills, one kept for two agents; tools with one; docs with none; an empty
 * repository, which GitHub cannot list; and a fork with skills of its own upstream.
 */
export const ACME: Recording = {
  [`${API}/users/acme`]: { status: 200, body: { login: 'Acme' } },
  [`${API}/users/Acme/repos?per_page=100&page=1`]: {
    status: 200,
    body: [listed('Acme/tools'), listed('Acme/docs'), listed('Acme/upstream', true), listed('Acme/app'), listed('Acme/empty')],
  },
  ...repository('Acme/app', 'a'.repeat(40), {
    '.claude/skills/commits/SKILL.md': skill('commits'),
    '.agents/skills/commits/SKILL.md': skill('commits'),
    '.claude/skills/release/SKILL.md': skill('release'),
  }),
  ...repository('Acme/tools', 'b'.repeat(40), { '.cursor/skills/lint/SKILL.md': skill('lint') }),
  ...repository('Acme/docs', 'c'.repeat(40), { 'skills/shipped/SKILL.md': skill('shipped') }),
  [`${API}/repos/Acme/empty/commits/main`]: { status: 409, body: { message: 'Git Repository is empty.' } },
};

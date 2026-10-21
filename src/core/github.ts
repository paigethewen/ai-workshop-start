import { AtlasError, GitHubUnavailable } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { Organization } from './organization.ts';
import type { Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills on the default branch are found through code search; otherwise, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`; or
 * `https://github.com/owner/repo/tree/<ref>`, pinned to a commit, a tag or a branch without a `/`.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/\s]+))?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2], ref: match[3] } : undefined;
}

/** `https://github.com/owner`, without a repository: an organization or a user. */
export function parseGitHubOwner(input: string): string | undefined {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/?$/i.exec(input.trim())?.[1];
}

/** Resolves the pinned ref, else the default branch, to a commit and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<{ full_name: string; default_branch: string }>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  // Code search sees only the default branch: a pinned commit is listed from its tree.
  const hint = name.ref ? 'a pinned commit cannot be searched' : options.token ? undefined : 'GITHUB_TOKEN searches everywhere';
  return openCommit(github, info.full_name, name.ref ?? info.default_branch, hint);
}

/**
 * The owner's own repositories, forks aside: a fork's skills are its upstream's. Each one is listed
 * from its tree, even with a token: code search allows too few requests a minute for many repositories.
 */
export async function openGitHubOrganization(input: string, options: GitHubOptions): Promise<Organization> {
  const owner = parseGitHubOwner(input);
  if (!owner) throw new AtlasError(`Not a GitHub organization URL: ${input}`);
  // One pace for every repository's requests: they are all counted against the same limit.
  const paced = { ...options, pace: pace() };
  const github = client(paced);
  const { login, public_repos: count = 0 } = await github.json<{ login: string; public_repos?: number }>(
    `${API}/users/${owner}`,
    `Organization or user not found: https://github.com/${owner}`,
  );
  type Listed = { full_name: string; default_branch: string; fork: boolean };
  const page = (number: number) => github.json<Listed[]>(`${API}/users/${login}/repos?per_page=100&page=${number}`);
  // The pages the count says are asked for at once; past them, while the last one is full, as a count lags.
  const pages = Math.max(1, Math.ceil(count / 100));
  const listed = (await Promise.all(Array.from({ length: pages }, (_, index) => page(index + 1)))).flat();
  for (let number = pages + 1; listed.length === (number - 1) * 100; number++) listed.push(...(await page(number)));
  return {
    id: login,
    repositories: listed
      .filter((repository) => !repository.fork)
      .map(({ full_name: id, default_branch: branch }) => ({
        id,
        // A client of its own: the answers it keeps go with the repository once it is scanned.
        open: () => openCommit(client(paced), id, branch, 'scan this repository alone, with GITHUB_TOKEN, to search everywhere'),
      })),
  };
}

/**
 * The ref's commit and the files that may be skills: through code search without a `hint`; else from
 * the tree, and a truncated tree's warning ends with the hint.
 */
async function openCommit(github: Client, id: string, ref: string, hint?: string): Promise<Source> {
  const { sha } = await github.json<{ sha: string }>(
    `${API}/repos/${id}/commits/${encodeURIComponent(ref)}`,
    `Not found in https://github.com/${id}: ${ref}`,
  );
  const warnings: string[] = [];
  const paths = hint === undefined ? await searchPaths(github, id) : await treePaths(github, id, sha, warnings, hint);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], hint: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(
    `the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} at the root, so nested ones were skipped (${hint})`,
  );
  // Every root at once: the trees they share on the way down are asked for once.
  const roots = await Promise.all(
    SKILL_ROOTS.map(async (root) => {
      const rootSha = await directory(github, id, sha, root);
      if (!rootSha) return [];
      const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
      return files(subtree).map((path) => `${root}/${path}`);
    }),
  );
  return roots.flat();
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token, pace }: GitHubOptions & { pace?: Pace }) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new GitHubUnavailable(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      await pace?.turn();
      const response = await get(url, { headers });
      if (response.ok) return response.json();
      const body: unknown = await response.json().catch(() => undefined);
      const message = (body as { message?: unknown } | undefined)?.message;
      const text = typeof message === 'string' ? message : '';
      if (response.status === 404) throw new AtlasError(notFound);
      if (response.status === 403 || response.status === 429) {
        // A short secondary limit, as code search gives shared runners, passes in seconds.
        const wait = retryAfter(response, text);
        if (wait !== undefined && wait <= MAX_RETRY_WAIT && attempt < MAX_RETRIES) {
          // Paced, every request waits: the others would only be limited too.
          if (pace) pace.pause(wait);
          else await sleep(wait * 1000);
          continue;
        }
        if (wait !== undefined || /rate limit/i.test(text)) {
          throw new GitHubUnavailable(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
        }
      }
      if (response.status === 401) throw new GitHubUnavailable('GitHub rejected the token in GITHUB_TOKEN');
      throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
    }
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (response.status === 429 || (response.status === 403 && /rate limit/i.test(await response.clone().text()))) {
        // Raw reads go without the token, so a token would not lift this limit.
        throw new GitHubUnavailable('GitHub rate limit reached; try again in a minute');
      }
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** Retries of a rate-limited request, each after at most this many seconds. */
const MAX_RETRIES = 3;
const MAX_RETRY_WAIT = 10;

/**
 * API requests an organization scan may start at once, then each second: under GitHub's secondary
 * limit of 900 a minute, which many repositories scanned at the same time would otherwise pass.
 */
const BURST = 60;
const PER_SECOND = 14;

type Pace = ReturnType<typeof pace>;

/** Turns for API requests, one at a time, as BURST and PER_SECOND allow and no sooner than a pause GitHub asked for ends. */
function pace() {
  let tokens = BURST;
  let filled = Date.now();
  let resume = 0;
  let queue = Promise.resolve();
  async function wait() {
    for (;;) {
      const now = Date.now();
      if (now < resume) {
        await sleep(resume - now);
        continue;
      }
      tokens = Math.min(BURST, tokens + ((now - filled) * PER_SECOND) / 1000);
      filled = now;
      if (tokens >= 1) {
        tokens--;
        return;
      }
      await sleep(((1 - tokens) * 1000) / PER_SECOND);
    }
  }
  return {
    turn(): Promise<void> {
      queue = queue.then(wait);
      return queue;
    },
    /** Holds every turn for this many seconds from now. */
    pause(seconds: number) {
      resume = Math.max(resume, Date.now() + seconds * 1000);
    },
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Seconds GitHub asks to wait: the Retry-After header, else "try again in 4.1s" in the message. */
function retryAfter(response: Response, text: string): number | undefined {
  const header = Number(response.headers.get('retry-after') ?? NaN);
  if (Number.isFinite(header)) return header;
  const match = /try again in ([\d.]+)s/i.exec(text);
  return match ? Number(match[1]) : undefined;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}

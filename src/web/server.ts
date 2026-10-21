// The web view: the same scan, of a repository or an organization, as JSON, an organization's as it
// goes too, and a page that lists the skills and shows each SKILL.md.
// Local only: it listens on 127.0.0.1 and answers only requests addressed to it. Nothing is stored.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { Marked } from 'marked';
import { AtlasError } from '../core/errors.ts';
import { skillLink } from '../core/model.ts';
import { scanOrganization, type Organization, type Progress } from '../core/organization.ts';
import { parseSkill } from '../core/parse.ts';
import { scan, type ScanResult, type Source } from '../core/scan.ts';

export type WebOptions = {
  /** Opens what the user asked to scan, as the CLI does. */
  open(input: string): Promise<Source>;
  /** Opens an organization, when the input names one without a repository; undefined otherwise. */
  openOrganization?(input: string): Promise<Organization> | undefined;
};

/** The page's files, served as they are: no build step. */
const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/filter.js': { file: 'filter.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};

/** A SKILL.md comes from any repository: its own HTML and scripts never run in the page. */
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};

/** Markdown to HTML, with raw HTML shown as text and links only to the web or within the page. */
const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link(token) {
      return /^(https?:|mailto:|#)/i.test(token.href) ? false : this.parser.parseInline(token.tokens);
    },
    image: ({ href, text }) => (/^(https?:|data:image\/)/i.test(href) ? false : escapeHtml(text)),
  },
});

export function createWebServer(options: WebOptions): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json; charset=utf-8', JSON.stringify(body));

    // Another site's page, through a name that resolves here, must not scan this machine's directories.
    if (!isLocalHost(request.headers.host)) return json(403, { error: 'The web view answers only on localhost' });
    if (request.method !== 'GET') return json(405, { error: 'Only GET' });

    if (url.pathname === '/api/scan') {
      const input = url.searchParams.get('repo')?.trim();
      if (!input) return json(400, { error: 'Enter a GitHub URL or a directory' });
      try {
        const organization = options.openOrganization?.(input);
        if (organization && /application\/x-ndjson/.test(request.headers.accept ?? '')) {
          // An unknown owner is still a 400: the stream starts once the organization is open.
          const opened = await organization;
          response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY });
          // A page that went elsewhere has closed the connection: the rest of its answer is dropped.
          const line = (body: unknown) => response.destroyed || response.write(`${JSON.stringify(body)}\n`);
          try {
            line(await scanOrganizationForWeb(opened, (progress) => line({ progress })));
          } catch (error) {
            line({ error: failure(error) });
          }
          return response.end();
        }
        return json(200, organization ? await scanOrganizationForWeb(await organization) : await scanForWeb(input, options));
      } catch (error) {
        return json(error instanceof AtlasError ? 400 : 500, { error: failure(error) });
      }
    }

    const page = STATIC[url.pathname];
    if (!page) return json(404, { error: `Not found: ${url.pathname}` });
    send(200, page.type, await readFile(new URL(page.file, import.meta.url), 'utf8'));
  });
}

/** Listens on 127.0.0.1; resolves to the page's URL. */
export function listen(server: Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'EADDRINUSE' ? new AtlasError(`Port ${port} is in use; try --port <another port>`) : error);
    });
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/`);
    });
  });
}

/** What the page shows for one skill: what the CLI prints, and the SKILL.md itself. */
export type WebSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  link: string;
  copies: string[];
  /** The other front matter keys. */
  properties: Record<string, unknown>;
  /** The SKILL.md as it is. */
  source: string;
  /** The body after the front matter, as HTML. */
  html: string;
};

export type WebScan = {
  repository: { id: string; url: string; commit: string };
  skills: WebSkill[];
  warnings: string[];
};

/** A repository of an organization, with its skills' names. */
export type WebRepository = { id: string; url: string; commit: string; skills: string[] };

/** What the page shows for an organization: what the CLI prints, and each repository's skill names. */
export type WebOrganization = {
  organization: { id: string; url: string };
  /** How many repositories were scanned, forks aside. */
  total: number;
  /** The repositories with skills, most skills first, then by id. */
  repositories: WebRepository[];
  /** Each one names its repository. */
  warnings: string[];
};

/** An organization's scan as it goes: how many repositories were scanned, and the last one, if it has skills. */
export type WebProgress = { organization: { id: string; url: string }; scanned: number; total: number; repository?: WebRepository };

/** Every repository of the organization, as `scan` counts them; a repository opens with its own scan. */
export async function scanOrganizationForWeb(organization: Organization, onProgress?: (progress: WebProgress) => void): Promise<WebOrganization> {
  const owner = { id: organization.id, url: `https://github.com/${organization.id}` };
  const progress = ({ scanned, total, result }: Progress) =>
    onProgress?.({ organization: owner, scanned, total, ...(result?.skills.length ? { repository: webRepository(result) } : {}) });
  const result = await scanOrganization(organization, progress);
  return {
    organization: owner,
    total: result.total,
    repositories: result.repositories.map(webRepository),
    warnings: result.warnings,
  };
}

function webRepository({ repository: { id, url, commit }, skills }: ScanResult): WebRepository {
  return { id, url, commit, skills: skills.map((skill) => skill.name) };
}

/** One scan; the SKILL.md files it read anyway are kept for the answer, so opening one costs nothing. */
export async function scanForWeb(input: string, { open }: WebOptions): Promise<WebScan> {
  const source = await open(input);
  const texts = new Map<string, string>();
  const read = async (path: string) => {
    const bytes = await source.read(path);
    if (bytes) texts.set(path, new TextDecoder().decode(bytes));
    return bytes;
  };
  const result = await scan({ ...source, read });
  const { id, url, commit } = result.repository;
  return {
    repository: { id, url, commit },
    skills: result.skills.map((skill) => {
      const text = texts.get(skill.path) ?? '';
      const parsed = parseSkill(text);
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        path: skill.path,
        link: skillLink(result.repository, skill),
        copies: skill.copies,
        properties: parsed.properties,
        source: text,
        html: markdown.parse(parsed.body, { async: false }),
      };
    }),
    warnings: result.warnings,
  };
}

/** What the page shows for a scan that failed: the CLI's message, or an unexpected one. */
function failure(error: unknown): string {
  if (error instanceof AtlasError) return error.message;
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}

function isLocalHost(host: string | undefined): boolean {
  return !!host && /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

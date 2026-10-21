// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { scanOrganization, type Organization, type OrganizationResult } from './core/organization.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  /** Opens an organization, when the input names one without a repository; undefined otherwise. */
  openOrganization?(input: string): Promise<Organization> | undefined;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** A line the next one replaces, '' to clear it; only where it can be rewritten in place, such as a terminal. */
  progress?(text: string): void;
  /** Starts the web view on the port and returns its URL; only the Node CLI can. */
  serve?(port: number): Promise<string>;
};

/** The web view's port when `--port` is not given. */
export const DEFAULT_PORT = 4173;

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every unique skill in a repository and print it
  scan https://github.com/<owner> count the skills in each repository of an organization or user
  serve [--port <port>]           open the web view on http://127.0.0.1:${DEFAULT_PORT}/
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory>');
  const organization = context.openOrganization?.(args[0]);
  if (organization) {
    const opened = await organization;
    let result: OrganizationResult;
    try {
      result = await scanOrganization(opened, ({ scanned, total }) =>
        context.progress?.(`Scanning ${opened.id}: ${scanned} of ${count(total, 'repository', 'repositories')}`),
      );
    } finally {
      context.progress?.('');
    }
    printOrganization(result, context);
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
    return;
  }
  const result = await scan(await context.open(args[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

async function serveCommand(args: string[], context: Context) {
  const [flag, value, ...extra] = args;
  const port = flag === undefined ? DEFAULT_PORT : flag === '--port' && /^\d+$/.test(value ?? '') && !extra.length ? Number(value) : NaN;
  if (!(port >= 0 && port <= 65535)) throw new AtlasError('Usage: skill-atlas serve [--port <port>]');
  if (!context.serve) throw new AtlasError('The web view runs from the command line: ./skill-atlas serve');
  context.print(`Skill Atlas web view: ${await context.serve(port)}`);
  context.print('Press Ctrl+C to stop.');
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence and link. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${count(skills.length, 'skill', 'skills')}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
  }
}

/** `<owner> · N of M repositories with skills`, then each of them with its count. */
function printOrganization({ id, total, repositories }: OrganizationResult, { print }: Context) {
  print(`${id} · ${repositories.length} of ${count(total, 'repository', 'repositories')} with skills`);
  for (const { repository, skills } of repositories) print(`${repository.id} · ${count(skills.length, 'skill', 'skills')}`);
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

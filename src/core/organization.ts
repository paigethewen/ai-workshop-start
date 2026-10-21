import { AtlasError, GitHubUnavailable } from './errors.ts';
import { scan, type ScanResult, type Source } from './scan.ts';

/** An organization's or a user's repositories, forks aside, each opened when it is scanned. */
export type Organization = { id: string; repositories: { id: string; open(): Promise<Source> }[] };

export type OrganizationResult = {
  id: string;
  /** How many repositories were scanned. */
  total: number;
  /** The repositories with skills, most skills first, then by id. */
  repositories: ScanResult[];
  /** Each one names its repository. */
  warnings: string[];
};

/** Repositories scanned at the same time: each waits on GitHub more than it works, and GitHub paces their requests. */
const AT_ONCE = 16;

/** Every repository, scanned as one; a repository that cannot be scanned is a warning, unless GitHub is unavailable. */
export async function scanOrganization(organization: Organization): Promise<OrganizationResult> {
  const { repositories } = organization;
  const results: { id: string; result?: ScanResult; warnings: string[] }[] = [];
  let next = 0;
  let stopped = false;
  async function worker() {
    while (!stopped && next < repositories.length) {
      const { id, open } = repositories[next++];
      try {
        const result = await scan(await open());
        results.push({ id, result, warnings: result.warnings });
      } catch (error) {
        if (!(error instanceof AtlasError) || error instanceof GitHubUnavailable) {
          stopped = true;
          throw error;
        }
        results.push({ id, warnings: [error.message] });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, repositories.length) }, worker));
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  results.sort((a, b) => compare(a.id, b.id));
  return {
    id: organization.id,
    total: repositories.length,
    repositories: results
      .flatMap(({ result }) => (result && result.skills.length > 0 ? [result] : []))
      .sort((a, b) => b.skills.length - a.skills.length || compare(a.repository.id, b.repository.id)),
    warnings: results.flatMap(({ id, warnings }) => warnings.map((warning) => `${id}: ${warning}`)),
  };
}

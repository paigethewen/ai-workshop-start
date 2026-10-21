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

/** After each repository: how many were scanned, of how many; and the repository's result, if it could be scanned. */
export type Progress = { scanned: number; total: number; result?: ScanResult };

/** Repositories scanned at the same time: each is a few requests, and GitHub limits bursts. */
const AT_ONCE = 8;

/**
 * Every repository, scanned as one; a repository that cannot be scanned is a warning, unless GitHub is unavailable.
 * `onProgress` hears of the start, then of each repository as it is scanned, until the scan stops.
 */
export async function scanOrganization(organization: Organization, onProgress?: (progress: Progress) => void): Promise<OrganizationResult> {
  const { repositories } = organization;
  const results: { id: string; result?: ScanResult; warnings: string[] }[] = [];
  let next = 0;
  let stopped = false;
  // A stopped scan reports nothing more: the repositories still being scanned are not its answer.
  const scanned = (result?: ScanResult) => stopped || onProgress?.({ scanned: results.length, total: repositories.length, result });
  scanned();
  async function worker() {
    while (!stopped && next < repositories.length) {
      const { id, open } = repositories[next++];
      try {
        const result = await scan(await open());
        results.push({ id, result, warnings: result.warnings });
        scanned(result);
      } catch (error) {
        if (!(error instanceof AtlasError) || error instanceof GitHubUnavailable) {
          stopped = true;
          throw error;
        }
        results.push({ id, warnings: [error.message] });
        scanned();
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

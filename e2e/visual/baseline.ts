// node e2e/visual/baseline.ts: which baseline CI compares the screenshots with, for GitHub Actions' outputs.
// Baselines are artifacts, never files on a branch: `visual-baseline-pr-<N>`, accepted for pull request N with
// /accept-screenshots, else `visual-baseline`, the screenshots of the last green run on main. Only artifacts that
// runs in this repository's main context uploaded count: a pull request's own run cannot plant its baseline.
// Writes artifact-id, run-id and from (pr-<N>, main or none) to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs';

const { GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, GITHUB_OUTPUT: output, GITHUB_SHA: sha, GITHUB_REF: ref } = process.env;
if (!repository || !token) throw new Error('Set GITHUB_REPOSITORY and GITHUB_TOKEN');

type Artifact = {
  id: number;
  expired: boolean;
  created_at: string;
  workflow_run: { id: number; head_branch: string; repository_id: number; head_repository_id: number };
};

async function github<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

/** The newest artifact named `name` that has not expired and that a run on this repository's main uploaded. */
async function newest(name: string): Promise<Artifact | undefined> {
  const { artifacts } = await github<{ artifacts: Artifact[] }>(`actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`);
  return artifacts
    .filter((artifact) => !artifact.expired)
    .filter(({ workflow_run: run }) => run.head_branch === 'main' && run.head_repository_id === run.repository_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** The pull request: the event's, or on a push to main the one this commit was merged from. */
async function pullRequest(): Promise<number | undefined> {
  if (process.env.PR) return Number(process.env.PR);
  if (process.env.GITHUB_EVENT_NAME !== 'push' || ref !== 'refs/heads/main' || !sha) return undefined;
  const pulls = await github<{ number: number; merged_at: string | null }[]>(`commits/${sha}/pulls`);
  return pulls.find((pull) => pull.merged_at)?.number;
}

const pr = await pullRequest();
const accepted = pr === undefined ? undefined : await newest(`visual-baseline-pr-${pr}`);
const main = accepted ? undefined : await newest('visual-baseline');
const found = accepted ?? main;
const from = accepted ? `pr-${pr}` : main ? 'main' : 'none';
console.log(found ? `Baseline: ${from}, artifact ${found.id} of run ${found.workflow_run.id}, from ${found.created_at}` : 'No baseline yet');
if (output) appendFileSync(output, `artifact-id=${found?.id ?? ''}\nrun-id=${found?.workflow_run.id ?? ''}\nfrom=${from}\n`);

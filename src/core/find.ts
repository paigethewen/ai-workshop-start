/** A skill found in a repository: its SKILL.md, its directory's name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** The folders agents read a repository's skills from, as `<folder>/skills`. */
export const AGENT_FOLDERS = ['.agents', '.agent', 'agent', '.claude', '.codex', '.cursor', '.github', '.gemini', '.junie'];

/** Where agents keep a repository's skills, at its root. */
export const SKILL_ROOTS = AGENT_FOLDERS.map((folder) => `${folder}/skills`);

/** Directory names that hold test data, not skills an agent reads; compared in lower case. */
const TEST_DATA = new Set([
  'test',
  'tests',
  '__tests__',
  'testdata',
  'test-data',
  'fixture',
  'fixtures',
  '__fixtures__',
  'testresources',
  'test-resources',
]);

/**
 * Every `<base>/<agent folder>/skills/<dir>/SKILL.md` outside test data, named after `<dir>`.
 * The same `<dir>` under the same `<base>` is one skill: the first path, with the others as copies.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const groups = new Map<string, string[]>();
  for (const path of paths.filter(isAgentSkill).sort()) {
    const segments = path.split('/');
    const key = `${segments.slice(0, -4).join('/')}:${segments.at(-2)}`;
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  return [...groups.values()].map(([path, ...copies]) => ({ path, name: path.split('/').at(-2)!, copies }));
}

function isAgentSkill(path: string): boolean {
  const segments = path.split('/');
  return (
    segments.length >= 4 &&
    segments.at(-1) === 'SKILL.md' &&
    segments.at(-3) === 'skills' &&
    AGENT_FOLDERS.includes(segments.at(-4)!) &&
    !segments.slice(0, -1).some((segment) => TEST_DATA.has(segment.toLowerCase()))
  );
}

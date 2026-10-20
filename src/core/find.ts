import type { SkillKind } from './model.ts';

/**
 * A skill found in a repository: its SKILL.md, its directory's name and its kind. Own skills
 * with the same `group` are copies of one skill, whatever their bytes.
 */
export type SkillFile = { path: string; name: string; kind: SkillKind; group?: string };

/** The folders agents read a repository's own skills from, as `<folder>/skills`. */
export const AGENT_FOLDERS = ['.agents', '.agent', 'agent', '.claude', '.codex', '.cursor', '.github', '.gemini', '.junie'];

/** Where agents keep a repository's own skills, at its root. */
export const SKILL_ROOTS = AGENT_FOLDERS.map((folder) => `${folder}/skills`);

/** Directory names that hold test data, not skills an agent or a user gets; compared in lower case. */
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
 * Every file named exactly SKILL.md, named after its directory (a SKILL.md at the root after the
 * repository), except test data and a SKILL.md inside another skill, which belongs to that skill.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  const files = paths.filter((path) => path.split('/').at(-1) === 'SKILL.md' && !isTestData(path));
  const directories = new Set(files.map(directoryOf));
  return files
    .filter((path) => !insideAnotherSkill(directoryOf(path), directories))
    .sort()
    .map((path) => skillFile(path, repositoryName));
}

function skillFile(path: string, repositoryName: string): SkillFile {
  const segments = path.split('/');
  const name = segments.at(-2) ?? repositoryName;
  // <base>/<agent folder>/skills/<dir>/SKILL.md
  if (segments.length >= 4 && segments.at(-3) === 'skills' && AGENT_FOLDERS.includes(segments.at(-4)!)) {
    return { path, name, kind: 'own', group: `${segments.slice(0, -4).join('/')}:${name}` };
  }
  return { path, name, kind: 'shipped' };
}

/** Whole names only: a skill named `test-runner` is not test data. */
function isTestData(path: string): boolean {
  return path
    .split('/')
    .slice(0, -1)
    .some((segment) => TEST_DATA.has(segment.toLowerCase()));
}

/** The root skill owns nothing: the skills below it are skills of their own. */
function insideAnotherSkill(directory: string, directories: Set<string>): boolean {
  const segments = directory.split('/');
  for (let length = segments.length - 1; length > 0; length--) {
    if (directories.has(segments.slice(0, length).join('/'))) return true;
  }
  return false;
}

function directoryOf(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

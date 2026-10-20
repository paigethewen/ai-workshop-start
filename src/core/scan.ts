import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

type ReadFile = SkillFile & { text: string };

/** fetch → find → parse → dedupe. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const warnings = [...source.warnings];
  // The files are read at the same time: on GitHub, each one is a request.
  const read = await Promise.all(findSkills(source.paths, source.repository.name).map((file) => readFile(source, file)));
  const files = read.flatMap((file) => {
    if (typeof file === 'string') warnings.push(file);
    return typeof file === 'string' ? [] : [file];
  });
  const skills = copiesOf(files).map((copies) => {
    const result = toSkill(source.repository, copies);
    warnings.push(...result.warnings);
    return result.skill;
  });
  return { repository: source.repository, skills: sortSkills(skills), warnings };
}

async function readFile(source: Source, file: SkillFile): Promise<ReadFile | string> {
  const bytes = await source.read(file.path);
  if (!bytes) return `${file.path}: listed, but not found at the scanned commit; skipped`;
  return { ...file, text: new TextDecoder().decode(bytes) };
}

/**
 * The files, grouped into skills: own copies in the same place whatever their bytes, and the same
 * directory with the same text (line endings aside) wherever it is.
 */
function copiesOf(files: ReadFile[]): ReadFile[][] {
  const parent = files.map((_, index) => index);
  const root = (index: number): number => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  const byKey = new Map<string, number>();
  files.forEach((file, index) => {
    const keys = [`text:${file.name}:${normalized(file.text)}`];
    if (file.group) keys.push(`group:${file.group}`);
    for (const key of keys) {
      const other = byKey.get(key);
      if (other === undefined) byKey.set(key, index);
      else parent[root(index)] = root(other);
    }
  });
  const groups = new Map<number, ReadFile[]>();
  files.forEach((file, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), file]));
  return [...groups.values()];
}

/** The own copy if there is one, then the first by path; the others are its copies. */
function toSkill(repository: Repository, files: ReadFile[]): { skill: Skill; warnings: string[] } {
  const [main, ...copies] = [...files].sort((a, b) => Number(a.kind !== 'own') - Number(b.kind !== 'own') || compare(a.path, b.path));
  const warnings: string[] = [];
  for (const copy of copies) {
    if (copy.group && copy.group === main.group && normalized(copy.text) !== normalized(main.text)) {
      warnings.push(`${main.path} and ${copy.path}: copies differ; using ${main.path}`);
    }
  }
  const parsed = parseSkill(main.text);
  if (parsed.warning) warnings.unshift(`${main.path}: ${parsed.warning}`);
  if (parsed.name && main.path !== 'SKILL.md' && parsed.name !== main.name) {
    warnings.push(`${main.path}: the front matter name ${parsed.name} is not the directory name ${main.name}`);
  }
  const skill: Skill = {
    id: `${repository.id}:${main.path}`,
    repository: repository.id,
    path: main.path,
    name: parsed.name ?? main.name,
    description: parsed.description,
    commit: repository.commit,
    kind: main.kind,
    copies: copies.map((copy) => copy.path).sort(compare),
  };
  return { skill, warnings };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

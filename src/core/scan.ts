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

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  return {
    repository: source.repository,
    skills: sortSkills(results.flatMap((result) => (result.skill ? [result.skill] : []))),
    warnings: [...source.warnings, ...results.flatMap((result) => result.warnings)],
  };
}

async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warnings: string[] }> {
  const [bytes, ...copies] = await Promise.all([file.path, ...file.copies].map((path) => source.read(path)));
  if (!bytes) return { warnings: [`${file.path}: listed, but not found at the scanned commit; skipped`] };
  const text = new TextDecoder().decode(bytes);
  const parsed = parseSkill(text);
  const warnings: string[] = [];
  if (parsed.warning) warnings.push(`${file.path}: ${parsed.warning}`);
  if (parsed.name && parsed.name !== file.name) {
    warnings.push(`${file.path}: the front matter name ${parsed.name} is not the directory name ${file.name}`);
  }
  file.copies.forEach((copy, index) => {
    if (copies[index] && normalized(new TextDecoder().decode(copies[index])) !== normalized(text)) {
      warnings.push(`${file.path} and ${copy}: copies differ; using ${file.path}`);
    }
  });
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies: file.copies,
  };
  return { skill, warnings };
}

/** Line endings aside. */
function normalized(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

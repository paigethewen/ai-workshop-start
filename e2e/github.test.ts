// The real CLI against real JetBrains repositories on live GitHub. Each scan is pinned to a commit, so
// what it prints cannot change under the test, and none uses code search, whose limit CI runs share.
// Needs network access and GITHUB_TOKEN.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openGitHub } from '../src/core/github.ts';
import { scan } from '../src/core/scan.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const TOKEN = process.env.GITHUB_TOKEN;

/** JetBrains/android one commit before "Remove bundled agent skills" took `agent/skills` out. */
const ANDROID = '28b36ffcd8e814fa4d9536b729b1ab5b86be2224';
const KOOG = '22e342e033c716f835312dd6cbe83193e1cbcf76';
const MPS = 'd7e4f5c1394535b05e90dde6e3e7e8a3f3e174a2';

const TRUNCATED =
  'warning: the tree is too large to list at once; looked only in .agents/skills, .agent/skills, agent/skills, .claude/skills, ' +
  '.codex/skills, .cursor/skills, .github/skills, .gemini/skills, .junie/skills at the root, so nested ones were skipped ' +
  '(a pinned commit cannot be searched)';

/** `skill-atlas scan <url>`, as a user runs it. */
function atlas(url: string) {
  assert.ok(TOKEN, 'set GITHUB_TOKEN: the end-to-end tests read live GitHub');
  const result = spawnSync(process.execPath, [CLI, 'scan', url], { encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: TOKEN }, timeout: 50_000 });
  assert.equal(result.error, undefined, `the CLI did not finish: ${result.error}`);
  return { code: result.status, stdout: result.stdout.trimEnd(), stderr: result.stderr.trimEnd() };
}

test('JetBrains/android: every skill in agent/skills, a folder without a leading dot, with the mismatched name warned about', { timeout: 60_000 }, () => {
  const scanned = atlas(`https://github.com/JetBrains/android/tree/${ANDROID}`);
  const link = (dir: string) => `  https://github.com/JetBrains/android/blob/${ANDROID}/agent/skills/${dir}/SKILL.md`;
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      'JetBrains/android · 6 skills',
      'android-studio-development — Specialist in Android Studio plugin development.',
      link('android-studio-development'),
      'android-studio-diagnostics-analysis — Analyzes Android Studio diagnostic logs and thread dumps to identify UI freezes, lock contention, and system configuration issues.',
      link('android-studio-diagnostics-analysis'),
      'jewel-swing-interop — Integrate Jewel Compose UI with Swing in IntelliJ Platform plugins or desktop apps.',
      link('jewel-swing-interop'),
      'jewel-ui — Build or modify Compose Desktop UI using JetBrains Jewel components, theming, and icon loading.',
      link('jewel-ui'),
      'write-evals — Expertise in building new AI agent evaluations (evals) for Android Studio.',
      link('android-studio-evals'),
      'writing-lint-checks — Helps to write a new lint check under `/tools/base/lint/libs/lint-checks`.',
      link('writing-lint-checks'),
    ].join('\n'),
  );
  assert.equal(
    scanned.stderr,
    [
      TRUNCATED,
      'warning: agent/skills/android-studio-evals/SKILL.md: the front matter name write-evals is not the directory name android-studio-evals',
    ].join('\n'),
  );
});

test('JetBrains/koog: the .claude skills count, the skills in integration-test resources do not', { timeout: 60_000 }, async () => {
  const scanned = atlas(`https://github.com/JetBrains/koog/tree/${KOOG}`);
  const link = (dir: string) => `  https://github.com/JetBrains/koog/blob/${KOOG}/.claude/skills/${dir}/SKILL.md`;
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      'JetBrains/koog · 2 skills',
      'add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).',
      link('add-java-code-snippets-in-docs'),
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
      link('split-jvm-nonjvm'),
    ].join('\n'),
  );
  assert.equal(scanned.stderr, '');

  // The test skills were listed, so leaving them out is the scan's decision, not a gap in the listing.
  const source = await openGitHub(`https://github.com/JetBrains/koog/tree/${KOOG}`, { fetch, token: TOKEN });
  const testSkills = source.paths.filter((path) => path.startsWith('integration-tests/') && path.endsWith('/SKILL.md'));
  assert.deepEqual(testSkills.sort(), [
    'integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md',
    'integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md',
  ]);
});

test('JetBrains/MPS: each skill kept for Codex and Claude is counted once, the .claude copy under also in', { timeout: 60_000 }, () => {
  const scanned = atlas(`https://github.com/JetBrains/MPS/tree/${MPS}`);
  assert.equal(scanned.code, 0, scanned.stderr);
  const lines = scanned.stdout.split('\n');
  assert.equal(lines[0], 'JetBrains/MPS · 42 skills');
  const links = lines.filter((line) => line.startsWith('  https://'));
  const copies = lines.filter((line) => line.startsWith('  also in '));
  assert.equal(links.length, 42, scanned.stdout);
  assert.deepEqual(
    copies,
    links.map((line) => `  also in ${line.replace(`  https://github.com/JetBrains/MPS/blob/${MPS}/.agents/`, '.claude/')}`),
  );
  assert.ok(lines.includes(`  https://github.com/JetBrains/MPS/blob/${MPS}/.agents/skills/mps-aspect-generator/SKILL.md`), scanned.stdout);
  assert.equal(scanned.stderr, TRUNCATED);
});

test('JetBrains/MPS: the skill a plugin ships is neither counted nor a copy, though its name matches a counted skill', { timeout: 60_000 }, async () => {
  assert.ok(TOKEN, 'set GITHUB_TOKEN: the end-to-end tests read live GitHub');
  const source = await openGitHub(`https://github.com/JetBrains/MPS/tree/${MPS}`, { fetch, token: TOKEN });
  // The truncated tree leaves the plugins out; the plugin's real SKILL.md goes back into the listing,
  // so leaving it out is the scan's decision.
  const shipped = 'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-generator/SKILL.md';
  assert.ok(!source.paths.includes(shipped), 'the tree is listed whole now: drop the added path');
  assert.ok(await source.read(shipped), `${shipped} is not in JetBrains/MPS at ${MPS}`);
  const result = await scan({ ...source, paths: [...source.paths, shipped] });
  const generator = result.skills.filter((skill) => skill.name === 'mps-aspect-generator');
  assert.deepEqual(
    generator.map(({ path, copies }) => ({ path, copies })),
    [{ path: '.agents/skills/mps-aspect-generator/SKILL.md', copies: ['.claude/skills/mps-aspect-generator/SKILL.md'] }],
  );
  const shippedPaths = result.skills.flatMap((skill) => [skill.path, ...skill.copies]).filter((path) => path.startsWith('plugins/'));
  assert.deepEqual(shippedPaths, []);
  assert.equal(result.skills.length, 42);
});

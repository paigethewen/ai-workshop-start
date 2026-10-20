# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every **unique skill** in the repository: **name**, **description**, **link**, **kind**, *copies*
## Architecture
Core: fetch → find → parse → dedupe. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit, kind, copies
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## What counts as a skill
A skill is a directory with a file named exactly `SKILL.md`; `skill.md` and `SKILL.md.bak` are not skills.
- A `SKILL.md` deeper inside another skill (`x/SKILL.md` and `x/examples/SKILL.md`) belongs to that skill and is not counted
- A `SKILL.md` at the repository root is a skill named after the repository; it does not own the skills below it
- Anything under `.git` or `node_modules` is not read

**Kind**, from where the skill sits:
- **own**: the repository's own workflow, `<base>/<agent folder>/skills/<dir>/SKILL.md`. Agent folders: `.agents`, `.agent`, `agent`, `.claude`, `.codex`, `.cursor`, `.github`, `.gemini`, `.junie`. `<base>` is the root or any directory below it: agents read nested agent folders in a monorepo
  - `JetBrains/android`: `agent/skills/writing-lint-checks/SKILL.md`, no leading dot
- **shipped**: every other skill, usually shipped to users inside a plugin, a library or a skills collection
  - `JetBrains/MPS`: `plugins/mcp-tools/resources/…/skills/mps-aspect-generator/SKILL.md`
  - The parent need not be named `skills`; an unknown agent folder still counts, as **shipped**

**Test data** is not counted, *without a warning*: any directory in the path, the skill's own included, named `test`, `tests`, `__tests__`, `testdata`, `test-data`, `fixture`, `fixtures`, `__fixtures__`, `testResources` or `test-resources` (case-insensitive)
- `src/test/resources/.claude/skills/x/SKILL.md`, `plugins/p/testData/skills/x/SKILL.md`, `fixture/.claude/skills/x/SKILL.md`
- `resources` alone is *not* test data: plugins ship skills from it
- Whole names only: `.claude/skills/test-runner/SKILL.md` counts, `fixture/SKILL.md` does not
## Copies
The same skill is often kept in several places: `.claude/skills/x` for Claude and `.agents/skills/x` for Codex, or a plugin that ships the repository's own skill.
- **own** skills with the same `<base>` and the same `<dir>` → **one skill**, whatever their bytes; differing bytes → a *warning* naming both paths
- Otherwise, the same `<dir>` and the same bytes (line endings normalized) → **one skill**, wherever they sit
- The same `<dir>` with different bytes in different places → *different* skills
- The skill is the **own** copy if there is one, then the copy whose path sorts first; its name, description, link and kind are the ones printed; the other paths are its *copies*
- A front matter name that is not its directory name → a *warning*; the directory decides what is a copy
- **Symlinks are not followed**: a symlinked skill or agent folder is neither counted nor listed as a copy
- A truncated GitHub tree without `GITHUB_TOKEN` looks only in root-level agent folders; the warning says nested and shipped skills were skipped
## Test fixture
`fixture/` holds one case per rule above; [fixture/README.md](../fixture/README.md) maps each path to its case.
The test-data rule means `./skill-atlas scan .` on this repository finds *none* of them: the tests scan `./fixture` directly.

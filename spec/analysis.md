# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every **unique skill** an agent reads from the repository: **name**, **description**, **link**, *copies*
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit, copies
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
- A short GitHub rate limit, at most 10 s by `Retry-After` or *try again in N s*, → retried, up to 3 times; a longer one → the rate-limit message, exit code 1
## What counts as a skill
Only `<base>/<agent folder>/skills/<dir>/SKILL.md`: the skills agents read while working in the repository.
- Agent folders: `.agents`, `.agent`, `agent`, `.claude`, `.codex`, `.cursor`, `.github`, `.gemini`, `.junie`
  - `JetBrains/android`: `agent/skills/writing-lint-checks/SKILL.md`, no leading dot, counts
- `<base>` is the root or any directory below it: agents read nested agent folders in a monorepo
- The file name is exactly `SKILL.md`; `skill.md` and `SKILL.md.bak` are not skills
- `<dir>` is exactly one directory: `<dir>/examples/SKILL.md` belongs to the skill and is not counted
- Anything under `.git` or `node_modules` is not read

Not counted, *without a warning*: they are not skills an agent reads from this repository
- **Shipped to users**: a skill outside an agent folder, such as in a plugin, a library or a skills collection
  - `JetBrains/MPS`: `plugins/mcp-tools/resources/…/skills/mps-aspect-generator/SKILL.md`
  - a plain `skills/<dir>/SKILL.md`, a `SKILL.md` at the repository root, a folder that is not in the list (`docs/skills/<dir>`)
- **Test data**: any directory in the path named `test`, `tests`, `__tests__`, `testdata`, `test-data`, `fixture`, `fixtures`, `__fixtures__`, `testResources` or `test-resources` (case-insensitive)
  - `src/test/resources/.claude/skills/x/SKILL.md`, `tests/fixtures/.agents/skills/x/SKILL.md`, `fixture/.claude/skills/x/SKILL.md`
  - Whole names only: `.claude/skills/test-runner/SKILL.md` counts
## Copies
The same skill is often kept for several agents: `.claude/skills/x` for Claude and `.agents/skills/x` for Codex.
- The same `<base>` and the same `<dir>` → **one skill**: the path that sorts first is printed, the others are its *copies*
- Copies whose bytes differ (line endings aside) → still one skill, and a *warning* naming both paths
- The same `<dir>` under different `<base>`s → *different* skills: each package has its own
- A shipped copy of a skill is not counted and not listed as a copy
- A front matter name that is not its directory name → a *warning*; the directory decides what is a copy
- **Symlinks are not followed**: a symlinked skill or agent folder is neither counted nor listed as a copy
- A truncated GitHub tree without `GITHUB_TOKEN` looks only in root-level agent folders; the warning says nested ones were skipped
## Test fixture
`fixture/` holds one case per rule above; [fixture/README.md](../fixture/README.md) maps each path to its case.
The test-data rule means `./skill-atlas scan .` on this repository finds *none* of them, only the repository's own `address-comment`, `code-review`, `demo-video`, `issue-to-pr`, `red-agent` and `status-update` skills: the tests scan `./fixture` directly.

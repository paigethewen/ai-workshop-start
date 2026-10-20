# fixture

A small repository for the tests: one case per rule in [spec/analysis.md](../spec/analysis.md).

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.agents/skills/commits` | the same skill for Codex, byte-for-byte: a copy |
| `plugins/tools/skills/commits` | a shipped copy that differs only in line endings: a copy |
| `modules/editor/.claude/skills/commits` | the same directory in a nested package: a skill of its own |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.codex/skills/code-style` | an own copy whose bytes differ: one skill and a warning |
| `plugins/style/skills/code-style` | the same directory shipped with different bytes: a skill of its own |
| `.agents/skills/release-checklist` | malformed front matter |
| `agent/skills/writing-lint-checks` | an agent folder without a leading dot: own |
| `plugins/mcp-tools/resources/META-INF/skills/aspect-generator` | shipped inside a plugin's resources |
| `.windsurf/skills/deploy` | an unknown agent folder: shipped |
| `.cursor/skills/review` | a front matter name that is not the directory name: a warning |
| `.claude/skills/test-runner` | a skill directory named like test data: counted |
| `.claude/skills/test-runner/examples` | a `SKILL.md` inside another skill: not counted |
| `src/test/resources/.claude/skills/test-data-skill` | test data: not counted |
| `plugins/style/testData/skills/test-data-plugin` | test data: not counted |
| `tests/fixtures/.agents/skills/test-data-fixture` | test data: not counted |
| `.claude/skills/lowercase/skill.md`, `.claude/skills/backup/SKILL.md.bak` | not named exactly `SKILL.md`: not counted |
| `.gemini/skills` | a symlink to `.claude/skills`: not followed |
| `SKILL.md` | a skill at the root without a name: named after the repository |

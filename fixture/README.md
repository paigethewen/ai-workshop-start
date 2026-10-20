# fixture

A small repository for the tests: one case per rule in [spec/analysis.md](../spec/analysis.md).

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.agents/skills/commits` | the same skill for Codex, byte-for-byte: a copy |
| `.junie/skills/commits` | a copy that differs only in line endings: a copy, no warning |
| `plugins/tools/skills/commits` | a shipped copy: not counted, not listed as a copy |
| `modules/editor/.claude/skills/commits` | the same directory in a nested package: a skill of its own |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.codex/skills/code-style` | a copy whose bytes differ: one skill and a warning |
| `.agents/skills/release-checklist` | malformed front matter |
| `agent/skills/writing-lint-checks` | an agent folder without a leading dot: counted |
| `.cursor/skills/review` | a front matter name that is not the directory name: a warning |
| `.claude/skills/test-runner` | a skill directory named like test data: counted |
| `.claude/skills/test-runner/examples` | a `SKILL.md` inside a skill: not counted |
| `plugins/mcp-tools/resources/META-INF/skills/aspect-generator` | shipped inside a plugin's resources: not counted |
| `plugins/style/skills/code-style` | shipped, named like a skill: not counted |
| `skills/collection` | a plain `skills/` folder, as a skills collection ships it: not counted |
| `docs/skills/deploy` | a folder that is not an agent folder: not counted |
| `src/test/resources/.claude/skills/test-data-skill` | test data: not counted |
| `plugins/style/testData/skills/test-data-plugin` | test data: not counted |
| `tests/fixtures/.agents/skills/test-data-fixture` | test data: not counted |
| `.claude/skills/lowercase/skill.md`, `.claude/skills/backup/SKILL.md.bak` | not named exactly `SKILL.md`: not counted |
| `.gemini/skills` | a symlink to `.claude/skills`: not followed |

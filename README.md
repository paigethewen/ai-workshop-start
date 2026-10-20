# Skill Atlas

Every unique skill an agent reads from a repository: `./skill-atlas scan` finds each `SKILL.md` in
the agents' folders, counts copies once, and prints each skill's name, description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 7 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

Or browse them: `./skill-atlas serve` opens a web view on <http://127.0.0.1:4173/>. Enter a GitHub URL or a local
directory, then pick a skill to read its `SKILL.md`, rendered or as it is; the filter finds skills by name or contents and
marks what it found. `--port <port>` picks another port.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

- [spec/](spec/): what it does; [spec/web.md](spec/web.md): the web view. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.

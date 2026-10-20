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

A whole organization or user, `./skill-atlas scan https://github.com/<owner>`, counts the skills in each of its
repositories, forks aside:

```console
$ ./skill-atlas scan https://github.com/anthropics
anthropics · 9 of 90 repositories with skills
anthropics/defending-code-reference-harness · 9 skills
anthropics/cwc-workshops · 8 skills
…
```

Or browse them: `./skill-atlas serve` opens a web view on <http://127.0.0.1:4173/>. Enter a GitHub URL or a local
directory, then pick a skill to read its `SKILL.md`, rendered or as it is; the filter finds skills by name or contents and
marks what it found. Enter an owner's URL to list its repositories with skills, and pick one to scan it. `--port <port>`
picks another port.

Set `GITHUB_TOKEN` for a higher GitHub rate limit: an organization of more than a few dozen repositories needs it. `npm test` runs the tests; `npm run e2e`, the visual tests: the demo cases in a browser, a video of each in `demo-videos/`.

- [spec/](spec/): what it does; [spec/web.md](spec/web.md): the web view. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.

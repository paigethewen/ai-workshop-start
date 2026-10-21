# Command line
`./skill-atlas scan <GitHub URL | directory>`, or `./skill-atlas scan https://github.com/<owner>`: a whole organization, see below.
Prints the result **at once**; *nothing is stored*.
`./skill-atlas serve [--port <port>]`: the same scan in a local web view, see [web.md](web.md).
`GITHUB_TOKEN`, optional: a higher GitHub rate limit, and code search instead of the tree.
A GitHub URL may pin a commit, a tag or a branch without a `/`: `https://github.com/<owner>/<repo>/tree/<ref>`.
- A pinned scan lists the commit's tree, even with `GITHUB_TOKEN`: code search sees only the default branch
- An unknown ref → `Not found in <repository URL>: <ref>`, exit code 1
## Output
```
JetBrains/kotlin · 7 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/.claude/skills/build-tools-bump-gradle-api/SKILL.md
  also in .agents/skills/…/SKILL.md
```
- The count is of **unique skills**: copies are not counted again
- Sorted by **name**, then path; the description's *first sentence*
- `also in <paths>` for copies, comma-separated, sorted; warnings go to *stderr*
- No skills → `<repo> · 0 skills`, exit code 0
## An organization
`https://github.com/<owner>`, without a repository: every repository of the organization or user, each scanned as above.
```
anthropics · 9 of 90 repositories with skills
anthropics/defending-code-reference-harness · 9 skills
anthropics/cwc-workshops · 8 skills
…
```
- The repositories that have skills, by **skill count**, most first, then by name; the others are only counted
- Each count is of **unique skills**, as for one repository
- **Forks are skipped**, neither scanned nor counted: their skills are their upstream's
- Each repository is listed from its tree at its default branch, even with `GITHUB_TOKEN`: code search's limit is too low for many repositories
  - A truncated tree warns as for one repository; the hint is to scan that repository alone
- Each repository is two GitHub API requests, its commit and its tree, besides reading its skills; the listing is one a page of 100
- Many repositories are scanned at once, their API requests paced under GitHub's limit of 900 a minute: 60 at once, then 14 a second
  - A short pause GitHub asks for holds every repository's requests, not only the one it answered
- The pages of the listing are asked for at once, as many as the owner's repository count says; past them, while the last page is full
- Warnings name their repository: `warning: <owner>/<repo>: <warning>`, to *stderr*
- A repository that cannot be scanned, such as an empty one → a warning, the scan goes on; it counts as one without skills
- A rate limit, a rejected token or GitHub out of reach stops the whole scan: the message, exit code 1
- An unknown owner → `Organization or user not found: https://github.com/<owner>`, exit code 1
- No repositories → `<owner> · 0 of 0 repositories with skills`, exit code 0
- The web view scans an organization the same way, see [web.md](web.md)

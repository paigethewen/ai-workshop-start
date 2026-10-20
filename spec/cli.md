# Command line
`./skill-atlas scan <GitHub URL | directory>`
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

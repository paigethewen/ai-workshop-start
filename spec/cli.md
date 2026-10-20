# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
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

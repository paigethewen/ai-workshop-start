# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/MPS · 3 skills: 1 own, 2 shipped
Own
build-language — Builds an MPS language…
  https://github.com/JetBrains/MPS/blob/<commit>/.claude/skills/build-language/SKILL.md
  also in .agents/skills/build-language/SKILL.md
Shipped
mps-aspect-generator — Generates…
  https://github.com/JetBrains/MPS/blob/<commit>/plugins/mcp-tools/resources/…/SKILL.md
```
- The count is of **unique skills**: copies are not counted again
- **Own**, then **Shipped**; a section with no skills is left out, and so is its count in the header
- In each section, sorted by **name**, then path; the description's *first sentence*
- `also in <paths>` for copies, comma-separated, sorted; warnings go to *stderr*
- No skills → `<repo> · 0 skills`, exit code 0

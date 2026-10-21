# Web view
`./skill-atlas serve [--port <port>]`: a local page over the same scan, at `http://127.0.0.1:4173/` by default.
Enter a GitHub URL or a directory; the page lists every unique skill, and opens each one's `SKILL.md`.
Enter `https://github.com/<owner>`: the page lists the organization's repositories with skills, as `scan` does.
`GITHUB_TOKEN`, as for `scan`. *Nothing is stored*: each scan is one request, its answer is all there is. Only *Group with Claude* sends what was scanned anywhere.
## The page
- Before a scan: what Skill Atlas does, and example repositories to scan with one click
- While scanning, the button spins; a failed scan → its message in place of the results
- Light and dark, after the system's setting; one column on a narrow screen
## The list
- The **same skills** as `scan`: the same count, order, names, descriptions' *first sentence*, links and warnings
- `<repo> · N skills`, with the scanned commit; the warnings, folded, above it
- Each skill: its name, `×N` for N copies in all, the first sentence, and a badge per agent that reads it (`.claude` → Claude, `.github` → Copilot, …) and for a nested package, its `<base>`
- A filter: the skills whose name, description, path or `SKILL.md` has every word typed, in any case; no words → every skill
- Each word typed is marked where the list shows it; a skill that matches outside its name and first sentence shows the first line of its `SKILL.md` that does
- No skills → a note on where skills live
- An unreachable repository → its `scan` message on the page
## Grouping with a model
`Group with Claude` sorts the skills the list shows, two or more, into groups by topic, with Claude Haiku through the `claude` CLI on this machine, logged in as its user. *The skills' names, descriptions and paths leave the machine*, and nothing else; the button says so.
- `claude -p --model haiku` with no tools, no MCP servers and no skills, its answer held to a JSON schema: a `SKILL.md` can ask anything of the model, the model can only answer
- The answer is **checked, never repaired**: every skill in exactly one group, no skill it was not given; otherwise its fault is shown under the button and the list stays as it was
- Each group: its label and `N`, then its skills, in the model's order; `Ungroup` → the plain list
- Typing in the filter or a new scan → the plain list; an answer for a list since changed is dropped
- No `claude` → `Grouping with a model needs the claude CLI, installed and logged in`; no answer within 90 seconds → so
- `POST /api/groups`, `{ skills: [{ path, name, description }] }` as `application/json` only, so another site's page cannot spend the model; at most 1000 skills
## An organization
- The **same repositories** as `scan https://github.com/<owner>`: the same counts, order and warnings; forks skipped
- `<owner> · N of M repositories with skills`; the warnings, folded, above it
- Each repository: its `owner/repo`, `N skills`, and its skills' names
- A repository opens with its own scan, as if its URL were entered; back returns to the organization without scanning it again
- No repositories with skills → a note that forks are skipped
- An unknown owner, a rate limit, a rejected token or GitHub out of reach → its `scan` message on the page
## A skill
- Its name, description, link and *copies*; the other front matter keys
- The filter's words marked in all of them, in the rendered body and in the `SKILL.md`
- The body after the front matter, **rendered** as Markdown; the `SKILL.md` as it is, one tab over, and a button that copies it
- A GitHub link opens the file at the *scanned commit*; a local `file://` link is shown as text
- The address keeps the repository or the owner in `?repo=` and the open skill in `#<path>`: a reload shows the same
## Safety
A `SKILL.md` comes from any repository; the server listens on this machine only.
- Raw HTML in a `SKILL.md` is shown as text; a link or image that is not `http(s)` (or `mailto:`, `#` for links) → its text
- Only the page's own scripts run (`Content-Security-Policy`)
- On `127.0.0.1` only, and only for a `Host` of `127.0.0.1`, `localhost` or `[::1]`: another site cannot scan this machine's directories
## The command
- `serve` prints `Skill Atlas web view: <URL>` and runs until Ctrl+C
- `--port 0` → a free port; a port in use → `Port N is in use; try --port <another port>`, exit code 1
- A bad port → the usage, exit code 1

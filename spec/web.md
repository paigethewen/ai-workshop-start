# Web view
`./skill-atlas serve [--port <port>]`: a local page over the same scan, at `http://127.0.0.1:4173/` by default.
Enter a GitHub URL or a directory; the page lists every unique skill, and opens each one's `SKILL.md`.
`GITHUB_TOKEN`, as for `scan`. *Nothing is stored*: each scan is one request, its answer is all there is.
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
## A skill
- Its name, description, link and *copies*; the other front matter keys
- The filter's words marked in all of them, in the rendered body and in the `SKILL.md`
- The body after the front matter, **rendered** as Markdown; the `SKILL.md` as it is, one tab over, and a button that copies it
- A GitHub link opens the file at the *scanned commit*; a local `file://` link is shown as text
- The address keeps the repository in `?repo=` and the open skill in `#<path>`: a reload shows the same
## Safety
A `SKILL.md` comes from any repository; the server listens on this machine only.
- Raw HTML in a `SKILL.md` is shown as text; a link or image that is not `http(s)` (or `mailto:`, `#` for links) → its text
- Only the page's own scripts run (`Content-Security-Policy`)
- On `127.0.0.1` only, and only for a `Host` of `127.0.0.1`, `localhost` or `[::1]`: another site cannot scan this machine's directories
## The command
- `serve` prints `Skill Atlas web view: <URL>` and runs until Ctrl+C
- `--port 0` → a free port; a port in use → `Port N is in use; try --port <another port>`, exit code 1
- A bad port → the usage, exit code 1

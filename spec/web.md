# Web view
`./skill-atlas serve [--port <port>]`: a local page over the same scan, at `http://127.0.0.1:4173/` by default.
Enter a GitHub URL or a directory; the page lists every unique skill, and opens each one's `SKILL.md`.
`GITHUB_TOKEN`, as for `scan`. *Nothing is stored*: each scan is one request, its answer is all there is.
## The list
- The **same skills** as `scan`: the same count, order, names, descriptions' *first sentence*, links and warnings
- `<repo> · N skills`; the warnings, folded, above it
- An unreachable repository → its `scan` message on the page
## A skill
- Its name, description, link and *copies*; the other front matter keys
- The body after the front matter, **rendered** as Markdown; the `SKILL.md` as it is, one tab over
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

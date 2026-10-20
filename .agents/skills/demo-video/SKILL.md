---
name: demo-video
description: Record a demo video of a web view feature and link it from its pull request. Use when a pull request changes what the web view shows or does, or when asked to record a demo.
---

# Demo video

A pull request that changes what the web view shows or does carries a video of the feature in use, so a reviewer sees it working before reading the diff.
A change the web view does not show (the CLI alone, the scan's internals, tests, docs, CI) needs no video; a CLI change shows its console output in the pull request body instead.

## 1. Pick or write the case

[cases.ts](cases.ts) holds the demo cases; each one drives the web view through one feature, as a person would:

- `read-skill`: scan `./fixture`, open a skill with copies in three agents, switch from its rendered body to its `SKILL.md`; offline
- `filter-skills`: scan `JetBrains/kotlin`, filter by `test`: the word is marked in the list and in the open skill
- `scan-organization`: scan `anthropics`, open one of its repositories, go back to the organization

When no case shows the pull request's feature, add one named after it, built like the others: start from a scan, act through the page's own controls (`#repo`, `#filter`, the list's links, the tabs), wait for what the page shows before each pause, and end on the page that proves the feature.
Pick a repository whose skills make the feature visible; one under 20 seconds of scanning keeps the video short. Keep the existing cases: they show the features merged so far.

## 2. Record

Once per machine, install the browser: `npx playwright install chromium`.
Then record, from the checkout of the pull request's branch:

```bash
node .agents/skills/demo-video/record.ts --out demo-videos <case>...
```

It starts its own `./skill-atlas serve` on a free port, records each case at 1280×800 as `demo-videos/<case>.webm`, saves the page it ends on as `demo-videos/<case>.png`, and stops the server.
GitHub cases need the network; an organization needs `GITHUB_TOKEN` (`GITHUB_TOKEN=$(gh auth token)` on a machine logged in to `gh`) or the scan stops on the rate limit.
`demo-videos/` is ignored: never commit a video to the pull request's branch.

## 3. Check it

Look at each `<case>.png`: it must show the feature's result, not a spinner, an error or an empty list.
If it does not, fix the case or the feature and record again; a video that does not show the feature is worse than none.

## 4. Publish

Videos live on the `demo-videos` branch, one folder per pull request branch, so they never enter a pull request's diff.
Add them from a worktree of their own, and never `git stash`:

```bash
branch=$(git branch --show-current)
dir=$(mktemp -d)/demo-videos
if git fetch origin demo-videos; then git worktree add --detach "$dir" FETCH_HEAD
else git worktree add --orphan -b demo-videos "$dir"; fi
mkdir -p "$dir/$branch" && cp demo-videos/<case>.webm "$dir/$branch/"
git -C "$dir" add "$branch" && git -C "$dir" commit -m "Demo of $branch: <case>..."
git -C "$dir" push origin HEAD:demo-videos
git worktree remove "$dir"
```

If the push is rejected because `demo-videos` moved, `git -C "$dir" pull --rebase origin demo-videos` and push again: each pull request writes only its own folder.

## 5. Link it

In the pull request body, a `## Demo` section: per case, one line on what it shows, and its link,
`https://github.com/<owner>/<repo>/blob/demo-videos/<branch>/<case>.webm`.
GitHub plays a video inline only when a person drags it into the description; the link opens it in a new tab.
When the feature changes after review, record and publish again under the same names, and say so in the reply.

If the video cannot be recorded here (no browser, no network), the `## Demo` section says why in one line; never link a video that does not exist.

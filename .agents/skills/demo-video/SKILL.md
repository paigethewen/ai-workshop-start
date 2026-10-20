---
name: demo-video
description: Show a product feature or fix working in the web view with a demo video that CI records for its pull request. Use when a pull request adds a feature or fixes a bug a user of Skill Atlas would notice, or when asked to record a demo.
---

# Demo video

A pull request that changes the product, a feature or a fix that changes what a user of Skill Atlas sees or gets, carries a video of it in use, so a reviewer sees it working before reading the diff.
Everything else gets no video: docs, specs, tests, CI, agent skills and automations, dependencies, and refactors that change no behavior.
A product change the web view does not show (the CLI alone) shows its console output in the pull request body instead.

The [Demo workflow](../../../.github/workflows/demo.yml) records the videos: on every pull request that changes `src/`, `skill-atlas` or these cases, it records every case and uploads them, with each case's last screen, as the run's `demo-videos` artifact.
Videos live only there, never on a branch or in a release: never commit a video, or any other binary.

## 1. Pick or write the case

[cases.ts](cases.ts) holds the demo cases; each one drives the web view through one feature, as a person would:

- `read-skill`: scan `./fixture`, open a skill with copies in three agents, switch from its rendered body to its `SKILL.md`; offline
- `filter-skills`: scan `JetBrains/kotlin`, filter by `test`: the word is marked in the list and in the open skill
- `scan-organization`: scan `modelcontextprotocol`, open one of its repositories, go back to the organization

When no case shows the pull request's feature, add one named after it, built like the others: start from a scan, act through the page's own controls (`#repo`, `#filter`, the list's links, the tabs), wait for what the page shows before each pause, and end on the page that proves the feature.
Pick a repository whose skills make the feature visible; one under 20 seconds of scanning keeps the video short, and a small organization keeps CI under GitHub's secondary rate limit (90 repositories tripped it, 45 do not). Keep the existing cases: they show the features merged so far.

## 2. Try it locally

Before pushing a new or changed case, record it once here: `npx playwright install chromium` once per machine, then

```bash
node .agents/skills/demo-video/record.ts --out demo-videos <case>...
```

It starts its own `./skill-atlas serve` on a free port, records each case at 1280×800 as `demo-videos/<case>.webm`, saves the page it ends on as `demo-videos/<case>.png`, and stops the server.
GitHub cases need the network; an organization needs `GITHUB_TOKEN` (`GITHUB_TOKEN=$(gh auth token)` on a machine logged in to `gh`) or the scan stops on the rate limit. `demo-videos/` is ignored.

## 3. Check CI's recording

After the push, wait for the Demo run on the pull request, then download its artifact and look at the case's `<case>.png`:

```bash
gh run list --workflow demo.yml --branch <branch> --limit 1 --json databaseId,conclusion,url
gh run download <run-id> --name demo-videos --dir /tmp/demo-<run-id>
```

It must show the feature's result, not a spinner, an error or an empty list. If it does not, fix the case or the feature and push again; a video that does not show the feature is worse than none.

## 4. Link it

In the pull request body, a `## Demo` section: the run's URL, the cases that show this change and one line on what each shows, and that the videos are in its `demo-videos` artifact.
GitHub plays a video inline only when a person drags it into the description; the artifact downloads as a zip.
Artifacts expire after 90 days; to watch a demo later, run the workflow again on the branch or on `main` from the Actions tab.
When the feature changes after review, the new push records again: link the new run in the reply.

If the Demo run fails, read its log and fix the cause; never link a run whose recording failed.

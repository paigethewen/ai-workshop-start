---
name: demo-video
description: Show a product feature or fix working in the web view with a demo video that CI records for its pull request, and check the screenshots it changes. Use when a pull request adds a feature or fixes a bug a user of Skill Atlas would notice, when the web tests' screenshots fail, or when asked to record a demo.
---

# Demo video

A pull request that changes the product, a feature or a fix that changes what a user of Skill Atlas sees or gets, carries a video of it in use, so a reviewer sees it working before reading the diff.
Everything else gets no video: docs, specs, tests, CI, agent skills and automations, dependencies, and refactors that change no behavior.
A product change the web view does not show (the CLI alone) shows its console output in the pull request body instead.

The demo cases are the web tests, [demo.spec.ts](../../../e2e/web/demo.spec.ts): [CI](../../../.github/workflows/ci.yml)'s `web` job runs them on every push to a pull request, records each one as a video, and uploads the videos as the run's `web-videos` artifact.
Each case's key moments are screenshots, compared to the pixel with the baselines in [e2e/web/screenshots](../../../e2e/web/screenshots/).
Every run is the same: the tests run in the image of [the Dockerfile](../../../e2e/web/Dockerfile), the same Linux, Chromium and fonts here and on CI, at 1280×800, with GitHub answering from [github.json](../../../e2e/web/github.json), without the network.
Never commit a video, or any binary but the baselines, and never a baseline yourself.

## 1. Pick or write the case

- `read-skill`: scan `./fixture`, open a skill with copies in three agents, switch from its rendered body to its `SKILL.md`
- `filter-skills`: scan `JetBrains/kotlin`, filter by `test`: the word is marked in the list and in the open skill
- `scan-organization`: scan `modelcontextprotocol`, open one of its repositories, go back to the organization
- `reload-skill`: scan `./fixture`, open `test-runner`, reload: the same skill is open, its `#<path>` kept


When no case shows the pull request's feature, add one named after it, built like the others: start from a scan, act through the page's own controls (`#repo`, `#filter`, the list's links, the tabs), wait for what the page shows before each pause and each `moment`, and end on the page that proves the feature.
Scan `./fixture`, or a GitHub repository already in `github.json`; a new one needs `GITHUB_TOKEN=$(gh auth token) node e2e/web/record.ts` with the repository added to it, and changes the data, and so the screenshots, of the cases that scan it. Keep the existing cases: they show the features merged so far.

## 2. Run it

`npm run e2e` runs every case in Docker; `npm run e2e -- -g <case>` one. The videos land in `test-results/`, the report in `playwright-report/` (`npx playwright show-report playwright-report`).
A screenshot no baseline matches fails the run, a new one too: that is expected when the change shows, see step 3.

## 3. Screenshots that change

When CI's `web` job fails on screenshots, it comments on the pull request with each changed one, and links each one's before, after and diff as the `screenshot-diffs` artifact:

```bash
gh run download <run-id> --name screenshot-diffs --dir /tmp/diffs-<run-id>
```

Look at every `after.png` and `diff.png`. A change the pull request does not mean is a bug: fix it and push.
A change it means, a new case's screenshots included, is for a person to accept: in the pull request body, say which screenshots change and why, and leave the check failing.
Never add the `accept-screenshots` label, never commit to `e2e/web/screenshots`, and never loosen the comparison: CI fails any commit of the branch that changes a baseline.
The reviewer accepts with the label; the [Screenshots workflow](../../../.github/workflows/screenshots.yml) takes them again on Linux, commits them, and runs CI again. Without a `SCREENSHOTS_TOKEN` secret, CI on the pull request then waits for a maintainer's Approve workflows to run.

## 4. Link it

In the pull request body, a `## Demo` section: the CI run's URL, the cases that show this change and one line on what each shows, and that the videos are in its `web-videos` artifact.
GitHub plays a video inline only when a person drags it into the description; the artifact downloads as a zip, kept 30 days; to watch it later, run CI again on the branch from the Actions tab.
When the feature changes after review, the new push records again: link the new run in the reply.
If the `web` job fails for any reason but an intended screenshot, read its log and fix the cause; never link a run whose cases failed.

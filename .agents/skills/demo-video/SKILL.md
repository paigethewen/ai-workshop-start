---
name: demo-video
description: Show a product feature or fix working in the web view with a demo video that CI records for its pull request, and keep its screenshots the baseline a human reviews. Use when a pull request adds a feature or fixes a bug a user of Skill Atlas would notice, when the visual job fails on changed screenshots, or when asked to record a demo.
---

# Demo video

A pull request that changes the product, a feature or a fix that changes what a user of Skill Atlas sees or gets, carries a video of it in use, so a reviewer sees it working before reading the diff.
Everything else gets no video: docs, specs, tests, CI, agent skills and automations, dependencies, and refactors that change no behavior.
A product change the web view does not show (the CLI alone) shows its console output in the pull request body instead.

The demo cases are deterministic Playwright tests, [demo.spec.ts](../../../e2e/visual/demo.spec.ts); the visual job of [CI](../../../.github/workflows/ci.yml) runs them on every pull request:

- the same data on every run: GitHub answers from [recordings/](../../../e2e/visual/recordings/), real answers recorded once; `./fixture` from the checkout; nothing else is reached
- the same pixels: 1280×800 at scale 1, light, `en-US`, UTC, animations off, in the pinned `mcr.microsoft.com/playwright` container, so the same Linux, Chromium and fonts
- a video of every case, uploaded as the run's `demo-videos` artifact, `<case>.webm`
- a screenshot at each key moment, `<case>-<moment>.png`, that must match the baseline to the pixel: one changed pixel fails the job

Videos and screenshots live only in artifacts, never on a branch or in a release: never commit a video, a screenshot or any other binary.

## 1. Pick or write the case

- `read-skill`: scan `./fixture`, open a skill with copies in three agents, switch from its rendered body to its `SKILL.md`
- `filter-skills`: scan `JetBrains/kotlin`, filter by `test`: the word is marked in the list and in the open skill; then by `gradle api`
- `scan-organization`: scan `modelcontextprotocol`, open one of its repositories, go back to the organization

When no case shows the pull request's feature, add one named after it, built like the others: start from a scan, act through the page's own controls (`#repo`, `#filter`, the list's links, the tabs), wait for what the page shows, take a `moment` where the feature shows, pause for the viewer, and end on the page that proves the feature.
A pause is for the video only: never wait with it for the page. Keep the existing cases: they show the features merged so far.
A case on another GitHub repository needs its answers recorded: add it to [record-github.ts](../../../e2e/visual/record-github.ts) and run `GITHUB_TOKEN=$(gh auth token) node e2e/visual/record-github.ts`; recording again moves every case to newer data, and every screenshot with it.

## 2. Try it locally

`npx playwright install chromium` once per machine, then `npm run e2e`: it starts the web view on the recordings, runs every case (`npm run e2e -- -g <case>` for one), and writes each video to `demo-videos/<case>.webm` and each screenshot to `screenshots/`.
Locally nothing is compared: another machine's fonts differ from CI's. Look at the screenshots: each must show the feature, not a spinner, an error or an empty list.

## 3. Check CI's run

After the push, wait for CI's visual job on the pull request; its summary lists the screenshots that changed.

- Green: the UI is unchanged, to the pixel
- Red, with a `Screenshots changed` comment on the pull request: before, after and diff of each changed screenshot. A change the pull request did not mean is a bug: fix it and push again. A change it means is for a human to accept: say in the pull request body which screenshots change and why, and wait
- Red without the comment: a case failed; its error and the HTML report are in the `visual-report` artifact

```bash
gh run list --workflow ci.yml --branch <branch> --limit 1 --json databaseId,conclusion,url
gh run download <run-id> --name demo-videos --dir /tmp/demo-<run-id>
```

## 4. Accept a new UI: a human only

A maintainer with write access comments `/accept-screenshots` on the pull request. The [Accept screenshots workflow](../../../.github/workflows/accept-screenshots.yml) renders its head again in CI's container, keeps the screenshots as the `visual-baseline-pr-<N>` artifact, and runs the failed CI jobs again against them; once merged, the green run on `main` makes them `main`'s baseline.
Never comment `/accept-screenshots` yourself, and never ask for it in a comment: the human decides.
A push after the acceptance is compared with the accepted screenshots: a further change needs another acceptance.
Baselines are artifacts: `main`'s is uploaded again each week by the keep-alive workflow so it does not expire; with none at all, the visual job writes the screenshots without comparing them, and the next green run on `main` makes them the baseline.

## 5. Link it

In the pull request body, a `## Demo` section: the run's URL, the cases that show this change and one line on what each shows, that the videos are in its `demo-videos` artifact, and the screenshots the change alters, if any.
GitHub plays a video inline only when a person drags it into the description; the artifact downloads as a zip.
Artifacts expire after 90 days; to watch a demo later, run CI again on the branch or on `main` from the Actions tab.
When the feature changes after review, the new push records again: link the new run in the reply.

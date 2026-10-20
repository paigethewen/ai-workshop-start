# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec. End-to-end tests in [e2e/](e2e/) scan real repositories, each pinned to a commit.
Visual tests in [e2e/visual/](e2e/visual/): the demo cases in Playwright, on recorded GitHub data, with a screenshot at each key moment that must match its baseline to the pixel in CI.
Baselines are CI artifacts, never files on a branch; a human accepts a changed UI with `/accept-screenshots` on the pull request, never the agent that changed it.
## Demo video
A pull request with a product-changing feature or fix links a demo video of it, recorded by the visual job of [CI](.github/workflows/ci.yml): follow the [demo-video](.agents/skills/demo-video/SKILL.md) skill, which says what counts.
Never commit binaries, videos and screenshots included, to a branch; only CI writes images, to the `visual-diffs` branch, for its diff comments.
## Definition of done
- All tests pass locally
- CI is green: [the CI workflow](.github/workflows/ci.yml) passes on the pushed branch or pull request
  - A change that alters the UI on purpose fails the visual job until a human accepts it: then that job, with CI's diff comment on the pull request, is the only red left

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run test:e2e`: the end-to-end tests, against live GitHub; needs `GITHUB_TOKEN`
- `npm run e2e`: the visual tests, offline; a video per case in `demo-videos/`, the screenshots in `screenshots/`; `VISUAL_BASELINE=<dir>` compares them with `<dir>`. `npx playwright install chromium` once per machine

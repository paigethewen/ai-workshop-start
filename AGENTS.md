# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec. End-to-end tests in [e2e/](e2e/) scan real repositories, each pinned to a commit.
Web tests in [e2e/web/](e2e/web/) drive the web view in Chromium, with GitHub replayed: a video of every run, and screenshots compared to the pixel with baselines taken on Linux in CI.
## Demo video
A pull request with a product-changing feature or fix links a demo video of it, recorded by CI's web tests: follow the [demo-video](.agents/skills/demo-video/SKILL.md) skill, which says what counts.
Never commit binaries, videos included, to a branch; the screenshots' baselines are the one exception, and only a person changes them, with the `accept-screenshots` label.
## Definition of done
- All tests pass locally
- CI is green: [the CI workflow](.github/workflows/ci.yml) passes on the pushed branch or pull request

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run test:e2e`: the end-to-end tests, against live GitHub; needs `GITHUB_TOKEN`
- `npm run e2e`: the web tests, in Docker, offline; never `--update-snapshots`

# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec. End-to-end tests in [e2e/](e2e/) scan real repositories, each pinned to a commit.
## Demo video
A pull request with a product-changing feature or fix links a demo video of it, recorded by the [Demo workflow](.github/workflows/demo.yml): follow the [demo-video](.agents/skills/demo-video/SKILL.md) skill, which says what counts.
Never commit binaries, videos included, to a branch.
## Definition of done
- All tests pass locally
- CI is green: [the CI workflow](.github/workflows/ci.yml) passes on the pushed branch or pull request

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run test:e2e`: the end-to-end tests, against live GitHub; needs `GITHUB_TOKEN`

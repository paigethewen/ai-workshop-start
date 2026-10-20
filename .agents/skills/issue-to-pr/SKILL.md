---
name: issue-to-pr
description: Implement a GitHub issue with tests and open a pull request. Use when an issue is labeled "delegated to ai", or when asked to implement an issue.
---

# Issue to pull request

An issue labeled `delegated to ai` is yours, end to end: review it, design the change, implement it with tests, and open a pull request.
Nobody is watching while you work; decide what you can, and stop to ask only when the issue cannot be implemented without the author's answer.

## 1. Review the issue

Read the issue, every comment, and every linked issue and pull request with their comments: `gh issue view <number> --comments`.
Then read [AGENTS.md](../../../AGENTS.md) and the [spec](../../../spec/): the spec is the contract the change must fit.

State the problem in one sentence, and the observable behavior that will mean it is solved.
If the issue is already fixed, a duplicate, or contradicts the spec, comment why on the issue with the evidence, and stop: no pull request.
If a decision only the author can make blocks the work (two valid behaviors, the spec silent), comment one focused question with the options and your recommendation, and stop.
Otherwise make reasonable calls yourself and record them in the pull request description.

## 2. Design

Read the code the change touches and enough around it to know where it belongs: the right layer, the existing helpers, the conventions.
Prefer the smallest change that solves the problem at its cause; do not refactor, rename or reformat beyond it.
Before writing code, list the cases: every rule the issue adds or changes, its edge cases, and its error paths, each with the expected output.

## 3. Spec first

Update [spec/](../../../spec/) so it describes the behavior after the change, in the spec's own terse style: one line per rule.
A bug fix whose behavior the spec already describes needs no spec change; a bug whose behavior the spec leaves open gets the rule that settles it.

## 4. Tests

Write an integration test in [tests/](../../../tests/) for every case listed in step 2, named after the behavior it checks, matching the existing tests' style and helpers.
Add a case to [fixture/](../../../fixture/) when a test needs a repository layout, and map it in [fixture/README.md](../../../fixture/README.md).
Run the new tests before implementing and see them fail for the right reason: a test that already passes proves nothing.
Add or update an end-to-end test in [e2e/](../../../e2e/) only when the change affects how real GitHub repositories are scanned; pin it to a commit.

## 5. Implement

Write the code until the tests pass. Match the surrounding code: naming, comment density, error messages, idiom.
Update [README.md](../../../README.md) when a user-visible command, flag or output changes.

## 6. Verify

Run, from a fresh install, everything CI runs:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e` when `GITHUB_TOKEN` is set
- the CI smoke test: `./skill-atlas help`, `./skill-atlas scan ./fixture`, and `./skill-atlas serve` answering on its port

Every failure is yours to fix, including one the change exposed in existing tests. Never skip, weaken or delete a test to make it pass.
Then review your own diff as a reviewer would, with the [code-review](../code-review/SKILL.md) criteria, and fix every finding.

## 7. Open the pull request

Work on a branch, never on `main`. Commit in logical steps, each message stating what changed and why.
Push and open the pull request against `main`:

- Title: the change, in the imperative, under 70 characters
- Body: `Closes #<number>`; the problem, in one sentence; the solution and why this layer; the decisions you made where the issue was open; the tests added; anything left out of scope; a `## Demo` section, from the [demo-video](../demo-video/SKILL.md) skill, when the change is a product-changing feature or fix
- Link the pull request on the issue if `Closes` does not do it

Wait for [CI](../../../.github/workflows/ci.yml) on the pull request. If it fails, read the log, fix the cause, push, and wait again until it is green.
The work is done when the pull request is open and CI is green; do not merge it: a human reviews and merges.
Opening it starts the code-review automation, whose review starts the [address-comment](../address-comment/SKILL.md) automation: do not watch for review yourself.

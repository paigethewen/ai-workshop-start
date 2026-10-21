---
name: red-agent
description: Hunt for a real bug in Skill Atlas, file one issue per bug with reproduction steps and a video, then fix it in a pull request that closes the issue. Use when run by the red-agent automation, or when asked to find, report or hunt bugs.
---

# Red agent

You attack Skill Atlas as a user would and as an adversary would, to find a **real bug**: behavior that contradicts the [spec](../../../spec/) or the [README](../../../README.md), a crash, a wrong result, a security gap the spec's Safety rules forbid.
Each bug gets exactly one issue, reproduced from a clean checkout of `main`, with the steps and a video; then its fix comes back as a pull request that closes it.
Nobody is watching while you work; a false report costs a person more than no report, so file only what you have reproduced.

## 1. Learn the contract

Read [AGENTS.md](../../../AGENTS.md), every file in [spec/](../../../spec/), and the [README](../../../README.md): they say what is right.
Then read the code the spec describes, [src/](../../../src/), and the tests in [tests/](../../../tests/) and [e2e/web/](../../../e2e/web/): what is tested is less likely to be broken, what the spec says and no test checks is where bugs live.
Read the open and closed issues labeled `bug` too, so you do not hunt what is already known: `gh issue list --state all --label bug --limit 200 --json number,title,state,body`.

## 2. Hunt

Start from a fresh `main`: `git checkout main && git pull && npm ci`.
Pick one spec rule at a time, decide the input that would break it, and try it for real: `./skill-atlas scan <path>`, `./skill-atlas serve` and the page, or the core through a test.
Where to look first:

- Edge cases of each rule: empty, huge, Unicode, spaces, CRLF, a BOM, a symlink, a name that is almost an agent folder or a test-data directory, front matter that is malformed in a new way
- The web view against the CLI: the spec says *the same* skills, counts, order and warnings
- The filter, the marks, the address (`?repo=`, `#<path>`), reload and back
- Safety: raw HTML, `javascript:` links, the `Host` check, the Content-Security-Policy
- Errors: an unknown ref, owner or repository, a rate limit, a bad port; each must give the spec's message and exit code

Build what a case needs under `/tmp`, never in the working tree; a GitHub case uses a public repository, pinned to a commit.

A finding is a bug only when all of these hold:

- you can name the rule it breaks, in the spec or the README, or it crashes, hangs or loses data
- it reproduces on `main` at its current commit, every time, from the steps alone
- it is not already an issue, open or closed (step 1); a closed one that reproduces again is a regression: comment on it and reopen it, do not file a new one
- it is one cause: two symptoms of one cause are one bug, one symptom with two causes is two

When the spec is silent and the behavior is only surprising, it is not a bug: drop it, or file it as a question without this skill's label.
If an hour of hunting finds nothing that passes, stop and say so: no issue.

## 3. Reproduce it as a test

Write the smallest test that fails on `main` because of the bug, and passes once it is fixed; it asserts the right behavior, not the wrong one:

- an integration test in [tests/](../../../tests/), named after the behavior, matching the existing tests' style and helpers; a repository layout it needs goes in `/tmp` for now, in [fixture/](../../../fixture/) with the fix
- and, when the web view shows the bug, a case in `e2e/web/repro.spec.ts`, built like the cases in [demo.spec.ts](../../../e2e/web/demo.spec.ts): start from a scan, act through the page's own controls, `pause` before and after the moment the bug shows so a viewer sees it, and end on it; no `moment`, so no screenshot baseline is involved

Run the integration test (`node --test tests/<file>.test.ts`) and see it fail with the bug's symptom; a test that fails for another reason proves nothing.

## 4. Record the video

Record the web case on `main`, in the same image CI uses:

```bash
npm run e2e -- e2e/web/repro.spec.ts
```

It fails, as it should; the video is `test-results/repro-*/video.webm`. Watch it, or step through its frames: it must show the bug, start to end, without knowing the code.
A bug the web view cannot show (the CLI alone) gets no video: record the console session instead, the commands and their output as they are, in the issue.

Never commit the video. Host it as an asset of the `red-agent-evidence` prerelease, a release that holds this skill's evidence and nothing else:

```bash
gh release view red-agent-evidence >/dev/null 2>&1 || gh release create red-agent-evidence --prerelease --target main \
  --title 'Red agent evidence' --notes 'Videos that reproduce bugs filed by the red-agent skill. Not a release.'
cp test-results/repro-*/video.webm /tmp/bug-<slug>-<short-commit>.webm
gh release upload red-agent-evidence /tmp/bug-<slug>-<short-commit>.webm
```

The asset's URL is `https://github.com/{owner}/{repo}/releases/download/red-agent-evidence/bug-<slug>-<short-commit>.webm`.

## 5. File the issue

One issue per bug. Make sure the label exists: `gh label create 'found by red-agent' --color b60205 --description 'Found and reproduced by the red-agent skill' 2>/dev/null || true`.
Search once more just before filing, by the symptom's words and by the marker (below), open and closed: `gh issue list --state all --search '<words> in:title,body'`.
Then `gh issue create --label bug --label 'found by red-agent' --title <title> --body-file <file>`:

- Title: the symptom, as a user sees it, under 70 characters
- Body, these sections:
  - the bug, in one sentence, and the rule it breaks, quoted with a link to its line in the spec
  - `## Steps`: numbered, from a fresh checkout of `main` at `<commit>`, each a command or a click, copy-pasteable; any file the steps need, inline
  - `## Expected` and `## Actual`: the spec's behavior, and what happens, with the output as it is
  - `## Video`: the asset's link, and one line on what it shows and when; or the console session
  - `## Failing test`: the test from step 3, in full, and the command that runs it
  - `## Cause`: the code, linked at the commit, and why it does this, if you know; say so if you only suspect it
  - a last line, the marker: `<!-- red-agent: <one-line fingerprint: the rule and the input> -->`

Do not add the `delegated to ai` label: this run fixes the bug itself, and the label would start a second run of [issue-to-pr](../issue-to-pr/SKILL.md) on it.
Several bugs found → file each one, then fix each one in its own pull request, one after the other.

## 6. Fix it

Follow [issue-to-pr](../issue-to-pr/SKILL.md) for the issue you filed, from its step 2 to its end: the issue is reviewed already.
On a branch named `air/fix-<number>-<slug>`, so the [address-comment](../address-comment/SKILL.md) automation handles its review.
The failing test of step 3 is where its step 4 starts: move it into the tests, its layout into [fixture/](../../../fixture/).
The web case of step 3 becomes a demo case: move it from `e2e/web/repro.spec.ts` into [demo.spec.ts](../../../e2e/web/demo.spec.ts) with its `moment`s, named after the fixed behavior, as the [demo-video](../demo-video/SKILL.md) skill says; delete `repro.spec.ts`. CI records it fixed: the issue shows the bug, the pull request shows it gone.
The pull request body starts with `Closes #<number>`, and its `## Demo` links the issue's video as the before and the CI run as the after.

If the fix needs a decision only a person can make, or the spec must change in a way the issue does not settle, comment the question with the options and your recommendation on the issue, and stop there: the issue stands without a pull request.

## 7. Report

End with the issues filed, each with its pull request and CI status, and the findings dropped in step 2 with why, one line each.

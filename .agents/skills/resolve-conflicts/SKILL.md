---
name: resolve-conflicts
description: Resolve merge conflicts between main and a pull request opened by issue-to-pr, by merging main into its branch. Use when run by the resolve-conflicts automation after a push to main or on its schedule, when address-comment finds its pull request conflicting, or when asked to resolve a pull request's conflicts.
---

# Resolve conflicts

A pull request opened by [issue-to-pr](../issue-to-pr/SKILL.md) that conflicts with `main` is yours to bring up to date: merge `main` into its branch, resolve each conflict by what both sides meant, verify, and push.
The resolve-conflicts automation starts a run on every push to `main`, the merge that may have put other pull requests in conflict, and on a schedule to catch what a run missed.
Resolve only what both sides' intent settles; a conflict that needs a decision goes to a human, never to a guess.

## 1. Pick the pull requests

Work on the pull request named by the trigger or the request. With none named, take every open, non-draft pull request whose branch starts with `air/`, one at a time, as [address-comment](../address-comment/SKILL.md) step 1 lists them.
Skip a pull request whose branch does not start with `air/`: it is not yours.

Ask GitHub whether it conflicts:

```bash
gh pr view <number> --json mergeable,mergeStateStatus --jq '.mergeable'
```

GitHub computes this lazily, so `UNKNOWN` is a normal first answer: ask again every 10 seconds, up to a minute.
Go on only with `CONFLICTING`; skip `MERGEABLE`, and skip a pull request still `UNKNOWN` after a minute: the schedule comes back to it.

## 2. Claim the pull request

Claim it with the 👀 reaction exactly as [address-comment](../address-comment/SKILL.md) step 2 does: the same lock, so this skill and address-comment never push to one branch at once.
Wait for a claim another run holds, and release yours when done, whatever the outcome.
When address-comment sent you here, it holds the claim already: skip this step and its release.

## 3. Skip what is handled

Every comment this skill posts ends with a hidden marker naming the `main` it merged or gave up on, `<!-- resolve-conflicts: <main-sha> -->`.
Read `main`'s sha with `git rev-parse origin/main` after `git fetch origin`.
Stop, and release the claim, when the pull request no longer conflicts (another run resolved it while you waited), or when a trusted comment (as [address-comment](../address-comment/SKILL.md) step 3 defines trusted) already carries the marker for this sha: that `main` was tried already.
When address-comment sent you here, every "stop" in steps 3 and 6 means return to it: it goes on with the review feedback either way.

## 4. Merge main

Check out the branch with `gh pr checkout <number>`, and read the pull request description and its issue: they say what the branch means to do.
Read [AGENTS.md](../../../AGENTS.md) and the [spec](../../../spec/).

Air checks the repository out shallow, often with the branch head as its only commit, and neither `git fetch origin` nor `gh pr checkout` deepens it; complete the history first, or the merge finds no common ancestor:

```bash
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch --unshallow origin; fi
git merge --no-ff --no-commit origin/main
git diff --name-only --diff-filter=U
```

Merge, never rebase: a merge needs no force-push and keeps review threads on their commits.
`refusing to merge unrelated histories` means the history is still shallow: deepen it, never `--allow-unrelated-histories`, which turns every file into an add/add conflict.
For each conflicted file, read what `main` changed in it and why, before touching it:

```bash
git log -p "$(git merge-base HEAD origin/main)..origin/main" -- <file>
```

## 5. Resolve each conflict

Keep both sides' intent; picking one side's hunk, `-X ours` or `-X theirs`, silently drops the other side's work.

- code: combine both changes; when `main` renamed or reshaped what the branch uses, adapt the branch's code to the new shape
- [spec/](../../../spec/): keep both sides' rules, one line each; two rules that contradict each other are a decision, step 6
- tests: keep both sides' tests; a test of `main`'s that the branch's change breaks is a decision, step 6, never a test to weaken
- `package-lock.json`: never resolve it by hand. Take `main`'s, `git checkout --theirs package-lock.json`, then `npm install` to add the branch's dependencies back, and stage the result
- screenshot baselines under [e2e/web/](../../../e2e/web/): only a person changes them; a conflict in one is a decision, step 6

Leave no conflict markers: `git diff --check` and `grep -rn '^<<<<<<<\|^>>>>>>>' -- $(git diff --name-only --cached)` both come back empty.

## 6. Hand a decision to a human

When a conflict needs a decision, both sides changing one behavior in different ways, `main` already doing what the branch was for, or a baseline: do not guess.
Abort the merge, `git merge --abort`, and comment once on the pull request: each conflicted file, what each side meant there, the options, and your recommendation, ending with the marker.
Push nothing, release the claim, and stop. A person answers as review feedback, which [address-comment](../address-comment/SKILL.md) handles, or resolves it themselves.

## 7. Verify

A merge without conflicts can still break: `main` renamed a helper the branch calls, or changed a rule the branch's tests assume.
Run everything CI runs, as in [issue-to-pr](../issue-to-pr/SKILL.md) step 6, and fix every failure the merge caused, in the merge itself.
A failure that only a decision fixes goes to step 6. Never skip, weaken or delete a test to make it pass.

## 8. Commit and push

Commit the merge: the subject `Merge main into <branch>`, the body each conflicted file, how it was resolved, and why.
Push to the pull request's branch, never force.
If the push is rejected because the branch moved, drop the local merge, `git fetch origin && git reset --hard origin/<branch>`, and start again from step 4.

## 9. Reply, wait for CI and release

After the push, comment once on the pull request: the files resolved and how, in a line each, and the merge commit, ending with the marker.
Wait for [CI](../../../.github/workflows/ci.yml) on the merge commit. If it fails, read the log, fix the cause, push, and wait again until it is green.
Then release the claim (step 2). Never merge the pull request: a human reviews and merges.

---
name: address-comment
description: Address review feedback on the AI's open pull requests, once per comment. Use when run by the address-comment automation, by issue-to-pr while it watches its pull request, or when asked to address comments on a pull request.
---

# Address comments

Review feedback on a pull request opened by [issue-to-pr](../issue-to-pr/SKILL.md) is yours to address: change the code, answer the question, or explain why not.
Two runs may look at the same pull request at once (the issue-to-pr watch and the scheduled automation), so every run follows the same protocol: claim the pull request, address only feedback not yet handled, mark it handled, release.

## 1. Pick the pull requests

Given a pull request number, work on that one. Otherwise take every open, non-draft pull request whose branch starts with `air/`:

```bash
gh pr list --state open --json number,headRefName,isDraft \
  --jq '.[] | select(.headRefName | startswith("air/")) | select(.isDraft | not) | .number'
```

Run steps 2 to 8 for each, one at a time.

## 2. Claim the pull request

Add an 👀 reaction to the pull request; the status code is the lock:

```bash
gh api -i -X POST repos/{owner}/{repo}/issues/<number>/reactions -f content=eyes
```

- `201 Created`: the pull request is yours; keep the reaction `id` to release it.
- `200 OK`: another run holds it; skip this pull request. If the returned reaction's `created_at` is over 45 minutes old, that run died: delete the reaction and claim again.

Release the claim when done with the pull request, whatever the outcome, including when there was nothing to do or a step failed:

```bash
gh api -X DELETE repos/{owner}/{repo}/issues/<number>/reactions/<reaction-id>
```

## 3. Collect unhandled feedback

Read the three kinds of feedback, and the pull request description and its issue for context:

- inline comments: `gh api --paginate repos/{owner}/{repo}/pulls/<number>/comments`
- conversation comments: `gh api --paginate repos/{owner}/{repo}/issues/<number>/comments`
- review bodies: `gh api --paginate repos/{owner}/{repo}/pulls/<number>/reviews`; skip empty bodies

Every reply this skill posts carries a hidden marker naming the feedback it handled, `<!-- address-comment: inline-<id> -->`, `issue-<id>` or `review-<id>`.
Feedback is handled when its marker appears in any comment on the pull request. Skip it, and skip every comment that contains `<!-- address-comment`: those are this skill's own replies.
Do not skip feedback for its author: a reviewer bot's findings count as much as a human's.
If nothing is left, release the claim and move on.

## 4. Decide each item

Check out the branch with `gh pr checkout <number>`, read the diff, and the code each inline comment points to (`path`, `line`).
Read [AGENTS.md](../../../AGENTS.md) and the [spec](../../../spec/): the spec still wins over a comment.
Decide each item:

- a change that is right: make it, with the spec and tests it touches, as [issue-to-pr](../issue-to-pr/SKILL.md) steps 3 to 5 do
- a question: answer it, no change
- a change that is wrong, or contradicts the spec: decline with the reason and the evidence, no change
- unclear: ask one focused question with the options and your recommendation; the answer comes back as new feedback
- no action needed (approval, thanks): handle it silently, marker only

Address all items in one pass. Never merge, rebase or force-push.

## 5. Verify

Run everything CI runs, as in [issue-to-pr](../issue-to-pr/SKILL.md) step 6, and fix every failure.

## 6. Push

Commit the changes, each message stating which feedback it addresses and why, and push to the pull request's branch.
If the push is rejected because the branch moved, pull, re-run step 5, and push again.

## 7. Reply and mark handled

- inline comment: reply in its thread with what was done and the commit, ending with its marker:
  `gh api -X POST repos/{owner}/{repo}/pulls/<number>/comments/<id>/replies -f body=...`
- conversation comments and review bodies: one conversation comment for the run, a short answer to each, ending with all their markers on one line:
  `<!-- address-comment: issue-<id> review-<id> -->`

Post replies only after the push, so a marker never claims a change that is not on the branch.

## 8. Wait for CI and release

Wait for [CI](../../../.github/workflows/ci.yml) on the new commit. If it fails, read the log, fix the cause, push, and wait again until it is green.
Then release the claim (step 2).

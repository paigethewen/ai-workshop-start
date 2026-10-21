---
name: status-update
description: Summarize the pull requests merged and the issues solved in the last 3 hours as a short Slack message, and post it to the automation's channels. Use when the status-update automation runs, every 3 hours, or when asked for a status update.
---

# Status update

Every 3 hours, tell the team what shipped: the pull requests merged and the issues solved since the last update, in one short message a person reads in ten seconds.
The automation that runs this skill names the Slack channels; post the same message to each of them.

## 1. Collect

The window is the 3 whole hours before the current hour, in UTC: a run that starts at 12:04 or 12:40 covers 09:00 to 12:00.
The automation runs on the hour, every 3 hours, so consecutive windows meet: nothing is missed and nothing is reported twice, however late a run starts within its hour.
A run asked for another window ("since Monday", "today") uses that one instead.

```bash
until=$(date -u +%Y-%m-%dT%H:00:00Z)
since=$(date -u -d "$until - 3 hours" +%Y-%m-%dT%H:%M:%SZ)
last=$(date -u -d "$until - 1 second" +%Y-%m-%dT%H:%M:%SZ)  # ranges include both ends

gh pr list --state merged --search "merged:$since..$last" --limit 100 \
  --json number,title,url,author,mergedAt,labels,closingIssuesReferences

gh issue list --state closed --search "closed:$since..$last reason:completed" --limit 100 \
  --json number,title,url,author,closedAt,labels
```

Keep every merged pull request.
Keep a closed issue only when it was solved, closed as completed, not as not planned or duplicate, and it is either:

- labeled `bug`, whoever filed it, or
- filed by a person: `author.is_bot` is false and the login does not end in `[bot]`

Drop the rest. An issue a merged pull request closes is listed once, under the issue, with the pull request's number beside it; the pull request is not listed again under *Merged*, but still counts in the headline.

If nothing is left, post nothing and stop: an empty update is noise.

## 2. Write

Slack `mrkdwn`, not Markdown: `*bold*`, `_italic_`, links as `<url|text>`, no headings, no tables.
Short: one line per item, the title as written, trimmed to about 70 characters, no descriptions; at most 8 items per section, then `…and N more` linking to the full list on GitHub.
Group the pull requests by kind, from their labels and titles: features first, then fixes, then the rest (docs, CI, skills, chores).
The headline counts what shipped; name what matters most in a few words if one item stands out.

```
:rocket: *Skill Atlas · 09:00–12:00 UTC*
4 PRs merged · 2 issues solved

*Merged*
:sparkles: <https://github.com/o/r/pull/22|#22> Tidy the web view: first skill on scan · _@paigethewen_
:gear: <https://github.com/o/r/pull/19|#19> Fix CI · _@paigethewen_

*Solved*
:bug: <https://github.com/o/r/issues/18|#18> Copy button copies the wrong file · via #21
:white_check_mark: <https://github.com/o/r/issues/9|#9> Scan the organization · via #20
```

Emoji by kind: `:sparkles:` feature, `:wrench:` fix, `:books:` docs, `:gear:` CI and tooling, `:robot_face:` agent skills, `:bug:` solved bug, `:white_check_mark:` other solved issue.
Leave a section out when it is empty. Write times in UTC, and the date too when the window crosses midnight.

## 3. Post

Post the message to every channel the automation names, with the Slack tool, as one message each; never in a thread, never edited into an earlier post.
If no channel is named, print the message instead and post nothing.
If a post fails, say which channel and why, and still post to the others.

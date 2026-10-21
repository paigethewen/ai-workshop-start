// What CI posts when the web tests' screenshots differ from their baselines, from Playwright's JSON report,
// as e2e/web/report.ts reads it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changed, comment, MARKER } from '../e2e/web/report.ts';

const result = (attachments: string[], errors: string[] = []) => ({
  attachments: [{ name: 'video', path: '/work/test-results/x/video.webm' }, ...attachments.map((name) => ({ name, path: `/work/test-results/x/${name}` }))],
  errors: errors.map((message) => ({ message })),
});

const REPORT = {
  suites: [
    {
      suites: [
        {
          specs: [
            { title: 'read-skill: scan ./fixture', tests: [{ results: [result([])] }] },
            {
              title: 'filter-skills: scan JetBrains/kotlin',
              tests: [
                {
                  results: [
                    result(
                      ['filter-skills-2-filtered-expected.png', 'filter-skills-2-filtered-actual.png', 'filter-skills-2-filtered-diff.png', 'filter-skills-6-new-actual.png'],
                      [
                        'Error: expect(page).toHaveScreenshot(expected) failed\n\n  1234 pixels (ratio 0.01 of all image pixels) are different.\n\n  Snapshot: filter-skills-2-filtered.png',
                        "Error: A snapshot doesn't exist at /work/e2e/web/screenshots/filter-skills-6-new.png.",
                      ],
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('a screenshot off its baseline is listed with its test, its changed pixels, and its before, after and diff', () => {
  assert.deepEqual(changed(REPORT)[0], {
    name: 'filter-skills-2-filtered',
    test: 'filter-skills',
    pixels: 1234,
    before: '/work/test-results/x/filter-skills-2-filtered-expected.png',
    after: '/work/test-results/x/filter-skills-2-filtered-actual.png',
    diff: '/work/test-results/x/filter-skills-2-filtered-diff.png',
  });
});

test('a screenshot without a baseline is listed as new, with only its after, as demo.spec.ts attaches it', () => {
  assert.deepEqual(changed(REPORT)[1], { name: 'filter-skills-6-new', test: 'filter-skills', pixels: undefined, after: '/work/test-results/x/filter-skills-6-new-actual.png' });
});

test('a passing test, and a video, list nothing', () => {
  assert.deepEqual(changed({ suites: [{ specs: [REPORT.suites[0].suites[0].specs[0]] }] }), []);
});

test('the comment lists every changed screenshot, links the artifacts, and leaves the acceptance to a person, by label', () => {
  const text = comment(changed(REPORT), { diffs: 'https://diffs', report: 'https://report', videos: 'https://videos' });
  assert.ok(text.startsWith(`${MARKER}\n## Screenshots changed\nA screenshot of the web tests differs from its baseline:`));
  assert.match(text, /^\| `filter-skills-2-filtered` \| `filter-skills` \| 1,234 pixels \|$/m);
  assert.match(text, /\[screenshot-diffs\]\(https:\/\/diffs\)/);
  assert.match(text, /\[web-report\]\(https:\/\/report\)/);
  assert.match(text, /\[web-videos\]\(https:\/\/videos\)/);
  assert.match(text, /\*\*A person reviews them\.\*\* If the new UI is intended, add the label `accept-screenshots`/);
});

test('a screenshot without a baseline is listed apart, as new, not as changed', () => {
  const text = comment(changed(REPORT), {});
  assert.match(text, /^A new screenshot has no baseline yet:\n\n\| Screenshot \| Test \|\n\| --- \| --- \|\n\| `filter-skills-6-new` \| `filter-skills` \|$/m);
  assert.doesNotMatch(text, /^\| `filter-skills-6-new` \| `filter-skills` \| .+ \|$/m);
  assert.match(text, /and each new one's `after\.png`/);
});

test('only new screenshots: the comment says they are new, and none changed', () => {
  const moments = [
    { name: 'copy-skill-1-copied', test: 'copy-skill', after: 'a' },
    { name: 'copy-skill-2-pasted', test: 'copy-skill', after: 'a' },
  ];
  const text = comment(moments, { diffs: 'https://diffs' });
  assert.ok(text.startsWith(`${MARKER}\n## New screenshots\n2 new screenshots of the web tests have no baseline yet:`));
  assert.doesNotMatch(text, /changed|differ|before\.png|diff\.png|slider/);
  assert.match(text, /^\| `copy-skill-2-pasted` \| `copy-skill` \|$/m);
  assert.match(text, /^Each one's `after\.png` \(this branch\): \[screenshot-diffs\]\(https:\/\/diffs\)\.$/m);
  assert.match(text, /\*\*A person reviews them\.\*\* If the new UI is intended, add the label `accept-screenshots`/);
});

test('one new screenshot reads as one', () => {
  const text = comment([{ name: 'narrow-screen-1-list', test: 'narrow-screen', after: 'a' }], {});
  assert.match(text, /^## New screenshots\nA new screenshot of the web tests has no baseline yet:$/m);
});

test('a screenshot of a different size is changed, not new', () => {
  const text = comment([{ name: 'welcome', test: 'read-skill', before: 'b', after: 'a' }], {});
  assert.match(text, /^## Screenshots changed$/m);
  assert.match(text, /^\| `welcome` \| `read-skill` \| a different size \|$/m);
  assert.doesNotMatch(text, /new one|no baseline/);
});

test('one changed pixel reads as one', () => {
  const text = comment([{ name: 'welcome', test: 'read-skill', pixels: 1, before: 'b', after: 'a', diff: 'd' }], {});
  assert.match(text, /^A screenshot of the web tests differs from its baseline:$/m);
  assert.match(text, /^\| `welcome` \| `read-skill` \| 1 pixel \|$/m);
});

test('once every screenshot is as its baseline, the same comment says so', () => {
  assert.equal(comment([], { videos: 'https://videos' }), `${MARKER}\n## Screenshots\nEvery screenshot of the web tests is as its baseline. Videos of the run: [web-videos](https://videos).`);
});

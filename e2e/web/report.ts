// node e2e/web/report.ts: after a run of the web tests, the screenshots that differ from their baselines or have none, from
// playwright-report/results.json. Copies each one's before (the baseline), after (this run) and diff to
// screenshot-diffs/<name>/, and prints the Markdown that CI posts on the pull request: a person reviews them.
// The links come from the environment: DIFFS_URL, REPORT_URL and VIDEOS_URL, the run's artifacts.
import { copyFile, mkdir, readFile } from 'node:fs/promises';

export const MARKER = '<!-- web-screenshots -->';
const LABEL = 'accept-screenshots';

/** One key moment that is not as its baseline: changed, or new. */
export type Changed = { name: string; test: string; pixels?: number; before?: string; after?: string; diff?: string };

type Attachment = { name: string; path?: string };
type Result = { attachments: Attachment[]; errors: { message?: string }[] };
type Suite = { suites?: Suite[]; specs?: { title: string; tests: { results: Result[] }[] }[] };

/** The changed moments of every test, in the order the tests ran. */
export function changed(report: { suites: Suite[] }): Changed[] {
  const found: Changed[] = [];
  const walk = (suite: Suite) => {
    suite.suites?.forEach(walk);
    for (const spec of suite.specs ?? []) {
      const test = spec.title.split(':')[0];
      for (const result of spec.tests.flatMap((t) => t.results)) {
        const moments = new Map<string, Changed>();
        for (const { name, path } of result.attachments) {
          const match = /^(.+)-(expected|actual|diff)\.png$/.exec(name);
          if (!match || !path) continue;
          const moment = moments.get(match[1]) ?? { name: match[1], test };
          moment[({ expected: 'before', actual: 'after', diff: 'diff' } as const)[match[2] as 'expected']] = path;
          moments.set(match[1], moment);
        }
        for (const moment of moments.values()) {
          const error = result.errors.find((e) => e.message?.includes(`${moment.name}.png`))?.message ?? '';
          const pixels = /(\d+) pixels \(ratio/.exec(error)?.[1];
          found.push({ ...moment, pixels: pixels === undefined ? undefined : Number(pixels) });
        }
      }
    }
  };
  report.suites.forEach(walk);
  return found;
}

/** The pull request comment: what changed, where to see it, and how a person accepts it. */
export function comment(moments: Changed[], links: { diffs?: string; report?: string; videos?: string }): string {
  const link = (text: string, url?: string) => (url ? `[${text}](${url})` : `\`${text}\``);
  if (moments.length === 0) {
    return [MARKER, '## Screenshots', `Every screenshot of the web tests is as its baseline. Videos of the run: ${link('web-videos', links.videos)}.`].join('\n');
  }
  // A screenshot without a baseline is new, not changed: it is listed apart, with only its after.
  const differ = moments.filter((moment) => moment.before);
  const added = moments.filter((moment) => !moment.before);
  const what = (moment: Changed) => (moment.pixels === undefined ? 'a different size' : `${moment.pixels.toLocaleString('en-US')} pixel${moment.pixels === 1 ? '' : 's'}`);
  const of = differ.length === 0 ? ' of the web tests' : '';
  return [
    MARKER,
    differ.length === 0 ? '## New screenshots' : '## Screenshots changed',
    ...(differ.length === 0
      ? []
      : [
          differ.length === 1 ? 'A screenshot of the web tests differs from its baseline:' : `${differ.length} screenshots of the web tests differ from their baselines:`,
          '',
          '| Screenshot | Test | Changed |',
          '| --- | --- | --- |',
          ...differ.map((moment) => `| \`${moment.name}\` | \`${moment.test}\` | ${what(moment)} |`),
          '',
        ]),
    ...(added.length === 0
      ? []
      : [
          added.length === 1 ? `A new screenshot${of} has no baseline yet:` : `${added.length} new screenshots${of} have no baseline yet:`,
          '',
          '| Screenshot | Test |',
          '| --- | --- |',
          ...added.map((moment) => `| \`${moment.name}\` | \`${moment.test}\` |`),
          '',
        ]),
    differ.length === 0
      ? `Each one's \`after.png\` (this branch): ${link('screenshot-diffs', links.diffs)}.`
      : `Each changed one's \`before.png\` (the baseline), \`after.png\` (this branch) and \`diff.png\`, changed pixels in red${added.length === 0 ? '' : ", and each new one's `after.png`"}: ${link('screenshot-diffs', links.diffs)}.`,
    `${differ.length === 0 ? 'In' : 'Side by side, with a slider, in'} the HTML report: ${link('web-report', links.report)} (open \`index.html\`). Videos of the run: ${link('web-videos', links.videos)}.`,
    '',
    `**A person reviews them.** If the new UI is intended, add the label \`${LABEL}\`: the Screenshots workflow takes them again on Linux, in the tests' image, and commits them to this branch as the new baselines. If not, fix the change.`,
  ].join('\n');
}

if (import.meta.main) {
  const report = JSON.parse(await readFile('playwright-report/results.json', 'utf8'));
  const moments = changed(report);
  for (const moment of moments) {
    await mkdir(`screenshot-diffs/${moment.name}`, { recursive: true });
    for (const kind of ['before', 'after', 'diff'] as const) {
      const path = moment[kind];
      // The tests ran in the image, with this checkout at /work.
      if (path) await copyFile(path.replace(/^\/work\//, ''), `screenshot-diffs/${moment.name}/${kind}.png`);
    }
  }
  const { DIFFS_URL, REPORT_URL, VIDEOS_URL } = process.env;
  console.log(comment(moments, { diffs: DIFFS_URL, report: REPORT_URL, videos: VIDEOS_URL }));
}

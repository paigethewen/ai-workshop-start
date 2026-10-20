// node .agents/skills/demo-video/record.ts [--out <dir>] <case>...: records each case of cases.ts against
// a fresh `./skill-atlas serve`, as <dir>/<case>.webm, and the page it ends on as <dir>/<case>.png.
import { spawn } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { cases } from './cases.ts';

const size = { width: 1280, height: 800 };
const attempts = 3;
const retryAfter = 65_000;
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt === -1 ? 'demo-videos' : args.splice(outAt, 2)[1];
const names = args.includes('all') ? Object.keys(cases) : args;
const unknown = names.filter((name) => !(name in cases));
if (!out || names.length === 0 || unknown.length > 0) {
  console.error(`Usage: record.ts [--out <dir>] <case>... | all\nCases: ${Object.keys(cases).join(', ')}`);
  process.exit(1);
}

const server = spawn(join(import.meta.dirname, '../../../skill-atlas'), ['serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
const base = await new Promise<string>((resolve, reject) => {
  server.stdout.on('data', (chunk: Buffer) => {
    const url = /Skill Atlas web view: (\S+)/.exec(chunk.toString())?.[1];
    if (url) resolve(url);
  });
  server.on('exit', (code) => reject(new Error(`skill-atlas serve exited with ${code}`)));
});

const browser = await chromium.launch();
try {
  await mkdir(out, { recursive: true });
  for (const name of names) {
    for (let attempt = 1; ; attempt++) {
      const context = await browser.newContext({ viewport: size, recordVideo: { dir: out, size } });
      const page = await context.newPage();
      try {
        await cases[name].run(page, base);
      } catch (error) {
        // What the page showed when the case gave up: a scan's error is on the page, not in the exception.
        // Best effort: the case's own error is the one to report.
        await page.screenshot({ path: join(out, `${name}-failed.png`), timeout: 5000 }).catch(() => {});
        const problem = await page.locator('#problem-message').textContent({ timeout: 1000 }).catch(() => null);
        if (problem) console.error(`${name}: the page says: ${problem}`);
        await context.close();
        await page.video()?.delete();
        // GitHub's rate limit clears within a minute, as the page says: record the case again, in a fresh page.
        // Three attempts of each case, with the waits, fit the Demo job's 15 minutes.
        if (attempt < attempts && /rate limit/i.test(problem ?? '')) {
          console.error(`${name}: recording again in ${retryAfter / 1000} s, attempt ${attempt + 1} of ${attempts}`);
          await sleep(retryAfter);
          continue;
        }
        throw error;
      }
      await rm(join(out, `${name}-failed.png`), { force: true });
      await finish(name, context, page);
      break;
    }
  }
} finally {
  await browser.close();
  if (server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
}

async function finish(name: string, context: BrowserContext, page: Page) {
  await page.screenshot({ path: join(out, `${name}.png`) });
  const video = page.video()!;
  await context.close();
  await rename(await video.path(), join(out, `${name}.webm`));
  console.log(`${name}: ${join(out, `${name}.webm`)}`);
}

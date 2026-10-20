// node .agents/skills/demo-video/record.ts [--out <dir>] <case>...: records each case of cases.ts against
// a fresh `./skill-atlas serve`, as <dir>/<case>.webm, and the page it ends on as <dir>/<case>.png.
import { spawn } from 'node:child_process';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { cases } from './cases.ts';

const size = { width: 1280, height: 800 };
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
      throw error;
    }
    await page.screenshot({ path: join(out, `${name}.png`) });
    const video = page.video()!;
    await context.close();
    await rename(await video.path(), join(out, `${name}.webm`));
    console.log(`${name}: ${join(out, `${name}.webm`)}`);
  }
} finally {
  await browser.close();
  if (server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
}

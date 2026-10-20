// npm run e2e [-- <playwright test options>]: the web tests, inside the image of e2e/web/Dockerfile, the same here
// as on CI, without the network: GitHub answers from github.json. Needs Docker; writes test-results/ and
// playwright-report/ here, as the user running it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../../node_modules/playwright-core/package.json', import.meta.url), 'utf8'));
// One image per Dockerfile and Playwright: built once, then pulled, so every run renders with the same bytes.
const tag = createHash('sha256').update(readFileSync(new URL('Dockerfile', import.meta.url))).update(version).digest('hex').slice(0, 16);
const image = `${process.env.SKILL_ATLAS_WEB_REGISTRY ?? 'ghcr.io/paigethewen/skill-atlas-web-tests'}:${tag}`;
// A proxy reaches the archives while the image is built; Docker does not keep it in the image.
const proxies = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'].filter((name) => process.env[name]);

function docker(args: string[], quiet = false) {
  const result = spawnSync('docker', args, { stdio: quiet ? 'ignore' : 'inherit', cwd: root });
  if (result.error) throw new Error(`docker: ${result.error.message}; the web tests run in Docker`);
  return result.status ?? 1;
}

if (docker(['image', 'inspect', image], true) !== 0 && docker(['pull', '--quiet', image]) !== 0) {
  // Not published yet: CI publishes the one it builds (SKILL_ATLAS_WEB_PUSH), and the baselines are taken with it.
  console.error(`${image} is not published: building it`);
  const built = docker(['build', '--quiet', '--tag', image, '--build-arg', `PLAYWRIGHT=${version}`, ...proxies.flatMap((name) => ['--build-arg', name]), 'e2e/web']);
  if (built !== 0) process.exit(built);
  if (process.env.SKILL_ATLAS_WEB_PUSH && docker(['push', '--quiet', image]) !== 0) process.exit(1);
}
const { uid, gid } = userInfo();
process.exitCode = docker([
  'run', '--rm', '--init', '--ipc=host', '--network=none', `--user=${uid}:${gid}`,
  `--volume=${root}:/work`, ...(process.env.CI ? ['--env=CI'] : []),
  image, 'npx', 'playwright', 'test', '--config=e2e/web/playwright.config.ts', ...process.argv.slice(2),
]);

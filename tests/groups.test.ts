// Grouping with a model, in spec/web.md: what the page asks of /api/groups, what `claude -p` is run with,
// and which answers are refused. A fake `claude` answers here; the real one is never run.
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { askClaude, groupSkills, ModelError, type AskModel, type GroupedSkill } from '../src/web/groups.ts';
import { createWebServer, listen } from '../src/web/server.ts';
import { open } from './helpers.ts';

const skills: GroupedSkill[] = [
  { path: '.claude/skills/commits/SKILL.md', name: 'commits', description: 'Write commit messages.' },
  { path: '.claude/skills/test-runner/SKILL.md', name: 'test-runner', description: 'Run the tests.' },
  { path: '.claude/skills/code-review/SKILL.md', name: 'code-review', description: 'Review a change.' },
];
const [commits, testRunner, codeReview] = skills.map((skill) => skill.path);

/** A model that answers `answer`, and the skills it was asked about. */
function model(answer: unknown) {
  const asked: GroupedSkill[][] = [];
  const ask: AskModel = async (given) => {
    asked.push(given);
    return answer;
  };
  return { ask, asked };
}

/** A `claude` on disk that writes its arguments and stdin next to it and runs `script` (Node). */
async function fakeClaude(script: string) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-claude-'));
  const command = join(dir, 'claude');
  await writeFile(
    command,
    `#!${process.execPath}\nconst fs = require('node:fs');\n` +
      `fs.writeFileSync(${JSON.stringify(join(dir, 'args.json'))}, JSON.stringify(process.argv.slice(2)));\n` +
      `fs.writeFileSync(${JSON.stringify(join(dir, 'stdin.json'))}, fs.readFileSync(0));\n${script}\n`,
  );
  await chmod(command, 0o755);
  return {
    command,
    args: async () => JSON.parse(await readFile(join(dir, 'args.json'), 'utf8')) as string[],
    stdin: async () => JSON.parse(await readFile(join(dir, 'stdin.json'), 'utf8')) as unknown,
  };
}

/** A web view on a free port with `ask` as its model, closed after the test. */
async function webView(t: { after(fn: () => void): void }, ask?: AskModel) {
  const server = createWebServer({ open, ask });
  const url = await listen(server, 0);
  t.after(() => server.close());
  return (body: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }, method = 'POST') =>
    fetch(new URL('/api/groups', url), { method, headers, body: method === 'GET' ? undefined : body });
}

test('the model groups every skill once → its groups, labels trimmed and empty groups dropped', async () => {
  const { ask, asked } = model({
    groups: [
      { label: ' Git ', paths: [commits] },
      { label: 'Quality', paths: [testRunner, codeReview] },
      { label: 'Empty', paths: [] },
    ],
  });
  assert.deepEqual(await groupSkills(skills, ask), [
    { label: 'Git', paths: [commits] },
    { label: 'Quality', paths: [testRunner, codeReview] },
  ]);
  assert.deepEqual(asked, [skills]);
});

test('an answer that leaves out, repeats or adds a skill, or is not groups → refused, not repaired', async () => {
  const refused = async (answer: unknown, message: string) =>
    assert.rejects(groupSkills(skills, model(answer).ask), (error) => error instanceof ModelError && error.message === message);
  await refused({ groups: [{ label: 'Git', paths: [commits, testRunner] }] }, `The model left out 1 of 3 skills: ${codeReview}`);
  await refused(
    { groups: [{ label: 'A', paths: [commits, testRunner] }, { label: 'B', paths: [testRunner, codeReview] }] },
    `The model put a skill in two groups: ${testRunner}`,
  );
  await refused({ groups: [{ label: 'A', paths: [commits, testRunner, codeReview, 'x/SKILL.md'] }] }, 'The model grouped a skill it was not given: x/SKILL.md');
  await refused({ groups: [{ label: ' ', paths: [commits, testRunner, codeReview] }] }, 'The model did not answer with groups');
  await refused(null, 'The model did not answer with groups');
});

test('claude is run as Haiku with no tools, MCP servers or skills, the skills on stdin and the answer held to a schema', async () => {
  const claude = await fakeClaude(
    `console.log(JSON.stringify({ is_error: false, structured_output: { groups: [{ label: 'All', paths: ['a'] }] } }));`,
  );
  assert.deepEqual(await askClaude({ command: claude.command })(skills), { groups: [{ label: 'All', paths: ['a'] }] });
  const args = await claude.args();
  const flag = (name: string) => args[args.indexOf(name) + 1];
  assert.equal(args[0], '-p');
  assert.equal(flag('--model'), 'haiku');
  assert.equal(flag('--tools'), '');
  assert.equal(flag('--output-format'), 'json');
  assert.ok(args.includes('--strict-mcp-config') && args.includes('--disable-slash-commands') && args.includes('--no-session-persistence'), args.join(' '));
  assert.deepEqual(JSON.parse(flag('--json-schema')).required, ['groups']);
  assert.deepEqual(await claude.stdin(), skills);
});

test('claude failing, missing or too slow → a ModelError that says so', async () => {
  const failing = await fakeClaude(`console.log(JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' })); process.exit(1);`);
  await assert.rejects(askClaude({ command: failing.command })(skills), { name: 'Error', message: 'claude: Not logged in · Please run /login' });
  await assert.rejects(askClaude({ command: join(tmpdir(), 'no-such-claude') })(skills), (error) =>
    error instanceof ModelError && error.message === 'Grouping with a model needs the claude CLI, installed and logged in');
  const slow = await fakeClaude('setTimeout(() => {}, 10_000);');
  await assert.rejects(askClaude({ command: slow.command, timeoutMs: 300 })(skills), (error) =>
    error instanceof ModelError && error.message === 'The model did not answer within 0 seconds');
});

test('POST /api/groups → 200 and the groups of the skills sent', async (t) => {
  const { ask, asked } = model({ groups: [{ label: 'All', paths: [commits, testRunner, codeReview] }] });
  const post = await webView(t, ask);
  const response = await post(JSON.stringify({ skills }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { groups: [{ label: 'All', paths: [commits, testRunner, codeReview] }] });
  assert.deepEqual(asked, [skills]);
});

test('a request for groups that is not JSON from the page → refused before the model is asked', async (t) => {
  const { ask, asked } = model({ groups: [] });
  const post = await webView(t, ask);
  const refused = async (response: Response, status: number, error: string) =>
    assert.deepEqual([response.status, await response.json()], [status, { error }]);
  // What another site's form can send without asking first.
  await refused(await post(JSON.stringify({ skills }), { 'Content-Type': 'text/plain' }), 415, 'Send the skills as JSON');
  await refused(await post('', {}, 'GET'), 405, 'Only POST');
  await refused(await post('{'), 400, 'Send the skills as JSON');
  await refused(await post(JSON.stringify({ skills: [{ path: 'a' }] })), 400, 'Send { skills: [{ path, name, description }] }');
  await refused(await post(JSON.stringify({ skills: skills.slice(0, 1) })), 400, 'Group two skills or more');
  await refused(await post(JSON.stringify({ skills: [skills[0], skills[0]] })), 400, 'Each skill once');
  assert.deepEqual(asked, []);
});

test("the model's fault → 502 and its message; no model → 501", async (t) => {
  const post = await webView(t, model({ groups: [{ label: 'Git', paths: [commits] }] }).ask);
  const faulty = await post(JSON.stringify({ skills }));
  assert.deepEqual([faulty.status, await faulty.json()], [502, { error: `The model left out 2 of 3 skills: ${testRunner}, ${codeReview}` }]);

  const none = await (await webView(t))(JSON.stringify({ skills }));
  assert.deepEqual([none.status, await none.json()], [501, { error: 'Grouping with a model is not available here' }]);
});

// The web view's filter, in spec/web.md: which skills it keeps and what it marks, on what the server answers
// for ./fixture. The page runs src/web/filter.js as it is; here it runs in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { excerpt, marked, matches, words } from '../src/web/filter.js';
import { scanForWeb } from '../src/web/server.ts';
import { FIXTURE, open } from './helpers.ts';

const fixture = scanForWeb(FIXTURE, { open });

/** The paths of the fixture's skills the filter keeps for the query. */
async function filtered(query: string) {
  return (await fixture).skills.filter((skill) => matches(skill, words(query))).map((skill) => skill.path);
}

test('the filter keeps a skill whose SKILL.md has the word only in its body', async () => {
  // `caret` is only in the body of .agents/skills/commits: `editor: keep the caret after undo`.
  assert.deepEqual(await filtered('caret'), ['.agents/skills/commits/SKILL.md']);
});

test('the filter keeps a skill by its name, its description or its path', async () => {
  assert.deepEqual(await filtered('test-runner'), ['.claude/skills/test-runner/SKILL.md']);
  assert.deepEqual(await filtered('Kotlin'), ['.codex/skills/code-style/SKILL.md']);
  assert.deepEqual(await filtered('modules/editor'), ['modules/editor/.claude/skills/commits/SKILL.md']);
});

test('the filter ignores case', async () => {
  assert.deepEqual(await filtered('CARET'), await filtered('caret'));
});

test('the filter keeps only the skills that have every word typed, wherever each one is', async () => {
  assert.deepEqual(await filtered('commits caret'), ['.agents/skills/commits/SKILL.md']);
  assert.deepEqual(await filtered('caret tabs'), []);
});

test('a filter with no words keeps every skill', async () => {
  const all = (await fixture).skills.map((skill) => skill.path);
  assert.deepEqual(await filtered(''), all);
  assert.deepEqual(await filtered('  \t '), all);
});

test('a word is matched as it is typed, not as a pattern', async () => {
  assert.deepEqual(words('  Test  (a.b  '), ['test', '(a.b']);
  assert.deepEqual(await filtered('.*'), []);
});

test('each word is marked wherever it is, in any case', () => {
  assert.deepEqual(marked('Test runner: runs the tests', ['test']), [
    { text: 'Test', marked: true },
    { text: ' runner: runs the ', marked: false },
    { text: 'test', marked: true },
    { text: 's', marked: false },
  ]);
});

test('words that overlap or touch are one mark', () => {
  assert.deepEqual(marked('a testing b', ['tes', 'est', 'ing']), [
    { text: 'a ', marked: false },
    { text: 'testing', marked: true },
    { text: ' b', marked: false },
  ]);
});

test('no words → nothing marked; no text → nothing at all', () => {
  assert.deepEqual(marked('Test runner', []), [{ text: 'Test runner', marked: false }]);
  assert.deepEqual(marked('', ['test']), []);
});

test('a mark keeps the text as written, around letters whose lower case is longer', () => {
  // 'İ' is one character, and two in lower case.
  assert.deepEqual(marked('İstanbul test', ['test']), [
    { text: 'İstanbul ', marked: false },
    { text: 'test', marked: true },
  ]);
});

test('a skill that matches outside what the list shows → the first line of its SKILL.md that does', async () => {
  const commits = (await fixture).skills.find((skill) => skill.path === '.agents/skills/commits/SKILL.md');
  assert.ok(commits);
  const shown = 'commits Write commit messages the way this repository does.';
  assert.equal(excerpt(commits.source, words('caret'), shown), 'Start with the area, then say what changed: `editor: keep the caret after undo`.');
  // `every` is in the description's second sentence, which the list does not show.
  assert.equal(excerpt(commits.source, words('every'), shown), '…Write commit messages the way this repository does. Use for every commit.');
});

test('a skill whose every word is shown in the list, or is in its path only → no line', async () => {
  const commits = (await fixture).skills.find((skill) => skill.path === '.agents/skills/commits/SKILL.md');
  assert.ok(commits);
  const shown = 'commits Write commit messages the way this repository does.';
  assert.equal(excerpt(commits.source, words('commit'), shown), '');
  assert.equal(excerpt(commits.source, words(''), shown), '');
  assert.equal(excerpt(commits.source, words('.agents'), shown), '');
});

test('a long line is cut around its first match', () => {
  const line = `${'a '.repeat(60)}needle${' b'.repeat(60)}`;
  const cut = excerpt(`---\nname: x\n---\n${line}\n`, ['needle'], 'x');
  assert.match(cut, /^….*needle.*…$/);
  assert.ok(cut.length <= 82, cut);
});

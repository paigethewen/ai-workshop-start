// The web view's page: scans through /api/scan and shows one skill at a time, or an organization's
// repositories with skills. The address keeps the repository or the owner in ?repo= and the open
// skill in #<path>, so a reload or a shared link shows the same.
import { excerpt, grouped, marked, matches, words as wordsIn } from './filter.js';

const $ = (id) => document.getElementById(id);
let current;
/** The last organization's answer, so that going back to it from one of its repositories is instant. */
let organization;
/** The filter's words, marked in the list and in the open skill. */
let words = [];

/** The agent behind each agent folder, for the badges. */
const AGENTS = {
  '.agents': 'Agents', '.agent': 'Agent', agent: 'Agent', '.claude': 'Claude', '.codex': 'Codex',
  '.cursor': 'Cursor', '.github': 'Copilot', '.gemini': 'Gemini', '.junie': 'Junie',
};

$('scan').addEventListener('submit', (event) => {
  event.preventDefault();
  scanRepo($('repo').value.trim());
});
for (const chip of document.querySelectorAll('[data-repo]')) {
  chip.addEventListener('click', () => {
    $('repo').value = chip.dataset.repo;
    scanRepo(chip.dataset.repo);
  });
}
$('filter').addEventListener('input', filter);
$('group').addEventListener('change', () => current?.skills && list());
$('copy').addEventListener('click', copySource);
window.addEventListener('popstate', fromAddress);
window.addEventListener('hashchange', () => current?.skills && show(location.hash.slice(1)));
document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('click', () => view(tab.dataset.view)));
fromAddress();

function scanRepo(repo) {
  if (!repo) return;
  history.pushState(null, '', `?repo=${encodeURIComponent(repo)}`);
  load(repo);
}

function fromAddress() {
  const repo = new URLSearchParams(location.search).get('repo');
  if (!repo) {
    current = undefined;
    screen('welcome');
  } else if (repo !== current?.input) {
    $('repo').value = repo;
    if (repo === organization?.input) {
      current = organization;
      renderOrganization();
    } else load(repo);
  } else if (current.skills) show(location.hash.slice(1));
}

/** Shows one of the welcome, the problem and the results. */
function screen(name) {
  for (const id of ['welcome', 'problem', 'organization', 'results']) $(id).hidden = id !== name;
}

async function load(repo) {
  current = undefined;
  document.body.classList.add('loading');
  $('scan-button').disabled = true;
  let body;
  try {
    const response = await fetch(`/api/scan?repo=${encodeURIComponent(repo)}`);
    body = await response.json();
    if (!response.ok) throw new Error(body.error);
  } catch (error) {
    $('problem-message').textContent = error.message;
    screen('problem');
    return;
  } finally {
    document.body.classList.remove('loading');
    $('scan-button').disabled = false;
  }
  current = { input: repo, ...body };
  if (current.organization) {
    organization = current;
    renderOrganization();
  } else render();
}

/** `<owner> · N of M repositories with skills`, then each of them; one opens with its own scan. */
function renderOrganization() {
  const { repositories, total, warnings } = current;
  $('organization-id').textContent = current.organization.id;
  $('organization-summary').textContent = `${repositories.length} of ${total} ${total === 1 ? 'repository' : 'repositories'} with skills`;
  $('repositories').replaceChildren(
    ...repositories.map((repository) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `?repo=${encodeURIComponent(repository.url)}`;
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        $('repo').value = repository.url;
        scanRepo(repository.url);
      });
      const title = element('span', 'item-title', repository.id);
      title.append(element('span', 'count', `${repository.skills.length} ${repository.skills.length === 1 ? 'skill' : 'skills'}`));
      link.append(title, element('span', 'item-description', repository.skills.join(', ')));
      item.append(link);
      return item;
    }),
  );
  $('no-repositories').hidden = repositories.length > 0;
  folded($('organization-warnings'), warnings);
  screen('organization');
  window.scrollTo(0, 0);
}

function render() {
  const { repository, skills, warnings } = current;
  $('repository').textContent = repository.commit ? `${repository.id} @ ${repository.commit.slice(0, 7)}` : repository.id;
  $('summary').textContent = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  $('filter').value = '';
  words = [];
  list();
  folded($('warnings'), warnings);
  $('no-skills').hidden = skills.length > 0;
  screen('results');
  show(location.hash.slice(1));
}

/** The warnings, folded under their count; hidden when there are none. */
function folded(details, warnings) {
  details.hidden = warnings.length === 0;
  details.querySelector('summary').textContent = `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`;
  details.querySelector('ul').replaceChildren(...warnings.map((warning) => element('li', '', warning)));
}

/** A skill in the list: its name, its first sentence, the line that matched the filter, its badges. */
function fillItem(link, skill) {
  const title = element('span', 'item-title', '');
  title.append(element('span', '', skill.name));
  if (skill.copies.length) title.append(element('span', 'count', `×${skill.copies.length + 1}`));
  const description = firstSentence(skill.description);
  const line = excerpt(skill.source, words, `${skill.name}\n${description}`);
  link.replaceChildren(title, element('span', 'item-description', description || 'No description'));
  if (line) link.append(element('span', 'item-match', line));
  link.append(badges(skill));
  mark(link);
}

/** Opens the skill at the path, or the first one. */
function show(hash) {
  const path = decodeURIComponent(hash);
  const skill = current.skills.find((skill) => skill.path === path) ?? current.skills[0];
  $('skill').hidden = !skill;
  if (!skill) return;
  for (const link of $('skills').querySelectorAll('a')) link.toggleAttribute('aria-current', link.dataset.path === skill.path);
  fillSkill(skill);
  $('copy').textContent = 'Copy SKILL.md';
  $('skill').scrollTop = 0;
}

/** The open skill, with the filter's words marked. */
function fillSkill(skill) {
  current.open = skill;
  $('skill-badges').replaceChildren(badges(skill));
  $('skill-name').textContent = skill.name;
  $('skill-description').textContent = skill.description;
  $('skill-path').textContent = skill.path;
  // A local directory's file:// link cannot be opened from the page: the file is shown below instead.
  if (skill.link.startsWith('https:')) $('skill-link').href = skill.link;
  else $('skill-link').removeAttribute('href');
  $('skill-commit').textContent = current.repository.commit ? current.repository.commit.slice(0, 7) : 'local';
  $('skill-copies').textContent = skill.copies.length ? `Also in ${skill.copies.join(', ')}` : '';
  $('skill-properties').replaceChildren(
    ...Object.entries(skill.properties).flatMap(([key, value]) => [
      element('dt', '', key),
      element('dd', '', typeof value === 'string' ? value : JSON.stringify(value)),
    ]),
  );
  // Rendered on the server, with the SKILL.md's own HTML escaped.
  $('skill-rendered').innerHTML = skill.html || '<p class="empty">This SKILL.md has no body.</p>';
  $('skill-source').textContent = skill.source;
  for (const id of ['skill-name', 'skill-description', 'skill-path', 'skill-copies', 'skill-properties', 'skill-rendered', 'skill-source']) mark($(id));
}

/** Marks the filter's words in the node's text, as text nodes and <mark>s: the HTML around them is kept. */
function mark(root) {
  if (!words.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    const pieces = marked(text.data, words);
    if (!pieces.some((piece) => piece.marked)) continue;
    text.replaceWith(...pieces.map((piece) => (piece.marked ? element('mark', '', piece.text) : document.createTextNode(piece.text))));
  }
}

/** The agents that read the skill, from its folder and its copies' folders, and its package if nested. */
function badges(skill) {
  const group = element('span', 'badges', '');
  const folders = [skill.path, ...skill.copies].map((path) => path.split('/').slice(-4));
  for (const name of new Set(folders.map(([folder]) => AGENTS[folder] ?? folder))) group.append(element('span', 'badge', name));
  const base = skill.path.split('/').slice(0, -4).join('/');
  if (base) group.append(element('span', 'badge package', base));
  return group;
}

function filter() {
  words = wordsIn($('filter').value);
  list();
  if (current.open) fillSkill(current.open);
}

/** The skills that match the filter; with grouping on, under the word each group shares. */
function list() {
  const shown = current.skills.filter((skill) => matches(skill, words));
  const items = (skills) =>
    skills.map((skill) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(skill.path)}`;
      link.dataset.path = skill.path;
      link.toggleAttribute('aria-current', skill === current.open);
      fillItem(link, skill);
      item.append(link);
      return item;
    });
  $('skills').replaceChildren(
    ...(!$('group').checked
      ? items(shown)
      : grouped(shown).map((group) => {
          const item = element('li', 'group', '');
          const head = element('h3', 'group-head', '');
          head.append(element('span', '', group.word ?? 'Other'), element('span', 'count', String(group.skills.length)));
          const skills = element('ul', 'skill-list', '');
          skills.append(...items(group.skills));
          item.append(head, skills);
          return item;
        })),
  );
  $('no-match').hidden = shown.length > 0 || current.skills.length === 0;
}

function view(name) {
  for (const tab of document.querySelectorAll('[role=tab]')) tab.setAttribute('aria-selected', String(tab.dataset.view === name));
  $('skill-rendered').hidden = name !== 'rendered';
  $('skill-source').hidden = name !== 'source';
}

async function copySource() {
  try {
    await navigator.clipboard.writeText($('skill-source').textContent);
    $('copy').textContent = 'Copied';
  } catch {
    $('copy').textContent = 'Copy failed';
  }
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}

function firstSentence(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

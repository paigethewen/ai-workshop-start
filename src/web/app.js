// The web view's page: scans through /api/scan and shows one skill at a time, or an organization's
// repositories with skills, as they are found. The address keeps the repository or the owner in
// ?repo= and the open skill in #<path>, so a reload or a shared link shows the same.
import { excerpt, marked, matches, words as wordsIn } from './filter.js';

const $ = (id) => document.getElementById(id);
let current;
/** The last organization's answer, so that going back to it from one of its repositories is instant. */
let organization;
/** The filter's words, marked in the list and in the open skill. */
let words = [];
/** Stops the scan in progress, whose answer the page no longer wants. */
let scanning;
/** The organization's repositories with skills found so far, in their final order: most skills first, then by id. */
let found = [];

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
    stop();
    current = undefined;
    screen('welcome');
  } else if (repo !== current?.input) {
    $('repo').value = repo;
    if (repo === organization?.input) {
      stop();
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
  stop();
  const controller = (scanning = new AbortController());
  current = undefined;
  document.body.classList.add('loading');
  $('scan-button').disabled = true;
  let body;
  try {
    // An organization's answer streams, so the page shows its repositories as they are scanned.
    const response = await fetch(`/api/scan?repo=${encodeURIComponent(repo)}`, {
      headers: { Accept: 'application/x-ndjson, application/json' },
      signal: controller.signal,
    });
    body = response.headers.get('content-type')?.startsWith('application/x-ndjson')
      ? await streamed(response, (progress) => controller.signal.aborted || renderProgress(progress))
      : await response.json();
    if (!response.ok || body.error) throw new Error(body.error);
  } catch (error) {
    if (controller.signal.aborted) return;
    $('problem-message').textContent = error.message;
    screen('problem');
    return;
  } finally {
    // Done: nothing left to abort, only the spinner to stop; unless another scan took its place.
    if (scanning === controller) {
      scanning = undefined;
      stop();
    }
  }
  if (controller.signal.aborted) return;
  current = { input: repo, ...body };
  if (current.organization) {
    organization = current;
    renderOrganization();
  } else render();
}

/** Ends the scan in progress, if any: its answer, or what is left of it, is not shown. */
function stop() {
  scanning?.abort();
  scanning = undefined;
  document.body.classList.remove('loading');
  $('scan-button').disabled = false;
}

/** Reads an answer of one JSON object per line: each `{ progress }` line as it comes; resolves to the answer, the last line. */
async function streamed(response, onProgress) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  let last;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = (text + value).split('\n');
    text = lines.pop();
    for (const line of lines.filter(Boolean)) {
      last = JSON.parse(line);
      if (last.progress) onProgress(last.progress);
    }
  }
  return last && !last.progress ? last : { error: 'The scan ended without an answer' };
}

/** `<owner> · N of M repositories scanned`, then the repositories with skills so far; they open once the scan ends. */
function renderProgress({ organization: owner, scanned, total, repository }) {
  if (scanned === 0) {
    found = [];
    window.scrollTo(0, 0);
  }
  if (repository) {
    found.push(repository);
    found.sort((a, b) => b.skills.length - a.skills.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  $('organization-id').textContent = owner.id;
  $('organization-summary').textContent = `${scanned} of ${total} ${total === 1 ? 'repository' : 'repositories'} scanned`;
  $('repositories').replaceChildren(...found.map((repository) => repositoryItem(repository, false)));
  $('no-repositories').hidden = true;
  $('organization-warnings').hidden = true;
  screen('organization');
}

/** `<owner> · N of M repositories with skills`, then each of them; one opens with its own scan. */
function renderOrganization() {
  const { repositories, total, warnings } = current;
  $('organization-id').textContent = current.organization.id;
  $('organization-summary').textContent = `${repositories.length} of ${total} ${total === 1 ? 'repository' : 'repositories'} with skills`;
  $('repositories').replaceChildren(...repositories.map((repository) => repositoryItem(repository, true)));
  $('no-repositories').hidden = repositories.length > 0;
  folded($('organization-warnings'), warnings);
  screen('organization');
  window.scrollTo(0, 0);
}

/** A repository of an organization: its id, its count and its skills' names; a link to its own scan, if it opens. */
function repositoryItem(repository, opens) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  if (opens) {
    link.href = `?repo=${encodeURIComponent(repository.url)}`;
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      $('repo').value = repository.url;
      scanRepo(repository.url);
    });
  }
  const title = element('span', 'item-title', repository.id);
  title.append(element('span', 'count', `${repository.skills.length} ${repository.skills.length === 1 ? 'skill' : 'skills'}`));
  link.append(title, element('span', 'item-description', repository.skills.join(', ')));
  item.append(link);
  return item;
}

function render() {
  const { repository, skills, warnings } = current;
  $('repository').textContent = repository.commit ? `${repository.id} @ ${repository.commit.slice(0, 7)}` : repository.id;
  $('summary').textContent = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  $('filter').value = '';
  words = [];
  $('skills').replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(skill.path)}`;
      link.dataset.path = skill.path;
      fillItem(link, skill);
      item.append(link);
      return item;
    }),
  );
  $('no-match').hidden = true;
  folded($('warnings'), warnings);
  $('no-skills').hidden = skills.length > 0;
  screen('results');
  // A new scan's address has no #<path>, so it opens its first skill; a reload or a shared link, the one in it.
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
  let shown = 0;
  const links = $('skills').querySelectorAll('a');
  current.skills.forEach((skill, index) => {
    const match = matches(skill, words);
    links[index].parentElement.hidden = !match;
    if (!match) return;
    fillItem(links[index], skill);
    shown++;
  });
  $('no-match').hidden = shown > 0 || current.skills.length === 0;
  if (current.open) fillSkill(current.open);
}

function view(name) {
  for (const tab of document.querySelectorAll('[role=tab]')) tab.setAttribute('aria-selected', String(tab.dataset.view === name));
  $('skill-rendered').hidden = name !== 'rendered';
  $('skill-source').hidden = name !== 'source';
}

async function copySource() {
  try {
    // What the reader shows: the rendered body, or the SKILL.md one tab over.
    const shown = $('skill-source').hidden ? $('skill-rendered') : $('skill-source');
    await navigator.clipboard.writeText(shown.textContent);
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

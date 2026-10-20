// The web view's page: scans through /api/scan and shows one skill at a time. The address keeps the
// repository in ?repo= and the open skill in #<path>, so a reload or a shared link shows the same.
const $ = (id) => document.getElementById(id);
let current;

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
window.addEventListener('hashchange', () => current && show(location.hash.slice(1)));
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
    load(repo);
  } else show(location.hash.slice(1));
}

/** Shows one of the welcome, the problem and the results. */
function screen(name) {
  for (const id of ['welcome', 'problem', 'results']) $(id).hidden = id !== name;
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
  render();
}

function render() {
  const { repository, skills, warnings } = current;
  $('repository').textContent = repository.commit ? `${repository.id} @ ${repository.commit.slice(0, 7)}` : repository.id;
  $('summary').textContent = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  $('filter').value = '';
  $('skills').replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(skill.path)}`;
      link.dataset.path = skill.path;
      link.dataset.search = `${skill.name} ${skill.description} ${skill.path}`.toLowerCase();
      const title = element('span', 'item-title', skill.name);
      if (skill.copies.length) title.append(element('span', 'count', `×${skill.copies.length + 1}`));
      link.append(title, element('span', 'item-description', firstSentence(skill.description) || 'No description'), badges(skill));
      item.append(link);
      return item;
    }),
  );
  $('no-match').hidden = true;
  $('warnings').hidden = warnings.length === 0;
  $('warnings').querySelector('summary').textContent = `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`;
  $('warnings').querySelector('ul').replaceChildren(...warnings.map((warning) => element('li', '', warning)));
  $('no-skills').hidden = skills.length > 0;
  screen('results');
  show(location.hash.slice(1));
}

/** Opens the skill at the path, or the first one. */
function show(hash) {
  const path = decodeURIComponent(hash);
  const skill = current.skills.find((skill) => skill.path === path) ?? current.skills[0];
  $('skill').hidden = !skill;
  if (!skill) return;
  for (const link of $('skills').querySelectorAll('a')) link.toggleAttribute('aria-current', link.dataset.path === skill.path);
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
  $('copy').textContent = 'Copy SKILL.md';
  $('skill').scrollTop = 0;
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
  const words = $('filter').value.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const link of $('skills').querySelectorAll('a')) {
    const match = words.every((word) => link.dataset.search.includes(word));
    link.parentElement.hidden = !match;
    if (match) shown++;
  }
  $('no-match').hidden = shown > 0 || current.skills.length === 0;
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

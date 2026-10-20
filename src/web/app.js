// The web view's page: scans through /api/scan and shows one skill at a time. The address keeps the
// repository in ?repo= and the open skill in #<path>, so a reload or a shared link shows the same.
const $ = (id) => document.getElementById(id);
let current;

$('scan').addEventListener('submit', (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  history.pushState(null, '', `?repo=${encodeURIComponent(repo)}`);
  load(repo);
});
window.addEventListener('popstate', fromAddress);
window.addEventListener('hashchange', () => current && show(location.hash.slice(1)));
document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('click', () => view(tab.dataset.view)));
fromAddress();

function fromAddress() {
  const repo = new URLSearchParams(location.search).get('repo');
  if (repo && repo !== current?.input) {
    $('repo').value = repo;
    load(repo);
  } else if (current) show(location.hash.slice(1));
}

async function load(repo) {
  current = undefined;
  $('results').hidden = true;
  $('warnings').hidden = true;
  $('status').textContent = `Scanning ${repo}…`;
  $('status').className = '';
  let body;
  try {
    const response = await fetch(`/api/scan?repo=${encodeURIComponent(repo)}`);
    body = await response.json();
    if (!response.ok) throw new Error(body.error);
  } catch (error) {
    $('status').textContent = error.message;
    $('status').className = 'error';
    return;
  }
  current = { input: repo, ...body };
  $('status').textContent = '';
  render();
}

function render() {
  const { repository, skills, warnings } = current;
  $('summary').textContent = `${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  $('skills').replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(skill.path)}`;
      link.dataset.path = skill.path;
      link.append(text('strong', skill.name), text('span', firstSentence(skill.description)), text('small', skill.path));
      item.append(link);
      return item;
    }),
  );
  $('warnings').hidden = warnings.length === 0;
  $('warnings').querySelector('summary').textContent = `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`;
  $('warnings').querySelector('ul').replaceChildren(...warnings.map((warning) => text('li', warning)));
  $('results').hidden = false;
  show(location.hash.slice(1));
}

/** Opens the skill at the path, or the first one. */
function show(hash) {
  const path = decodeURIComponent(hash);
  const skill = current.skills.find((skill) => skill.path === path) ?? current.skills[0];
  $('skill').hidden = !skill;
  if (!skill) return;
  for (const link of $('skills').querySelectorAll('a')) link.toggleAttribute('aria-current', link.dataset.path === skill.path);
  $('skill-name').textContent = skill.name;
  $('skill-description').textContent = skill.description;
  $('skill-link').textContent = skill.path;
  // A local directory's file:// link cannot be opened from the page: the file is shown below instead.
  if (skill.link.startsWith('https:')) $('skill-link').href = skill.link;
  else $('skill-link').removeAttribute('href');
  $('skill-copies').textContent = skill.copies.length ? `also in ${skill.copies.join(', ')}` : '';
  $('skill-properties').replaceChildren(
    ...Object.entries(skill.properties).flatMap(([key, value]) => [
      text('dt', key),
      text('dd', typeof value === 'string' ? value : JSON.stringify(value)),
    ]),
  );
  // Rendered on the server, with the SKILL.md's own HTML escaped.
  $('skill-rendered').innerHTML = skill.html;
  $('skill-source').textContent = skill.source;
}

function view(name) {
  for (const tab of document.querySelectorAll('[role=tab]')) tab.setAttribute('aria-selected', String(tab.dataset.view === name));
  $('skill-rendered').hidden = name !== 'rendered';
  $('skill-source').hidden = name !== 'source';
}

function text(tag, content) {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

function firstSentence(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

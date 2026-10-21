// The web view's filter: which skills it keeps and what it marks. Plain functions over text, so the page
// and the tests run the same code.

/**
 * The words typed, in lower case.
 * @param {string} query
 * @returns {string[]}
 */
export function words(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Whether the skill's name, description, path or SKILL.md has every word.
 * @param {{ name: string, description: string, path: string, source: string }} skill
 * @param {string[]} words
 */
export function matches(skill, words) {
  const text = folded([skill.name, skill.description, skill.path, skill.source].join('\n')).lower;
  return words.every((word) => text.includes(word));
}

/**
 * The text in pieces, each word's every occurrence marked; overlapping or touching ones are one mark.
 * @param {string} text
 * @param {string[]} words
 * @returns {{ text: string, marked: boolean }[]}
 */
export function marked(text, words) {
  const { lower, at } = folded(text);
  /** @type {[number, number][]} */
  const ranges = [];
  for (const word of words) {
    for (let i = lower.indexOf(word); i !== -1; i = lower.indexOf(word, i + 1)) ranges.push([at[i], at[i + word.length]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const pieces = [];
  let end = 0;
  for (const [from, to] of ranges) {
    const last = pieces.at(-1);
    if (last?.marked && from <= end) {
      if (to > end) last.text += text.slice(end, to);
      end = Math.max(end, to);
      continue;
    }
    if (from > end) pieces.push({ text: text.slice(end, from), marked: false });
    pieces.push({ text: text.slice(from, to), marked: true });
    end = to;
  }
  if (end < text.length) pieces.push({ text: text.slice(end), marked: false });
  return pieces;
}

/**
 * The first line of the SKILL.md with a word the list does not show, cut around it; '' when it shows them all.
 * @param {string} source
 * @param {string[]} words
 * @param {string} shown what the list shows of the skill
 */
export function excerpt(source, words, shown) {
  const visible = folded(shown).lower;
  const hidden = words.filter((word) => !visible.includes(word));
  if (!hidden.length) return '';
  for (const line of source.split(/\r?\n/)) {
    const text = line.trim();
    const { lower, at } = folded(text);
    const first = Math.min(...hidden.map((word) => lower.indexOf(word)).filter((i) => i !== -1));
    if (first === Infinity) continue;
    const index = at[first];
    if (text.length <= 80) return text;
    // From a word's start, before the match.
    let from = Math.max(0, Math.min(index - 30, text.length - 80));
    const space = text.indexOf(' ', from);
    if (from > 0 && space !== -1 && space < index) from = space + 1;
    return `${from > 0 ? '…' : ''}${text.slice(from, from + 80).trim()}${from + 80 < text.length ? '…' : ''}`;
  }
  return '';
}

/** Words too common in skills' names and descriptions to group them by. */
const COMMON = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'these', 'its', 'their', 'them', 'then', 'also',
  'any', 'all', 'only', 'every', 'way', 'does', 'use', 'used', 'using', 'when', 'before', 'after', 'under',
  'inside', 'new', 'skill', 'skills',
]);

/**
 * The words a skill can be grouped by: its name's and description's words of three letters or more, in lower
 * case, without a plural `s` and without common words; the name's are listed apart, as they weigh more.
 * @param {{ name: string, description: string }} skill
 */
function keywords(skill) {
  const of = (text) =>
    new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
        .filter((word) => word.length >= 3 && !COMMON.has(word)),
    );
  const name = of(skill.name);
  return { name, all: new Set([...name, ...of(skill.description)]) };
}

/**
 * The skills in groups by a shared word, the largest first: the word that most skills share, a skill whose
 * name has it counting twice, takes every skill that has it, and so on while a word is shared by two skills
 * or more; the skills left share none, in a last group without a word. Each group keeps the skills' order.
 * @template {{ name: string, description: string }} T
 * @param {T[]} skills
 * @returns {{ word: string | undefined, skills: T[] }[]}
 */
export function grouped(skills) {
  const words = new Map(skills.map((skill) => [skill, keywords(skill)]));
  let left = skills;
  const groups = [];
  for (;;) {
    /** @type {Map<string, { score: number, count: number }>} */
    const shared = new Map();
    for (const skill of left) {
      const { name, all } = /** @type {ReturnType<typeof keywords>} */ (words.get(skill));
      for (const word of all) {
        const entry = shared.get(word) ?? { score: 0, count: 0 };
        entry.score += name.has(word) ? 2 : 1;
        entry.count++;
        shared.set(word, entry);
      }
    }
    const best = [...shared]
      .filter(([, { count }]) => count >= 2)
      .sort(([a, x], [b, y]) => y.score - x.score || y.count - x.count || a.localeCompare(b))[0]?.[0];
    if (!best) break;
    groups.push({ word: best, skills: left.filter((skill) => words.get(skill)?.all.has(best)) });
    left = left.filter((skill) => !words.get(skill)?.all.has(best));
  }
  if (left.length) groups.push({ word: undefined, skills: left });
  return groups;
}

/**
 * The text in lower case, and where each of its characters is in the text: a few letters, such as 'İ',
 * are longer in lower case.
 * @param {string} text
 */
function folded(text) {
  let lower = '';
  /** @type {number[]} */
  const at = [];
  let index = 0;
  for (const char of text) {
    const low = char.toLowerCase();
    for (let i = 0; i < low.length; i++) at.push(index);
    lower += low;
    index += char.length;
  }
  at.push(text.length);
  return { lower, at };
}

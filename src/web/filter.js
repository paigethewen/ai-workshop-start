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

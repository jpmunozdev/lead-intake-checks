import { issue, TEST_WORDS } from './issues.js';

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof']);
const SUFFIX = /,?\s+(jr|sr|ii|iii|iv)\.?$/i;
const PLACEHOLDERS = new Set([
  ...TEST_WORDS, 'none', 'unknown', 'null', 'undefined', 'name', 'first', 'last', 'firstname', 'lastname',
  'noname', 'xxx', 'lead', 'customer', 'user', 'anonymous',
]);

/**
 * Clean first and last name, split a full name when that's all there is,
 * and pick a greeting name that is safe to drop into "Hi {first}".
 */
export function checkName(fields) {
  const result = { firstName: null, lastName: null, suffix: null, greetingName: null, isTest: false, issues: [] };
  const add = (code) => result.issues.push(issue(code));

  const first = scrub(fields.firstName);
  const last = scrub(fields.lastName);
  const full = scrub(fields.fullName);
  if (first.changed || last.changed || (!first.text && full.changed)) add('name_cleaned');

  let parts = { first: first.text, last: last.text, suffix: null };
  if (!parts.first && !parts.last && full.text) parts = splitFull(full.text);
  else if (parts.first && !parts.last && parts.first.includes(' ')) parts = splitFull(parts.first);
  else if (parts.last) {
    const sfx = parts.last.match(SUFFIX);
    if (sfx) parts = { ...parts, last: parts.last.slice(0, sfx.index), suffix: sfx[1] };
  }
  if (parts.first && parts.last && !(first.text && last.text)) add('name_split');

  const fixedFirst = fixCase(parts.first);
  const fixedLast = fixCase(parts.last);
  if (fixedFirst !== parts.first || fixedLast !== parts.last) add('name_case_fixed');

  result.firstName = fixedFirst || null;
  result.lastName = fixedLast || null;
  result.suffix = parts.suffix ? formatSuffix(parts.suffix) : null;

  const words = `${parts.first} ${parts.last}`.toLowerCase().split(/[\s.,]+/).filter(Boolean);
  result.isTest = words.length > 0 && words.every((w) => TEST_WORDS.has(w));
  const placeholder = words.length > 0 && words.every((w) => PLACEHOLDERS.has(w) || /^(\p{L})\1{2,}$/u.test(w));
  if (placeholder && !result.isTest) add('name_placeholder');
  else if (words.some((w) => w.length >= 4 && /^[a-z]+$/.test(w) && !/[aeiouy]/.test(w))) add('name_suspicious');

  if (!result.firstName) add('name_missing');
  else if (!placeholder && result.firstName.replace(/[^\p{L}]/gu, '').length >= 2) result.greetingName = result.firstName;
  return result;
}

function scrub(value) {
  if (value == null) return { text: '', changed: false };
  const raw = String(value).normalize('NFC').replace(/[\u2019\u2018]/g, "'").replace(/\s+/g, ' ').trim();
  const text = raw
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, ' ')
    .replace(/[^\p{L}\p{M}\s'.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, changed: text !== raw };
}

function splitFull(text) {
  let rest = text;
  let suffix = null;
  const sfx = rest.match(SUFFIX);
  if (sfx) {
    suffix = sfx[1];
    rest = rest.slice(0, sfx.index);
  }
  // "Nguyen, Linh" is last name first.
  if (rest.includes(',')) {
    const i = rest.indexOf(',');
    return { first: rest.slice(i + 1).replace(/,/g, ' ').trim(), last: rest.slice(0, i).trim(), suffix };
  }
  const words = rest.split(' ').filter(Boolean);
  while (words.length > 1 && TITLES.has(words[0].toLowerCase().replace(/\.$/, ''))) words.shift();
  return { first: words.shift() ?? '', last: words.join(' '), suffix };
}

// Only touch names typed in all caps or all lowercase. Mixed case is how the person spells it.
function fixCase(part) {
  if (!part) return part;
  const letters = part.replace(/[^\p{L}]/gu, '');
  if (letters.length === 1) return part.toUpperCase();
  if (letters !== letters.toUpperCase() && letters !== letters.toLowerCase()) return part;
  return part
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/(^|[\s'-])Mc(\p{Ll})/gu, (_, sep, ch) => `${sep}Mc${ch.toUpperCase()}`);
}

function formatSuffix(s) {
  const lower = s.toLowerCase();
  return lower === 'jr' || lower === 'sr' ? `${s[0].toUpperCase()}${lower[1]}.` : s.toUpperCase();
}

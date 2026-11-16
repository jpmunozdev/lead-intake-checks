import { issue, TEST_WORDS } from './issues.js';

// Big consumer mailbox providers and the TLD each one really uses.
const PROVIDERS = {
  gmail: 'com', yahoo: 'com', hotmail: 'com', outlook: 'com', icloud: 'com', aol: 'com', ymail: 'com',
  live: 'com', msn: 'com', protonmail: 'com', comcast: 'net', att: 'net', verizon: 'net', sbcglobal: 'net',
  bellsouth: 'net', cox: 'net', charter: 'net',
};
const TLD_TYPOS = {
  com: ['con', 'cmo', 'ocm', 'vom', 'xom', 'cim', 'comm', 'coom', 'co', 'cm', 'om'],
  net: ['ner', 'nte', 'met', 'bet', 'nett', 'ne', 'nt'],
};
// Real domains that sit one letter away from a provider. Never "correct" these.
const REAL_LOOKALIKES = new Set(['email.com', 'mail.com', 'gmx.com', 'me.com', 'mac.com']);

// A short list on purpose. Pass options.disposableDomains to add your own.
const DISPOSABLE = [
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com',
  'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'maildrop.cc', 'dispostable.com',
  'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'emailondeck.com',
];
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);

const PLACEHOLDER_LOCALS = new Set([
  'noemail', 'no-email', 'no.email', 'nomail', 'none', 'noreply', 'no-reply', 'donotreply',
  'na', 'null', 'unknown', 'email', 'nope', 'no',
]);
const ROLE_LOCALS = new Set([
  'info', 'admin', 'sales', 'support', 'office', 'contact', 'hello', 'team', 'marketing', 'billing',
  'help', 'webmaster', 'postmaster', 'hr', 'careers', 'jobs', 'enquiries', 'inquiries',
]);

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

/** Clean an email address, check it can reach a person, and build a key for duplicate matching. */
export function checkEmail(raw, options = {}) {
  const result = { address: null, matchKey: null, usable: false, isTest: false, issues: [] };
  const add = (code, extra) => result.issues.push(issue(code, extra));

  let text = raw == null ? '' : String(raw).trim();
  if (!text) {
    add('email_missing');
    return result;
  }

  // "Jane Doe <jane@acme.com>": keep only the address inside the angle brackets.
  const named = [...text.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)].map((m) => m[1]);
  if (named.length) text = named.join(' ');

  const candidates = text.split(/[\s,;/]+/).filter((t) => t.includes('@'));
  if (candidates.length > 1) {
    add('email_multiple');
    text = candidates[0];
  }

  const cleaned = text
    .replace(/\s+/g, '')
    .replace(/^mailto:/i, '')
    .replace(/^[<"'(]+|[>"'),.;:]+$/g, '');
  if (named.length || cleaned !== text) add('email_cleaned');

  const address = cleaned.toLowerCase();
  const at = address.lastIndexOf('@');
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (at < 1 || address.indexOf('@') !== at || local.length > 64 || address.length > 254 ||
      !LOCAL.test(local) || !DOMAIN.test(domain)) {
    add('email_invalid');
    return result;
  }

  if (isReserved(domain) && !options.allowReserved) add('email_reserved');
  const disposable = new Set([...DISPOSABLE, ...(options.disposableDomains ?? [])]);
  if (disposable.has(domain)) add('email_disposable');
  result.isTest = TEST_WORDS.has(local) || /^test\d+$/.test(local);
  if (!result.isTest) {
    if (PLACEHOLDER_LOCALS.has(local) || /^(.)\1{2,}$/.test(local)) add('email_placeholder');
    else if (ROLE_LOCALS.has(local)) add('email_role');
  }
  const suggestion = suggestDomain(domain);
  if (suggestion) add('email_domain_typo', { suggestion: `${local}@${suggestion}` });

  result.address = address;
  result.usable = !result.issues.some((i) => i.severity === 'error');
  if (result.usable) result.matchKey = matchKey(local, domain);
  return result;
}

function isReserved(domain) {
  return RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.has(domain.slice(domain.lastIndexOf('.') + 1));
}

// Gmail ignores dots and anything after a plus, so j.smith+zillow@gmail.com and jsmith@gmail.com are one inbox.
function matchKey(local, domain) {
  let user = local.split('+')[0] || local;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    user = user.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${user}@${domain}`;
}

function suggestDomain(domain) {
  if (REAL_LOOKALIKES.has(domain)) return null;
  const dot = domain.indexOf('.');
  if (dot < 1) return null;
  const label = domain.slice(0, dot);
  const rest = domain.slice(dot + 1);
  const candidates = label in PROVIDERS
    ? [label]
    : Object.keys(PROVIDERS).filter((p) => p.length >= 5 && oneEditApart(p, label));
  if (candidates.length !== 1) return null;
  const provider = candidates[0];
  const tld = PROVIDERS[provider];
  const right = `${provider}.${tld}`;
  if (right === domain) return null;
  return rest === tld || TLD_TYPOS[tld].includes(rest) ? right : null;
}

// True when one insert, delete, swap of neighbors, or substitution turns a into b.
function oneEditApart(a, b) {
  if (a === b) return false;
  if (a.length === b.length) {
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

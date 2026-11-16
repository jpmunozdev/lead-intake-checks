// lead-intake-checks for n8n: https://github.com/jpmunozdev/lead-intake-checks
// Paste into a Code node set to "Run Once for All Items". Each item comes out with an `intake` field.
// Generated from src/ by scripts/build-n8n.js. Edit OPTIONS below, not the library.

const OPTIONS = {
  allowReserved: false,     // true accepts 555-01xx numbers and example.com, for testing with fixtures
  textInternational: false, // true if your SMS setup can text outside North America
  fieldMap: {},             // your own field labels, e.g. { phone: 'Best number to reach you' }
  disposableDomains: [],    // extra throwaway domains to reject
  tagPrefix: '',            // e.g. 'intake:' to group the tags in your CRM
};

const { checkLeads } = (() => {
  // Every check reports issues from this one catalog, so codes, severities and wording stay consistent.
  // error: the field can't be used. warn: a person should look. info: something was fixed or is worth knowing.
  const ISSUES = {
    phone_missing: ['info', 'No phone number.'],
    phone_not_numeric: ['error', 'Phone has words or symbols in it, not just a number.'],
    phone_missing_area_code: ['error', 'Phone has 7 digits. The area code is missing.'],
    phone_bad_length: ['error', 'Phone has the wrong number of digits.'],
    phone_bad_area_code: ['error', 'Not a valid North American area code.'],
    phone_bad_exchange: ['error', "The 3 digits after the area code can't start a real number."],
    phone_repeated_digits: ['error', 'Phone is one digit repeated.'],
    phone_fictional: ['error', 'Phone is in the 555-0100 to 555-0199 range reserved for fiction.'],
    phone_premium: ['error', '900 numbers are premium-rate lines.'],
    phone_toll_free: ['warn', 'Toll-free number. Likely a business line, and texts may not reach a person.'],
    phone_international: ['warn', 'Number is outside North America, or a US number typed with + but no 1. Only its length was checked.'],
    phone_extension: ['info', 'Extension moved to its own field.'],

    email_missing: ['info', 'No email address.'],
    email_invalid: ['error', 'Email address is not valid.'],
    email_cleaned: ['info', 'Removed spaces or extra characters from the email.'],
    email_multiple: ['warn', 'More than one email in the field. Kept the first.'],
    email_domain_typo: ['warn', 'Email domain looks like a typo.'],
    email_disposable: ['error', 'Throwaway inbox service.'],
    email_reserved: ['error', "Domain is reserved for examples and tests. Mail can't be delivered."],
    email_placeholder: ['error', 'Placeholder address typed to get past a required field.'],
    email_role: ['warn', 'Shared inbox like info@ or sales@, not a person.'],

    name_missing: ['info', 'No first name. Greetings need a fallback.'],
    name_split: ['info', 'Split a full name into first and last.'],
    name_cleaned: ['info', 'Removed emoji, numbers or symbols from the name.'],
    name_case_fixed: ['info', 'Fixed an all-caps or all-lowercase name.'],
    name_placeholder: ['warn', 'Name looks like a placeholder.'],
    name_suspicious: ['warn', 'Name has no vowels. Might be keyboard mash.'],

    lead_no_contact: ['error', 'No usable phone or email.'],
    lead_test: ['error', 'Looks like a test submission.'],
    lead_duplicate: ['warn', 'Same phone or email as an earlier lead in this batch.'],
  };

  // Words people type when they are testing a form, not filling it in.
  const TEST_WORDS = new Set(['test', 'tester', 'testing', 'asdf', 'qwerty', 'fake']);

  function issue(code, extra = {}) {
    const [severity, message] = ISSUES[code];
    return { code, field: code.split('_')[0], severity, message, ...extra };
  }

  const TOLL_FREE = new Set(['800', '833', '844', '855', '866', '877', '888']);
  const EXTENSION = /\s*(?:;\s*ext=|extension|ext\.?|x|#)\s*(\d{1,6})\s*$/i;

  /**
   * Normalize a phone number to E.164 and check it could belong to a person.
   * North American numbers get full structure checks. Other countries get a length check only.
   */
  function checkPhone(raw, options = {}) {
    const result = { e164: null, display: null, extension: null, region: null, tollFree: false, usable: false, issues: [] };
    const add = (code) => result.issues.push(issue(code));

    let text = raw == null ? '' : String(raw).trim();
    if (!text) {
      add('phone_missing');
      return result;
    }

    const ext = text.match(EXTENSION);
    if (ext && ext.index > 0) {
      result.extension = ext[1];
      text = text.slice(0, ext.index);
      add('phone_extension');
    }

    const compact = text.replace(/[\s().\-/\u00a0]/g, '');
    if (!/^\+?\d+$/.test(compact)) {
      add('phone_not_numeric');
      return result;
    }

    let digits = compact;
    let international = false;
    for (const prefix of ['+', '011', '00']) {
      if (digits.startsWith(prefix)) {
        digits = digits.slice(prefix.length);
        international = true;
        break;
      }
    }

    if (international && !digits.startsWith('1')) return checkInternational(digits, result, add);

    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (national.length === 7 && !international) {
      add('phone_missing_area_code');
      return result;
    }
    if (national.length !== 10) {
      add('phone_bad_length');
      return result;
    }
    return checkNanp(national, result, add, options);
  }

  function checkNanp(national, result, add, options) {
    const npa = national.slice(0, 3);
    const nxx = national.slice(3, 6);
    const line = national.slice(6);

    if (/^(\d)\1+$/.test(national)) add('phone_repeated_digits');
    // Area codes start with 2-9. N11 codes are services, N9X, 37X and 96X are held back for expansion.
    else if (!/^[2-9]/.test(npa) || npa.endsWith('11') || npa[1] === '9' || /^(37|96)/.test(npa)) add('phone_bad_area_code');
    else if (!/^[2-9]/.test(nxx) || nxx.endsWith('11')) add('phone_bad_exchange');
    else if (npa === '900') add('phone_premium');
    else if (nxx === '555' && line >= '0100' && line <= '0199' && !options.allowReserved) add('phone_fictional');
    else if (TOLL_FREE.has(npa)) add('phone_toll_free');

    result.usable = !result.issues.some((i) => i.severity === 'error');
    if (result.usable) {
      result.e164 = `+1${national}`;
      result.display = `(${npa}) ${nxx}-${line}`;
      result.region = 'NANP';
      result.tollFree = TOLL_FREE.has(npa);
    }
    return result;
  }

  function checkInternational(digits, result, add) {
    if (digits.length < 7 || digits.length > 15) add('phone_bad_length');
    else if (/^(\d)\1+$/.test(digits)) add('phone_repeated_digits');
    else {
      result.e164 = `+${digits}`;
      result.display = result.e164;
      result.region = 'intl';
      result.usable = true;
      add('phone_international');
    }
    return result;
  }

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
  function checkEmail(raw, options = {}) {
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

  const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof']);
  const SUFFIX = /,?\s+(jr|sr|ii|iii|iv)\.?$/i;
  const CREDENTIALS = new Set(['md', 'phd', 'dds', 'dmd', 'cpa', 'esq', 'rn', 'mba', 'jd']);
  const PLACEHOLDERS = new Set([
    ...TEST_WORDS, 'none', 'unknown', 'null', 'undefined', 'name', 'first', 'last', 'firstname', 'lastname',
    'noname', 'xxx', 'lead', 'customer', 'user', 'anonymous',
  ]);

  /**
   * Clean first and last name, split a full name when that's all there is,
   * and pick a greeting name that is safe to drop into "Hi {first}".
   */
  function checkName(fields) {
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
    // "Jordan Ellis, MD" ends in a credential, not a first name.
    let cred;
    while ((cred = rest.match(/,\s*([\p{L}.]+)$/u)) && CREDENTIALS.has(cred[1].toLowerCase().replace(/\./g, ''))) {
      rest = rest.slice(0, cred.index);
    }
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

  // Field names seen in web forms, CRM webhooks and ad platforms, compared without case, spaces or punctuation.
  const ALIASES = {
    firstName: ['firstname', 'fname', 'first', 'givenname'],
    lastName: ['lastname', 'lname', 'last', 'surname', 'familyname'],
    fullName: ['fullname', 'name', 'contactname', 'leadname', 'yourname'],
    email: ['email', 'emailaddress', 'mail', 'youremail', 'workemail'],
    phone: [
      'phone', 'phonenumber', 'mobile', 'mobilephone', 'mobilenumber', 'cell', 'cellphone', 'cellnumber',
      'telephone', 'tel', 'primaryphone', 'phone1', 'contactnumber',
    ],
    source: ['source', 'leadsource', 'contactsource', 'utmsource'],
  };

  const keyOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');

  /**
   * Pull name, email, phone and source out of whatever shape the lead arrived in:
   * flat form fields, an n8n Webhook item (fields under `body`), or Facebook Lead Ads `field_data`.
   * `fieldMap` names a custom field for any target, e.g. { phone: 'Best number to reach you' }.
   */
  function readFields(input, fieldMap = {}) {
    const values = collect(input);
    const fields = {};
    for (const [target, aliases] of Object.entries(ALIASES)) {
      const keys = fieldMap[target] ? [keyOf(fieldMap[target]), ...aliases] : aliases;
      const key = keys.find((k) => values.get(k) != null && String(values.get(k)).trim() !== '');
      fields[target] = key ? values.get(key) : null;
    }
    return fields;
  }

  function collect(input) {
    const values = new Map();
    const take = (name, value) => {
      const key = keyOf(name);
      if (!values.has(key)) values.set(key, Array.isArray(value) ? value[0] : value);
    };
    const visit = (obj) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      for (const [name, value] of Object.entries(obj)) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) take(name, value);
      }
      if (Array.isArray(obj.field_data)) {
        for (const field of obj.field_data) if (field?.name) take(field.name, field.values);
      }
    };
    visit(input);
    visit(input?.body);
    return values;
  }

  /**
   * Check one inbound lead.
   *
   * options.allowReserved      accept fiction-reserved numbers and example domains (fixtures, demos)
   * options.textInternational  allow texting numbers outside North America
   * options.fieldMap           custom field names, e.g. { phone: 'Best number to reach you' }
   * options.disposableDomains  extra throwaway domains to reject
   * options.tagPrefix          prefix for the CRM tags, e.g. 'intake:'
   */
  function checkLead(input, options = {}) {
    const fields = readFields(input, options.fieldMap);
    const name = checkName(fields);
    const phone = checkPhone(fields.phone, options);
    const email = checkEmail(fields.email, options);
    const typo = email.issues.some((i) => i.code === 'email_domain_typo');

    const channels = {
      call: phone.usable,
      text: phone.usable && !phone.tollFree && (phone.region === 'NANP' || Boolean(options.textInternational)),
      email: email.usable && !typo,
    };

    const result = {
      status: null,
      ok: null,
      lead: {
        firstName: name.firstName,
        lastName: name.lastName,
        suffix: name.suffix,
        greetingName: name.greetingName,
        email: email.usable ? email.address : null,
        phone: phone.e164,
        phoneDisplay: phone.display,
        phoneExtension: phone.extension,
        source: fields.source ?? null,
      },
      channels,
      matchKeys: { phone: phone.e164, email: email.matchKey },
      issues: [...name.issues, ...phone.issues, ...email.issues],
      tags: [],
    };

    if (name.isTest || email.isTest) result.issues.push(issue('lead_test'));
    // A likely typo still leaves something a person can fix, so it isn't a dead lead.
    if (!channels.call && !channels.email && !typo) result.issues.push(issue('lead_no_contact'));
    return finish(result, options);
  }

  /** Check a batch in order and flag leads that share a phone or email with an earlier one. */
  function checkLeads(inputs, options = {}) {
    const seen = new Map();
    return inputs.map((input, index) => {
      const result = checkLead(input, options);
      const matches = [];
      for (const [kind, key] of Object.entries(result.matchKeys)) {
        if (!key) continue;
        const id = `${kind}:${key}`;
        if (seen.has(id)) matches.push({ kind, index: seen.get(id) });
        else seen.set(id, index);
      }
      if (matches.length) {
        result.issues.push(issue('lead_duplicate', { matches }));
        finish(result, options);
      }
      return result;
    });
  }

  function finish(result, options) {
    const codes = new Set(result.issues.map((i) => i.code));
    const flagged = result.issues.some((i) => i.severity !== 'info');
    result.status = codes.has('lead_test') || codes.has('lead_no_contact') ? 'reject' : flagged ? 'review' : 'clean';
    result.ok = result.status !== 'reject';

    const tags = [`intake-${result.status}`];
    if (!result.channels.call) tags.push('no-valid-phone');
    if (!result.channels.email) tags.push('no-valid-email');
    if (codes.has('email_domain_typo')) tags.push('email-typo');
    if (codes.has('lead_duplicate')) tags.push('possible-duplicate');
    if (codes.has('lead_test')) tags.push('test-lead');
    result.tags = tags.map((t) => `${options.tagPrefix ?? ''}${t}`);
    return result;
  }

  return { checkLeads };
})();

const items = $input.all();
const results = checkLeads(items.map((item) => item.json), OPTIONS);
return items.map((item, i) => ({ json: { ...item.json, intake: results[i] }, pairedItem: { item: i } }));

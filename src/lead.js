import { issue } from './issues.js';
import { readFields } from './fields.js';
import { checkName } from './name.js';
import { checkPhone } from './phone.js';
import { checkEmail } from './email.js';

/**
 * Check one inbound lead.
 *
 * options.allowReserved      accept fiction-reserved numbers and example domains (fixtures, demos)
 * options.textInternational  allow texting numbers outside North America
 * options.fieldMap           custom field names, e.g. { phone: 'Best number to reach you' }
 * options.disposableDomains  extra throwaway domains to reject
 * options.tagPrefix          prefix for the CRM tags, e.g. 'intake:'
 */
export function checkLead(input, options = {}) {
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
export function checkLeads(inputs, options = {}) {
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

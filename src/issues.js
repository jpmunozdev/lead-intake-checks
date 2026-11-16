// Every check reports issues from this one catalog, so codes, severities and wording stay consistent.
// error: the field can't be used. warn: a person should look. info: something was fixed or is worth knowing.
export const ISSUES = {
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
export const TEST_WORDS = new Set(['test', 'tester', 'testing', 'asdf', 'qwerty', 'fake']);

export function issue(code, extra = {}) {
  const [severity, message] = ISSUES[code];
  return { code, field: code.split('_')[0], severity, message, ...extra };
}

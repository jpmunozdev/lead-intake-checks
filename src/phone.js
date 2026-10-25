import { issue } from './issues.js';

const TOLL_FREE = new Set(['800', '833', '844', '855', '866', '877', '888']);
const EXTENSION = /\s*(?:;\s*ext=|extension|ext\.?|x|#)\s*(\d{1,6})\s*$/i;

/**
 * Normalize a phone number to E.164 and check it could belong to a person.
 * North American numbers get full structure checks. Other countries get a length check only.
 */
export function checkPhone(raw, options = {}) {
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

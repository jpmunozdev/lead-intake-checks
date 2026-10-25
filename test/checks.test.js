import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPhone, checkEmail, checkName } from '../src/index.js';

const codes = (result) => result.issues.map((i) => i.code);

test('phone: formats normalize to E.164', () => {
  for (const raw of ['2025550143', '(202) 555-0143', '202.555.0143', '+1 202 555 0143', '1-202-555-0143', '001 202 555 0143']) {
    assert.equal(checkPhone(raw, { allowReserved: true }).e164, '+12025550143', raw);
  }
  assert.equal(checkPhone(2025550143, { allowReserved: true }).e164, '+12025550143', 'numbers from a spreadsheet');
});

test('phone: structure rules', () => {
  assert.deepEqual(codes(checkPhone('211-555-0143')), ['phone_bad_area_code'], 'N11 area code');
  assert.deepEqual(codes(checkPhone('292-555-0143')), ['phone_bad_area_code'], 'N9X is held back');
  assert.deepEqual(codes(checkPhone('212-911-4567')), ['phone_bad_exchange']);
  assert.deepEqual(codes(checkPhone('212-055-4567')), ['phone_bad_exchange']);
  assert.deepEqual(codes(checkPhone('900-555-1234')), ['phone_premium']);
  assert.deepEqual(codes(checkPhone('202-555-01')), ['phone_bad_length']);
  assert.deepEqual(codes(checkPhone('202-555-0143 x 7')), ['phone_extension', 'phone_fictional']);
  assert.equal(checkPhone('202-555-1234').usable, true, '555 outside 0100-0199 is a real exchange');
});

test('phone: international numbers get a length check only', () => {
  const uk = checkPhone('011 44 20 7946 0958');
  assert.equal(uk.e164, '+442079460958');
  assert.equal(uk.region, 'intl');
  assert.deepEqual(codes(checkPhone('+44 123')), ['phone_bad_length']);
});

test('email: typo suggestions only for known providers', () => {
  const suggestion = (raw) => checkEmail(raw).issues.find((i) => i.code === 'email_domain_typo')?.suggestion;
  assert.equal(suggestion('jo@gmial.com'), 'jo@gmail.com');
  assert.equal(suggestion('jo@gmail.co'), 'jo@gmail.com');
  assert.equal(suggestion('jo@hotmal.com'), 'jo@hotmail.com');
  assert.equal(suggestion('jo@verizon.ner'), 'jo@verizon.net');
  assert.equal(suggestion('jo@ymail.com'), undefined, 'ymail.com is real');
  assert.equal(suggestion('jo@email.com'), undefined, 'email.com is real');
  assert.equal(suggestion('jo@yahoo.co.uk'), undefined, 'country domains are real');
  assert.equal(suggestion('jo@att.com'), undefined, 'att.com is a real company domain');
  assert.equal(suggestion('jo@acme-realty.com'), undefined);
});

test('email: match keys treat Gmail dots and plus tags as one inbox', () => {
  assert.equal(checkEmail('J.Smith+zillow@Gmail.com').matchKey, 'jsmith@gmail.com');
  assert.equal(checkEmail('jsmith@googlemail.com').matchKey, 'jsmith@gmail.com');
  assert.equal(checkEmail('j.smith+tag@acme.com').matchKey, 'j.smith@acme.com', 'dots only matter outside Gmail');
});

test('email: extra throwaway domains can be added', () => {
  assert.deepEqual(codes(checkEmail('a.lead@burner.example', { allowReserved: true, disposableDomains: ['burner.example'] })), ['email_disposable']);
});

test('name: case is only fixed when the whole name is one case', () => {
  assert.equal(checkName({ firstName: 'DeShawn', lastName: 'McKenzie' }).lastName, 'McKenzie');
  assert.equal(checkName({ firstName: 'deshawn', lastName: 'mckenzie' }).lastName, 'McKenzie');
  assert.equal(checkName({ firstName: 'mary-jane', lastName: "d'angelo" }).lastName, "D'Angelo");
  assert.equal(checkName({ firstName: 'mary-jane' }).firstName, 'Mary-Jane');
});

test('name: titles drop, suffixes keep, initials are not greeted', () => {
  const dr = checkName({ fullName: 'Dr. Ana Silva' });
  assert.equal(dr.firstName, 'Ana');
  assert.equal(dr.lastName, 'Silva');
  assert.equal(checkName({ firstName: 'Robert', lastName: 'Hale III' }).suffix, 'III');
  assert.equal(checkName({ firstName: 'J', lastName: 'Ortiz' }).greetingName, null);
});

test('name: non-Latin names pass untouched', () => {
  const result = checkName({ firstName: '美玲', lastName: '陳' });
  assert.equal(result.firstName, '美玲');
  assert.deepEqual(codes(result), []);
});

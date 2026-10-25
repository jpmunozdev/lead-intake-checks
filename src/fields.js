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
export function readFields(input, fieldMap = {}) {
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

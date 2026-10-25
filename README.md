# lead-intake-checks

Check and clean inbound leads before they reach your CRM. Phone, email, name and duplicates in one call, with no dependencies. Use it in Node, or paste one file into an n8n Code node.

Leads arrive messy: a phone number with no area code, `noemail@gmail.com` typed to get past a required field, a whole name in the first name box, the same person from two forms. If the intake step lets these through, the dialer calls numbers that can't connect, the first text opens with "Hi ," and one person ends up in two follow-up sequences.

`checkLead` returns the cleaned lead along with what your workflow needs to route it:

```js
import { checkLead } from 'lead-intake-checks';

checkLead({ full_name: 'JORDAN ELLIS', email: 'jordan.ellis@gmial.com', phone: '202.555.0152' });
```

```json
{
  "status": "review",
  "ok": true,
  "lead": {
    "firstName": "Jordan",
    "lastName": "Ellis",
    "greetingName": "Jordan",
    "email": "jordan.ellis@gmial.com",
    "phone": "+12025550152",
    "phoneDisplay": "(202) 555-0152"
  },
  "channels": { "call": true, "text": true, "email": false },
  "matchKeys": { "phone": "+12025550152", "email": "jordan.ellis@gmial.com" },
  "issues": [
    { "code": "name_split", "severity": "info", "message": "Split a full name into first and last." },
    { "code": "name_case_fixed", "severity": "info", "message": "Fixed an all-caps or all-lowercase name." },
    { "code": "email_domain_typo", "severity": "warn", "message": "Email domain looks like a typo.", "suggestion": "jordan.ellis@gmail.com" }
  ],
  "tags": ["intake-review", "no-valid-email", "email-typo"]
}
```

The output is trimmed here. Every result also has `suffix`, `phoneExtension`, `source`, and a `field` on each issue.

## Reading the result

| Field | Meaning |
|---|---|
| `status` | `clean`: nothing for a person to look at. `review`: usable, but something needs a look. `reject`: a test submission, or nothing left to contact. |
| `channels` | Which automations are safe to run. `text` is false for toll-free numbers and for numbers outside North America unless you set `textInternational`. `email` stays false while a typo is suspected. |
| `lead` | The cleaned record. Phones are E.164. `greetingName` is null when there's no first name you'd want to greet, so a template can fall back to "Hi there". |
| `matchKeys` | Normalized phone and email for duplicate lookups in your CRM. Gmail dots and `+tags` are removed from the email key. |
| `issues` | Everything found, each with a code, a severity (`error`, `warn`, `info`) and a plain message. |
| `tags` | Ready-made CRM tags: `intake-clean`, `intake-review`, `intake-reject`, `no-valid-phone`, `no-valid-email`, `email-typo`, `possible-duplicate`, `test-lead`. |

## What it checks

### Phone

Normalizes any common format to E.164 and splits off extensions. North American numbers are checked for structure: a missing area code, area codes that can't exist (0 or 1 first, N11, the reserved N9X, 37X and 96X ranges), bad exchanges, one digit repeated, 900 premium lines, the 555-0100 to 555-0199 fiction range, and toll-free numbers. Numbers from other countries get a length check.

### Email

Strips `mailto:`, brackets and stray spaces. Keeps the first address when two are pasted in one field. Rejects invalid syntax, throwaway inbox services, example domains, and placeholders like `noemail@` and `none@`. Flags shared inboxes like `info@`. Suggests a fix for likely typos of the big consumer providers (`gmial.com`, `yahoo.con`, `hotmal.com`, `verizon.ner`) while leaving real lookalikes alone (`ymail.com`, `email.com`, `yahoo.co.uk`, `att.com`).

### Name

Splits a full name, a whole name typed into the first name field, and "Last, First". Drops titles, keeps suffixes, removes emoji and digits. Fixes all-caps and all-lowercase names (`SEAN O'CONNOR-MCKAY JR.` becomes Sean O'Connor-McKay, Jr.) and leaves mixed case alone, since that's how the person spells it. Flags placeholders and keyboard mash.

### Lead

Spots test submissions and leads with nothing to contact. In a batch, it also flags repeats of an earlier lead by phone or email.

### Field names

Reads flat form fields (`first_name`, `firstName`, `Phone Number`, `mobile` and other common names), n8n Webhook items with the form under `body`, and the Facebook Lead Ads `field_data` shape. Map any other label with `fieldMap`.

## Use it in n8n

1. Add a Code node right after your trigger and set it to **Run Once for All Items**.
2. Paste in [`dist/n8n-code-node.js`](dist/n8n-code-node.js). Settings are at the top of the file.
3. Route on `{{ $json.intake.status }}` with a Switch node: `clean` to the CRM, `review` to the CRM plus a task for a person, `reject` to a log.
4. Greet with `{{ $json.intake.lead.greetingName || 'there' }}`, and gate texts on `{{ $json.intake.channels.text }}`.

Every item keeps its original fields and gains an `intake` field. Leads in the same run are checked against each other for duplicates. The file has been run in an n8n Code node on all 31 fixture leads, and a test keeps it identical to the source.

## Use it in Node

Requires Node 20 or newer. It isn't on npm yet, so install it from GitHub:

```bash
npm install github:jpmunozdev/lead-intake-checks
```

```js
import { checkLead, checkLeads } from 'lead-intake-checks';

const result = checkLead(formData, { tagPrefix: 'intake:' });
const batch = checkLeads(rowsFromASheet); // also flags duplicates within the batch
```

`checkPhone`, `checkEmail`, `checkName` and `readFields` are exported too, if you only need one piece.

| Option | Default | What it does |
|---|---|---|
| `fieldMap` | `{}` | Your own field labels, e.g. `{ phone: 'Best number to reach you' }`. Targets: `firstName`, `lastName`, `fullName`, `email`, `phone`, `source`. |
| `textInternational` | `false` | Set to `true` if your SMS setup can text outside North America. |
| `disposableDomains` | `[]` | Extra throwaway domains to reject. The built-in list is short on purpose. |
| `tagPrefix` | `''` | Prefix for the tags, e.g. `intake:`. |
| `allowReserved` | `false` | Accept 555-01xx numbers and example domains. For testing with the fixtures only. |

## Test your workflow with messy leads

[`fixtures/leads.json`](fixtures/leads.json) holds 31 messy leads, each with a note on what's wrong and the expected result. `bin/replay.js` posts them to a webhook one at a time, so you can watch how your workflow handles each:

```bash
node bin/replay.js --url https://your-n8n.example.com/webhook-test/leads --dry-run
node bin/replay.js --url https://your-n8n.example.com/webhook-test/leads --delay 1500
```

It sends 25 of the 31. Every phone number in those 25 is in the 555-0100 to 555-0199 range set aside for fiction, Ofcom's drama range for the UK, or one repeated digit. Every email uses an example domain or a reserved TLD. So if your workflow texts, calls or emails a test lead, nobody real gets it. The other 6 use real provider domains to show typos and placeholders, or a platform-only shape, and are never sent. A test checks all of this on every run.

## Limits

- These are format checks. A number can pass and still be disconnected or a landline, and an address can pass and still bounce. For that, add a lookup after this step, such as Twilio Lookup for line type or an email verification service.
- Full phone structure checks cover North America only.
- Duplicate checks cover one batch. Use `matchKeys` to search your CRM for older records.
- It doesn't decide consent or do-not-contact status. That belongs to your CRM and your own compliance rules.

## Development

```bash
npm test        # 47 tests, no dependencies
npm run build   # rebuild dist/n8n-code-node.js after changing src/
```

CI runs the tests on Node 20, 22 and 24.

## About

I'm John Muñoz. I build lead follow-up and booking automation in GoHighLevel and n8n for real estate, mortgage, and other appointment-based businesses. More at [jpmunoz.info](https://jpmunoz.info).

MIT license.

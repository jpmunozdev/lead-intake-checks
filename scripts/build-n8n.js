// Builds dist/n8n-code-node.js: the whole library in one file you can paste into an n8n Code node.
// n8n Code nodes can't import local files, so the modules are joined in dependency order with their
// import and export lines removed. Run `npm run build` after changing anything in src/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ORDER = ['issues', 'phone', 'email', 'name', 'fields', 'lead'];
const root = new URL('../', import.meta.url);

export function buildN8n() {
  const library = ORDER.map((name) => {
    const source = readFileSync(new URL(`src/${name}.js`, root), 'utf8');
    return source
      .replace(/^import .*;\n/gm, '')
      .replace(/^export /gm, '')
      .trim();
  }).join('\n\n');

  return `// lead-intake-checks for n8n: https://github.com/jpmunozdev/lead-intake-checks
// Paste into a Code node set to "Run Once for All Items". Each item comes out with an \`intake\` field.
// Generated from src/ by scripts/build-n8n.js. Edit OPTIONS below, not the library.

const OPTIONS = {
  allowReserved: false,     // true accepts 555-01xx numbers and example.com, for testing with fixtures
  textInternational: false, // true if your SMS setup can text outside North America
  fieldMap: {},             // your own field labels, e.g. { phone: 'Best number to reach you' }
  disposableDomains: [],    // extra throwaway domains to reject
  tagPrefix: '',            // e.g. 'intake:' to group the tags in your CRM
};

const { checkLeads } = (() => {
${indent(library)}

  return { checkLeads };
})();

const items = $input.all();
const results = checkLeads(items.map((item) => item.json), OPTIONS);
return items.map((item, i) => ({ json: { ...item.json, intake: results[i] }, pairedItem: { item: i } }));
`;
}

function indent(text) {
  return text.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(new URL('dist/', root), { recursive: true });
  writeFileSync(new URL('dist/n8n-code-node.js', root), buildN8n());
  console.log('Wrote dist/n8n-code-node.js');
}

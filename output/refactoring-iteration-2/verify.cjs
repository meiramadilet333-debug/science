const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const frontend = 'artifacts/scientific-navigator/src/pages/grants.tsx';
const backend = 'artifacts/api-server/src/lib/grant-opportunities.ts';
const dates = 'artifacts/api-server/src/lib/grant-dates.ts';
const identity = 'artifacts/api-server/src/lib/grant-identity.ts';
function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function functions(file, names) {
  const source = parse(file);
  const nodes = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(nodes.length, names.length);
  return nodes.map(node => node.getText(source).replace(/^export /, '')).join('\n');
}
function variables(file, names) {
  const source = parse(file);
  const declarations = source.statements.flatMap(node =>
    ts.isVariableStatement(node) ? node.declarationList.declarations : [],
  );
  const nodes = declarations.filter(node => names.includes(node.name.getText(source)));
  assert.equal(nodes.length, names.length);
  return nodes.map(node => node.parent.parent.getText(source)).join('\n');
}
function evaluate(code, bindings = {}) {
  return vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { URL, ...bindings });
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
const oldPage = parse('output/refactoring-iteration-2/grants.before.tsx');
const oldExpressions = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['directions', 'categories', 'organizers'].includes(node.name.getText(oldPage))) {
    oldExpressions[node.name.getText(oldPage)] = node.initializer.arguments[0].getText(oldPage);
  }
  ts.forEachChild(node, visit);
}
visit(oldPage);
assert.equal(Object.keys(oldExpressions).length, 3);
const oldFilters = evaluate(`(catalog) => ({${Object.entries(oldExpressions).map(([name, expression]) => `${name}: (${expression})()`).join(',')}})`);
const newFilters = evaluate(`${functions(frontend, ['buildGrantFilters'])}\nbuildGrantFilters`);
const canonicalGrantUrl = evaluate(`${functions(identity, ['canonicalGrantUrl'])}\ncanonicalGrantUrl`);
const deduplicateGrants = evaluate(`${functions(identity, ['canonicalGrantUrl', 'deduplicateGrants'])}\ndeduplicateGrants`);
assert.equal(canonicalGrantUrl('https://example.org/grant/?utm_source=feed&id=7&lang=ru#details'), 'https://example.org/grant?id=7');
assert.deepEqual(plain(deduplicateGrants([
  { id: 'same', title: '  Grant   title ', officialUrl: 'https://example.org/grant/?utm_source=feed&id=7#details' },
  { id: 'same', title: 'Grant title', officialUrl: 'https://example.org/grant?id=7&fbclid=tracking' },
  { id: 'different', title: 'Grant title', officialUrl: 'https://example.org/grant?id=7' },
  { id: 'invalid-a', title: 'Grant title', officialUrl: 'http://example.org/grant' },
  { id: 'invalid-a', title: 'Grant title', officialUrl: 'http://example.org/grant' },
]).map(item => item.id)), ['same', 'different', 'invalid-a', 'invalid-a']);
let seed = 42;
function random(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }
const strings = ['', ' ', 'Не указано', ' Не указано ', 'Биология', 'биология', 'А; Б;;', '__proto__', 'Қазақ', 'é', 'é'];
for (let i = 0; i < 1000; i++) {
  const opportunities = Object.freeze(Array.from({ length: random(100) }, () => Object.freeze({
    directions: strings[random(strings.length)], researcherCategory: strings[random(strings.length)], organizer: strings[random(strings.length)],
  })));
  assert.deepEqual(plain(newFilters(opportunities)), plain(oldFilters({ opportunities })));
}
assert.deepEqual(plain(newFilters([])), plain(oldFilters(null)));

const now = new Date('2026-10-23T18:59:59Z');
const opportunities = Object.freeze([
  { applicationStartDate: null, applicationEndDate: '2026-10-22', applicationEndTime: null },
  { applicationStartDate: null, applicationEndDate: '2026-10-23', applicationEndTime: '23:59:58' },
  { applicationStartDate: null, applicationEndDate: '2026-10-23', applicationEndTime: '23:59:59' },
  { applicationStartDate: null, applicationEndDate: '2026-10-23', applicationEndTime: null },
  { applicationStartDate: null, applicationEndDate: '2026-10-24', applicationEndTime: null },
  { applicationStartDate: null, applicationEndDate: '2028-02-29', applicationEndTime: null },
].map((item, id) => Object.freeze({ ...item, id, sourceName: 'Source', daysRemaining: 999 })));
async function cachedResponse(file, at) {
  let parseCalls = 0;
  class CountingDate extends Date { static parse(value) { parseCalls++; return Date.parse(value); } }
  const response = Object.freeze({ cached: false, message: 'unchanged', opportunities,
    sources: Object.freeze([Object.freeze({ name: 'Source', openCount: 999 })]) });
  const dateFunctions = file === backend
    ? `${variables(dates, ['kazakhstanFormatter'])}\n${functions(dates, ['getKazakhstanDateAndTime', 'strictCalendarDate', 'isStrictIsoDate', 'normalizeTime', 'isApplicationOpen'])}`
    : functions(file, ['getKazakhstanDateAndTime']);
  const catalogFunctions = file === backend
    ? functions(file, ['updateSourceOpenCounts', 'refreshGrantCatalogForTime', 'getCurrentGrantCatalog'])
    : functions(file, ['updateSourceOpenCounts', 'getCurrentGrantCatalog']);
  const getCatalog = evaluate(`${dateFunctions}\n${catalogFunctions}\ngetCurrentGrantCatalog`, {
    Date: CountingDate, catalogCache: { fetchedAt: at.getTime(), response },
    CATALOG_CACHE_TTL_MS: 60000, CATALOG_MIN_REFRESH_INTERVAL_MS: 10000, lastCatalogRefreshAt: at.getTime(),
  });
  return { result: plain(await getCatalog(at)), parseCalls };
}
(async () => {
  for (const at of [now, new Date('2026-10-23T19:00:00Z'), new Date('2028-02-28T19:00:00Z')]) {
    const before = await cachedResponse('output/refactoring-iteration-2/grant-opportunities.before.ts', at);
    const after = await cachedResponse(backend, at);
    const withoutMessage = ({ message, ...result }) => result;
    assert.deepEqual(withoutMessage(after.result), withoutMessage(before.result));
    const count = after.result.opportunities.length;
    assert.equal(before.parseCalls, count * 2);
    assert.equal(after.parseCalls, count + 1);
  }
  console.log('PASS: 1001 filter comparisons; 3 cached responses (deadline, midnight, leap day); Date.parse call counts; frozen inputs unchanged.');
})().catch(error => { console.error(error); process.exitCode = 1; });

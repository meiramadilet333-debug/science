const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
function loadFunctions(relativePath, names) {
  const filename = path.join(root, relativePath);
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(declarations.length, names.length);
  const code = declarations.map((node) => node.getText(source)).join('\n');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}\n({${names.join(',')}})`);
}

const oldAbstract = loadFunctions('output/refactoring-iteration-1/openalex.before.ts', ['asRecord', 'reconstructAbstract']).reconstructAbstract;
const newAbstract = loadFunctions('artifacts/api-server/src/lib/scientific-sources/openalex.ts', ['asRecord', 'reconstructAbstract']).reconstructAbstract;
let seed = 20261023;
function random(max) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % max;
}
const edgeCases = [null, undefined, [], '', 1, {}, { a: null }, { a: [] },
  { first: [2, 0], last: [0, 1] }, { a: [0], '': [0] },
  { a: [-1, 0.5, NaN, Infinity, '1', null, true, 20001] },
  { first: [-0], last: [0, 20000] }, { long: [20000] },
  { ['я'.repeat(9000)]: [0] }, { '2': [0], '1': [0] }];
for (const input of edgeCases) assert.equal(newAbstract(input), oldAbstract(input));
for (let i = 0; i < 1000; i++) {
  const input = {};
  for (let word = 0; word < random(100); word++) {
    input[`word${word}`] = Array.from({ length: random(15) }, () => random(20010) - 5);
  }
  assert.equal(newAbstract(input), oldAbstract(input));
}

const { updateSourceOpenCounts } = loadFunctions('artifacts/api-server/src/lib/grant-opportunities.ts', ['updateSourceOpenCounts']);
const oldCounts = (sources, opportunities) => sources.map((source) => ({
  ...source,
  openCount: opportunities.filter((item) => item.sourceName === source.name).length,
}));
const names = ['', '__proto__', 'constructor', 'OpenAlex', 'Источник', 'источник', 'Unknown'];
for (let i = 0; i < 1000; i++) {
  const sources = Object.freeze(Array.from({ length: random(20) }, (_, id) => Object.freeze({
    id: String(id), name: names[random(names.length)], url: 'https://example.org',
    state: 'connected', checkedAt: null, openCount: random(30), unconfirmedCount: 3, message: 'unchanged',
  })));
  const opportunities = Object.freeze(Array.from({ length: random(100) }, () =>
    Object.freeze({ sourceName: names[random(names.length)] })));
  const actual = updateSourceOpenCounts(sources, opportunities);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), oldCounts(sources, opportunities));
  actual.forEach((source, index) => assert.notEqual(source, sources[index]));
}
console.log(`PASS: ${edgeCases.length + 1000} abstract cases; 1000 source-count cases; frozen inputs unchanged.`);

// 用法：node scripts/test.js —— 运行 tests/cases.json 里的用例
const { createConverter } = require('../lib/converter');
const data = require('../data/terms.json');
const { cases, custom } = require('../tests/cases.json');
let fail = 0;
for (const c of [...cases, ...custom]) {
  const got = createConverter(data, c.dir, c.custom)(c.in);
  if (got !== c.out) { fail++; console.log(`FAIL [${c.dir}] ${c.in}\n  want ${c.out}\n  got  ${got}`); }
}
console.log(`${cases.length + custom.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

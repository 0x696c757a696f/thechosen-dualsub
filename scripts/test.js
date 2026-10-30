// 用法：node scripts/test.js —— 运行 tests/cases.json 里的用例
const { createConverter } = require('../lib/converter');
const data = require('../data/terms.json');
const { cases, custom } = require('../tests/cases.json');
let fail = 0;
for (const c of [...cases, ...custom]) {
  const got = createConverter(data, c.dir, c.custom)(c.in);
  if (got !== c.out) { fail++; console.log(`FAIL [${c.dir}] ${c.in}\n  want ${c.out}\n  got  ${got}`); }
}

// 双向条目里，同一个天主教写法只能对应一个新教写法，否则 c2p 方向有歧义（次要写法应标 only: "p2c"）
const byC = {};
for (const t of data.terms) {
  if (t.only === 'p2c' || t.p === t.c) continue;
  (byC[t.c] = byC[t.c] || []).push(t.p);
}
for (const [c, ps] of Object.entries(byC)) {
  if (ps.length > 1) { fail++; console.log(`FAIL c2p 歧义：${c} ← ${ps.join(' / ')}`); }
}
// 同一个新教写法不能出现两次
const seen = new Set();
for (const t of data.terms) {
  if (seen.has(t.p)) { fail++; console.log(`FAIL 重复词条：${t.p}`); }
  seen.add(t.p);
}

console.log(`${cases.length + custom.length} cases + table checks, ${fail} failed`);
process.exit(fail ? 1 : 0);

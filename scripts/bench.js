// 用法：node scripts/bench.js <字幕文本文件>
const fs = require('fs');
const { createConverter } = require('../lib/converter');
const data = require('../data/terms.json');
const text = fs.readFileSync(process.argv[2], 'utf8');
let t = performance.now();
const p2c = createConverter(data, 'p2c');
const build = performance.now() - t;
t = performance.now();
const out = p2c(text);
const conv = performance.now() - t;
t = performance.now();
for (const line of text.split('\n')) p2c(line);
const perLine = performance.now() - t;
console.log(`lines=${text.split('\n').length} build=${build.toFixed(2)}ms whole=${conv.toFixed(2)}ms perLine=${perLine.toFixed(2)}ms`);
const back = createConverter(data, 'c2p')(out);
const a = text.split('\n'), b = back.split('\n');
let diff = 0; a.forEach((l, i) => { if (l !== b[i]) diff++; });
console.log(`round-trip changed lines: ${diff}`);

// 从和合本→思高本译名对照 TSV 导入人名地名到 data/terms.json
// 用法：node scripts/import-names.js <译名对照.tsv> --wordlist <jieba dict.txt> [--dry]
// 来源：
//   https://github.com/baibanbao/cuv-with-sigao-names 的「译名对照.tsv」（列：和合本译名、思高本译名、替换次数）
//   https://github.com/fxsjy/jieba 的 dict.txt（MIT，「词 词频 词性」），只用来判断普通中文用词，不进仓库
//
// 规则：
// - 已有词条（人工审核过）优先，不覆盖
// - 单字词条不收（安→翁、但→丹 这类会误伤普通字）
// - 本地字幕语料里出现过的不收：这些已逐个人工审核，需要的已手工收录
// - 是普通常用词的不收：词典里非人名地名且词频 ≥ 20（以来、比赛、南方），或任何词性词频 ≥ 50（荷兰）
// - 一个和合本译名对应多个思高本译名时，取替换次数最多的
// - 思高本写法已被其他双向词条使用、或只有一个字时，标为 only: p2c，避免反向转换歧义
// - 误伤检查：会改错词典里词频 ≥ 30 的常用词（如「加利福尼亚大学」）的导入译名，直接不收；
//   名字后接河、山、城、人、书、福音等圣经语境，或前面是「圣」的不算误伤
const fs = require('fs');
const path = require('path');
const { createConverter } = require('../lib/converter');

const args = process.argv.slice(2);
const tsv = args[0];
const dry = args.includes('--dry');
const wordlist = args[args.indexOf('--wordlist') + 1];
if (!tsv || !args.includes('--wordlist') || !wordlist) {
  console.error('用法：node scripts/import-names.js <译名对照.tsv> --wordlist <jieba dict.txt> [--dry]');
  process.exit(1);
}

// ---- 普通中文词典 ----
const dict = new Map();   // 词 → { f: 词频, t: 词性 }
for (const line of fs.readFileSync(wordlist, 'utf8').split(/\r?\n/)) {
  const [w, f, t] = line.trim().split(' ');
  if (w) dict.set(w, { f: +f || 0, t });
}
const NAME_TAGS = new Set(['nr', 'nrt', 'nrfg', 'ns']);
const isCommonWord = p => {
  const e = dict.get(p);
  return !!e && (e.f >= 50 || (!NAME_TAGS.has(e.t) && e.f >= 20));
};

const root = path.join(__dirname, '..');
const termsFile = path.join(root, 'data', 'terms.json');
const data = JSON.parse(fs.readFileSync(termsFile, 'utf8'));
const SRC = 'cuv-sigao';
const PROTECT_SRC = 'common-word';   // 旧版自动生成的保护词，重新导入时清除

// 去掉上一次导入的结果，保证重复运行结果一致
data.terms = data.terms.filter(t => t.src !== SRC && t.src !== PROTECT_SRC);

// ---- 读取对照表，每个和合本译名取替换次数最多的思高本译名 ----
const best = new Map();   // p → { c, n }
for (const line of fs.readFileSync(tsv, 'utf8').split(/\r?\n/).slice(1)) {
  const [p, c, n] = line.split('\t').map(s => (s || '').trim());
  if (!p || !c || p === c) continue;
  const cur = best.get(p);
  if (!cur || +n > cur.n) best.set(p, { c, n: +n || 0 });
}

// ---- 本地语料（所有中文字幕），用来排除已审核或会误伤的词 ----
let corpus = '';
const corpusDir = path.join(root, 'corpus');
if (fs.existsSync(path.join(corpusDir, 'index.json'))) {
  for (const v of JSON.parse(fs.readFileSync(path.join(corpusDir, 'index.json'), 'utf8'))) {
    for (const lang of ['zh-CN', 'zh-TW', 'yue-hk']) {
      const f = path.join(corpusDir, v.slug, v.id, `${lang}.vtt`);
      if (fs.existsSync(f)) corpus += fs.readFileSync(f, 'utf8');
    }
  }
} else {
  console.warn('没有本地语料（corpus/），跳过「语料中出现过」的过滤；建议先运行 scripts/fetch-corpus.js');
}

// ---- 筛选 ----
const existingP = new Set(data.terms.map(t => t.p));
const usedC = new Set(data.terms.filter(t => t.only !== 'p2c' && t.p !== t.c).map(t => t.c));
const skipped = { existing: 0, single: 0, corpus: [], common: [] };
const added = [];
for (const [p, { c }] of [...best].sort((a, b) => b[1].n - a[1].n)) {
  const len = [...p].length;
  if (existingP.has(p)) { skipped.existing++; continue; }
  if (len < 2) { skipped.single++; continue; }
  if (corpus.includes(p)) { skipped.corpus.push(p); continue; }
  if (isCommonWord(p)) { skipped.common.push(p); continue; }
  const entry = { p, c, cat: 'bible', src: SRC };
  if (usedC.has(c) || [...c].length < 2) entry.only = 'p2c';
  else usedC.add(c);
  added.push(entry);
}

// ---- 误伤检查：导入的译名若会改错常用词（如「加利福尼亚大学」），直接不收这个译名 ----
// 名字后接河、山、城、人、书、福音等圣经语境，或前面是「圣」的，不算误伤
const BIBLICAL_AFFIX = /^(河|山|海|湖|城|地|人|书|记|纪|福音|之子|之女|王|家|族|支派|门|谷|泉|井|池|旷野|平原|半岛|沙漠|的)/;
const imported = new Map(added.map(t => [t.p, t]));
const curatedKeys = new Set(data.terms.map(t => t.p));
const dropped = new Map();          // 被去掉的导入译名 → 误伤的常用词
const curatedHits = new Map();      // 人工词条误伤的常用词（只报告，不处理）
for (let round = 0; round < 5; round++) {
  const convert = createConverter({ terms: [...data.terms, ...imported.values()] }, 'p2c');
  let changed = false;
  for (const [w, e] of dict) {
    if (e.f < 30 || [...w].length < 3 || best.has(w) || imported.has(w) || curatedKeys.has(w)) continue;
    const stats = {};
    if (convert(w, stats) === w) continue;
    for (const k of Object.keys(stats)) {
      const i = w.indexOf(k);
      const before = w.slice(0, i), after = w.slice(i + k.length);
      if ((!after && before === '圣') || (!before && BIBLICAL_AFFIX.test(after))) continue;
      if (imported.has(k)) {
        imported.delete(k);
        dropped.set(k, w);
        changed = true;
      } else if (curatedKeys.has(k)) {
        (curatedHits.get(k) || curatedHits.set(k, []).get(k)).push(w);
      }
    }
  }
  if (!changed) break;
}
const kept = added.filter(t => imported.has(t.p));

console.log(`对照表 ${best.size} 个译名：新增 ${kept.length}，已有 ${skipped.existing}，单字 ${skipped.single}，` +
  `语料中出现 ${skipped.corpus.length}，常用普通词 ${skipped.common.length}，误伤常用词 ${dropped.size}`);
console.log(`常用普通词（不收）：${skipped.common.join(' ')}`);
console.log(`误伤常用词（不收）：${[...dropped].map(([k, w]) => `${k}(${w})`).join(' ')}`);
console.log(`新增中标为单向的：${kept.filter(t => t.only).length}`);
console.log(`人工词条可能误伤的常用词（仅供参考）：${[...curatedHits].map(([k, ws]) => `${k}: ${[...new Set(ws)].slice(0, 6).join('、')}`).join('；')}`);

if (!dry) {
  data.categories.bible = data.categories.bible || '圣经人名地名（导入自 cuv-with-sigao-names 译名对照表）';
  data.terms.push(...kept);
  fs.writeFileSync(termsFile, JSON.stringify(data, null, 2)
    .replace(/\{\n\s+("p": [^\n]+)\n((?:\s+"[a-zA-Z]+": [^\n]+\n)+?)\s+\}/g,
      (m, a, b) => '{ ' + a + ' ' + b.trim().split(/\n\s+/).join(' ') + ' }') + '\n');
  console.log(`已写入 data/terms.json，共 ${data.terms.length} 条`);
}

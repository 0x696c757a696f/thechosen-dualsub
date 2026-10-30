// 用本地字幕语料检查词表覆盖与误伤（语料由 scripts/fetch-corpus.js 下载）
// 用法：node scripts/analyze-corpus.js [--lang zh-CN] [--map 译名对照.tsv] [--dict 词库.yaml ...] [--term 词]
//   --map   和合本→思高本对照 TSV（第一列和合本、第二列思高本），用来找未覆盖的人名地名
//   --dict  Rime 词库（每行「词\t编码」），用来找字幕里出现、但词表未收的词
//   --term  打印某个词条的全部上下文
const fs = require('fs');
const path = require('path');
const { createConverter } = require('../lib/converter');
const terms = require('../data/terms.json');

const args = process.argv.slice(2);
const opt = (name, multi) => {
  const vals = [];
  args.forEach((a, i) => { if (a === name && args[i + 1]) vals.push(args[i + 1]); });
  return multi ? vals : vals[0];
};
const lang = opt('--lang') || 'zh-CN';

// ---- 读取语料：每行一句，记录出处 ----
const corpusDir = path.join(__dirname, '..', 'corpus');
const index = JSON.parse(fs.readFileSync(path.join(corpusDir, 'index.json'), 'utf8'));
const lines = [];   // { text, where }
for (const v of index) {
  const file = path.join(corpusDir, v.slug, v.id, `${lang}.vtt`);
  if (!fs.existsSync(file)) continue;
  const tag = v.season ? `S${v.season}E${v.episode}` : v.slug;
  for (const block of fs.readFileSync(file, 'utf8').replace(/\r/g, '').split(/\n{2,}/)) {
    const ls = block.split('\n');
    const i = ls.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    for (const l of ls.slice(i + 1)) {
      const t = l.replace(/<[^>]+>/g, '').trim();
      if (t) lines.push({ text: t, where: tag });
    }
  }
}
const text = lines.map(l => l.text).join('\n');
const files = new Set(lines.map(l => l.where)).size;
console.log(`# 语料：${lang}，${files} 个视频，${lines.length} 行，${text.length} 字\n`);

const p2c = createConverter(terms, 'p2c');
const count = (s, w) => { let n = 0, i = 0; while ((i = s.indexOf(w, i)) >= 0) { n++; i += w.length; } return n; };
// 词在语料中出现、且转换后的语料里仍然出现 → 未被转换
const converted = p2c(text);

// ---- 1. 词表命中统计 ----
console.log('## 词表命中（新教写法在语料中的次数）\n');
const hits = terms.terms
  .filter(t => t.p !== t.c && t.only !== 'c2p')
  .map(t => [t.p, t.c, count(text, t.p)])
  .filter(h => h[2] > 0)
  .sort((a, b) => b[2] - a[2]);
console.log(hits.map(([p, c, n]) => `${p}→${c} ${n}`).join('，'));
console.log(`\n共 ${hits.length} / ${terms.terms.length} 条有命中\n`);

// ---- 2. 对照表里出现、但未被转换的人名地名 ----
const mapFile = opt('--map');
if (mapFile) {
  const map = new Map();
  for (const l of fs.readFileSync(mapFile, 'utf8').split('\n').slice(1)) {
    const [p, c] = l.trim().split('\t');
    if (p && c && p !== c) (map.get(p) || map.set(p, new Set()).get(p)).add(c);
  }
  const missing = [];
  for (const [p, cs] of map) {
    const before = count(text, p);
    if (!before) continue;
    const after = count(converted, p);
    if (after) missing.push([p, [...cs].join('/'), before, after]);
  }
  missing.sort((a, b) => b[3] - a[3]);
  console.log(`## 对照表中出现在字幕里、仍未转换的译名（${missing.length} 个）\n`);
  console.log('| 和合本 | 思高本（对照表） | 出现 | 未转换 | 例句 |\n| --- | --- | --- | --- | --- |');
  for (const [p, c, b, a] of missing) {
    const ex = lines.find(l => l.text.includes(p));
    console.log(`| ${p} | ${c} | ${b} | ${a} | ${ex.where} ${ex.text} |`);
  }
  console.log();
}

// ---- 3. 词库中出现在字幕里、词表未收的词 ----
for (const dict of opt('--dict', true)) {
  const words = new Set();
  let body = false;
  for (const l of fs.readFileSync(dict, 'utf8').split('\n')) {
    if (l.trim() === '...') { body = true; continue; }
    if (!body || !l || l.startsWith('#')) continue;
    const w = l.split('\t')[0].trim();
    if (w.length >= 2) words.add(w);
  }
  const known = new Set(terms.terms.flatMap(t => [t.p, t.c]));
  const found = [...words]
    .filter(w => !known.has(w))
    .map(w => [w, count(text, w), count(converted, w)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  console.log(`## ${path.basename(dict)}：字幕中出现、词表未收（${found.length} 个，括号内为转换后仍出现的次数）\n`);
  console.log(found.map(([w, n, a]) => `${w} ${n}(${a})`).join('，') + '\n');
}

// ---- 4. 指定词条的上下文 ----
const term = opt('--term');
if (term) {
  const ctx = lines.filter(l => l.text.includes(term));
  console.log(`## 「${term}」上下文（${ctx.length} 行）\n`);
  for (const l of ctx) console.log(`${l.where}\t${l.text}\t→ ${p2c(l.text)}`);
}

// 把词表导出为按「传统 × 类别」分组的词语清单，供输入法词库等使用（每行一个词，# 开头为分组）
// 用法：node scripts/export-words.js [输出文件]   不给文件时写到标准输出
// 不导出：保护词、只在转换时用的拼接短语（如「教宗弗朗西斯」「斐理伯的凯撒勒雅」）
const fs = require('fs');
const terms = require('../data/terms.json').terms;

const GROUPS = [
  ['p', ['god', 'apostle', 'nt', 'ot', 'place', 'show', 'bible'], '和合本：人名地名'],
  ['c', ['god', 'apostle', 'nt', 'ot', 'place', 'show', 'bible'], '思高本：人名地名'],
  ['p', ['book'], '和合本：经书名'],
  ['c', ['book'], '思高本：经书名'],
  ['p', ['group', 'term', 'church'], '新教：教会术语'],
  ['c', ['group', 'term', 'church'], '天主教：教会术语'],
  ['p', ['pope'], '大陆通用译名：教宗、圣人与修会'],
  ['c', ['pope'], '天主教：教宗、圣人与修会'],
];

// 转换时为限定上下文而拼出来的短语，不是独立词语
const isPhrase = (t, w) =>
  /^(教宗|教皇)./.test(w) && t.cat === 'pope' && w !== '教宗' ||
  /教皇$/.test(w) ||
  /的圣|的凯撒勒雅/.test(w);

const seen = new Set();
const out = ['## 由 thechosen-dualsub 的 scripts/export-words.js 从 data/terms.json 导出'];
for (const [side, cats, title] of GROUPS) {
  const words = [];
  for (const t of terms) {
    if (!cats.includes(t.cat)) continue;
    const w = t[side];
    if (!w || [...w.replace(/·/g, '')].length < 2 || seen.has(w) || isPhrase(t, w)) continue;
    seen.add(w);
    words.push(w);
  }
  if (words.length) out.push('', `# ${title}`, ...words);
}

const text = out.join('\n') + '\n';
if (process.argv[2]) {
  fs.writeFileSync(process.argv[2], text);
  console.log(`导出 ${seen.size} 个词到 ${process.argv[2]}`);
} else {
  process.stdout.write(text);
}

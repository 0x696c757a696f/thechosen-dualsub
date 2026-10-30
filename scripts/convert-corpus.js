// 把本地字幕语料转换为天主教（思高本）用语
// 用法：node scripts/convert-corpus.js [--lang zh-CN] [--dir p2c]
// 输出：
//   converted/<季>/<SxxEyy 标题>.<lang>.sigao.vtt —— 转换后的字幕，只在本地（gitignore，字幕有版权）
//   docs/changes/<lang>.md                         —— 每集改动清单，只含词条与次数，不含台词，可以公开
const fs = require('fs');
const path = require('path');
const { createConverter } = require('../lib/converter');
const terms = require('../data/terms.json');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const lang = opt('--lang', 'zh-CN');
const dir = opt('--dir', 'p2c');

const root = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'corpus', 'index.json'), 'utf8'));
const convert = createConverter(terms, dir);

// 源词 → 目标词，用于改动清单
const [from, to] = dir === 'p2c' ? ['p', 'c'] : ['c', 'p'];
const target = new Map(terms.terms.filter(t => !t.only || t.only === dir).map(t => [t[from], t[to]]));

const pad = n => String(n).padStart(2, '0');
const safe = s => s.replace(/[\\/:*?"<>|]/g, '').trim();

const report = [];
let total = 0;
for (const v of index) {
  const src = path.join(root, 'corpus', v.slug, v.id, `${lang}.vtt`);
  if (!fs.existsSync(src)) continue;
  const vtt = fs.readFileSync(src, 'utf8');

  // 只转换台词行，时间轴、序号、WEBVTT 头保持原样；stats 记录每个词条的实际替换次数
  const stats = {};
  const out = vtt.split('\n').map(l =>
    /-->|^\s*\d+\s*$|^WEBVTT|^\s*$/.test(l) ? l : convert(l, stats)).join('\n');

  const name = v.season ? `S${pad(v.season)}E${pad(v.episode)} ${safe(v.title.replace(/^Season \d+ Episode \d+:\s*/, ''))}` : safe(v.title);
  const outDir = path.join(root, 'converted', v.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}.${lang}.sigao.vtt`), out);

  const counts = Object.entries(stats).map(([k, n]) => [k, target.get(k), n]).sort((a, b) => b[2] - a[2]);
  const n = counts.reduce((s, c) => s + c[2], 0);
  total += n;
  report.push({ name, slug: v.slug, counts, n });
}

// 改动清单（不含台词）
const md = [
  `# 每集改动清单（${lang}，${dir === 'p2c' ? '和合本 → 思高本' : '思高本 → 和合本'}）`,
  '',
  '由 `node scripts/convert-corpus.js` 生成，只列出词条与替换次数，不含字幕原文。',
  '',
  `共 ${report.length} 个视频，约 ${total} 处替换。`,
  '',
];
for (const r of report) {
  md.push(`## ${r.name}`, '', r.counts.length
    ? r.counts.map(([a, b, n]) => `${a}→${b} ×${n}`).join('，')
    : '（无改动）', '');
}
fs.mkdirSync(path.join(root, 'docs', 'changes'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'changes', `${lang}.md`), md.join('\n'));
console.log(`转换 ${report.length} 个视频，约 ${total} 处替换`);
console.log(`字幕 → converted/（本地）  清单 → docs/changes/${lang}.md`);

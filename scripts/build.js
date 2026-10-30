// 构建油猴脚本：输出 dist/ 下三个文件
//   thechosen-dualsub.user.js —— 脚本本身，不含词条；用 @require / @resource 引用下面两个文件
//   converter.js              —— 转换器（lib/converter.js）
//   terms.json                —— 精简词表（只保留转换用到的字段）
// 用法：node scripts/build.js
// 环境变量 BUILD_NUMBER（CI 的运行编号）会附加到版本号末尾，让脚本管理器检测到更新
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const BASE = pkg.config.distBase;
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

const terms = JSON.parse(read('data/terms.json'));
const slim = JSON.stringify({
  terms: terms.terms.map(({ p, c, only, notPrev, notNext }) =>
    Object.fromEntries(Object.entries({ p, c, only, notPrev, notNext }).filter(([, v]) => v !== undefined))),
});
const converter = read('lib/converter.js');

const version = process.env.BUILD_NUMBER ? `${pkg.version}.${process.env.BUILD_NUMBER}` : pkg.version;
const script = read('src/userscript.js')
  .replaceAll('@@VERSION@@', version)
  .replaceAll('@@BASE@@', BASE)
  .replaceAll('@@HASH_CONVERTER@@', hash(converter))
  .replaceAll('@@HASH_TERMS@@', hash(slim));
const left = script.match(/@@[A-Z_]+@@/);
if (left) throw new Error(`src/userscript.js 里有未替换的占位符 ${left[0]}`);

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = { 'thechosen-dualsub.user.js': script, 'converter.js': converter, 'terms.json': slim };
for (const [name, content] of Object.entries(out)) fs.writeFileSync(path.join(dist, name), content);
console.log(`built dist/ v${version}: ` + Object.entries(out)
  .map(([n, c]) => `${n} ${(Buffer.byteLength(c) / 1024).toFixed(1)} KB`).join(', ') + `（${terms.terms.length} 条）`);

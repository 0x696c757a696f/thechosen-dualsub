// 构建可安装的油猴脚本：把词表和转换器注入 src/userscript.js → dist/thechosen-dualsub.user.js
// 用法：node scripts/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const terms = JSON.parse(read('data/terms.json'));
// 脚本里只需要转换用到的字段
const slim = {
  terms: terms.terms.map(({ p, c, only, notPrev, notNext }) =>
    Object.fromEntries(Object.entries({ p, c, only, notPrev, notNext }).filter(([, v]) => v !== undefined))),
};

let src = read('src/userscript.js');
const inject = (token, value) => {
  if (!src.includes(token)) throw new Error(`src/userscript.js 缺少占位符 ${token}`);
  src = src.replace(token, () => value);
};
inject('/* @@TERMS@@ */ { terms: [] }', JSON.stringify(slim));
inject('/* @@CONVERTER@@ */', read('lib/converter.js'));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/thechosen-dualsub.user.js');
fs.writeFileSync(out, src);
console.log(`built ${path.relative(root, out)} (${(src.length / 1024).toFixed(1)} KB, ${slim.terms.length} terms)`);

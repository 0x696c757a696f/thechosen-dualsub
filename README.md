# thechosen-dualsub

两部分：

1. **The Chosen 双字幕油猴脚本**：在 [watch.thechosen.tv](https://watch.thechosen.tv/) 上同时显示两种语言的字幕，中文字幕可自动转换为天主教（思高本）用语。
2. **新教 ↔ 天主教术语对照与转换**：和合本 ↔ 思高本的人名、地名、术语对照表（`data/terms.json`）和不依赖浏览器的双向转换器（`lib/converter.js`）。

## 安装脚本

支持 Tampermonkey、Violentmonkey、FireMonkey（Firefox）。

安装 [`dist/thechosen-dualsub.user.js`](dist/thechosen-dualsub.user.js)。Tampermonkey 首次运行时会询问能否访问 `cdn.thechosen.media` 和 `api.watch.thechosen.tv`，选「总是允许」。

打开任意一集，鼠标移到播放器上，右上角点「双字幕」打开设置：

- 第一 / 第二字幕：语言（每集约 175 种）、字号、文字颜色、背景颜色与透明度、描边、粗体、时间偏移
- 布局：底部距离、行间距、上下顺序、字体
- 中文用词：转换为天主教（思高本）或保留官方和合本用语；可添加自定义词条（每行 `原词=新词`，优先于内置表）

## 术语对照表

`data/terms.json` 每条记录一个词在两种传统中的写法：

```json
{ "p": "彼得", "c": "伯多禄", "cat": "apostle" }
{ "p": "雅各", "c": "雅各伯", "cat": "apostle", "notNext": "伯" }
{ "p": "撒旦", "c": "撒殚", "cat": "god", "only": "p2c" }
```

| 字段 | 含义 |
| --- | --- |
| `p` / `c` | 新教（和合本）/ 天主教（思高本）写法 |
| `cat` | 分类，见文件里的 `categories` |
| `notPrev` / `notNext` | 新教 → 天主教方向的上下文条件：前一个字 / 后一个字在这串字符里时不转换 |
| `only` | 只在一个方向生效（`p2c` 或 `c2p`），用于多对一 |

`p` 与 `c` 相同的条目是保护词，防止剧中专名被更短的词条误改（如「以利亚夫」不应变成「厄里亚夫」）。

## 转换器

```js
const { createConverter } = require('./lib/converter');
const terms = require('./data/terms.json');

createConverter(terms, 'p2c')('西门彼得对约翰说');   // 西满伯多禄对若望说
createConverter(terms, 'c2p')('天主的默西亚');       // 上帝的弥赛亚
createConverter(terms, 'p2c', { 彼得: '伯铎' });      // 自定义词条优先
```

算法：前缀树 + 从左到右扫描，同一位置取满足上下文条件的最长词条。16 集字幕（约 1.46 万行）转换约 35ms。

## 开发

```bash
npm test         # 运行 tests/cases.json 里的用例
npm run build    # 生成 dist/thechosen-dualsub.user.js
```

`src/userscript.js` 是脚本源码，构建时注入词表和转换器。不要直接改 `dist/`。

字幕语料只保存在本地（字幕有版权，`corpus/` 已 gitignore）：

```bash
node scripts/fetch-corpus.js                 # 下载全部字幕到 corpus/，默认 zh-CN,zh-TW,yue-hk,en
node scripts/analyze-corpus.js --term 约拿    # 检查词表覆盖，或查看某个词的上下文
node scripts/convert-corpus.js               # 生成思高本用语的字幕到 converted/（本地），并更新每集改动清单
```

转换后的字幕仍是官方字幕的演绎作品，同样只保存在本地。仓库里公开的是 [每集改动清单](docs/changes/zh-CN.md)：只列词条和替换次数，不含台词。

研究结论见 [docs/research.md](docs/research.md)。

推送到 `main` 后，GitHub Actions 会运行测试、构建，并把更新后的 `dist/` 提交回仓库。

## 数据来源

`data/terms.json` 约 2700 条，分两部分：

- **人工审核**（约 270 条）：神名、宗徒、术语、经书名，以及剧中字幕实际出现的人名地名，逐条在全部字幕语料上检查过上下文。
- **导入**（`"src": "cuv-sigao"`，约 2280 条）：圣经人名地名，来自 wangpei 的 [baibanbao/cuv-with-sigao-names](https://github.com/baibanbao/cuv-with-sigao-names) 的 `译名对照.tsv`，感谢原作者的整理。由 `scripts/import-names.js` 导入：
  - 单字、常用普通词（按 [jieba](https://github.com/fxsjy/jieba) 词典判断，如「荷兰」「以来」）不收；
  - 一名多译时取替换次数最多的写法；
  - 会被误改的常用词自动加为保护词（`"src": "common-word"`，如「巴勒斯坦」「西门子」「全神贯注」）。

```bash
node scripts/import-names.js 译名对照.tsv --wordlist jieba/dict.txt   # 重新导入（结果可重复）
```

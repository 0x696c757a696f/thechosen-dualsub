// 新教（和合本）↔ 天主教（思高本）术语转换器
// 用法：
//   const convert = createConverter(termsData, 'p2c', { 彼得: '伯铎' });
//   convert('西门彼得对约翰说')  // → '西满伯多禄对若望说'
// direction：'p2c' 新教→天主教，'c2p' 天主教→新教
// custom：可选的自定义词条 { 原词: 新词 }，优先于内置表
//
// 算法：前缀树 + 从左到右扫描；同一位置取满足上下文条件（notPrev / notNext）的最长词条，
// 不满足则退回更短的词条，都没有就原样输出当前字符。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChristianTermConverter = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  function buildRules(data, direction, custom) {
    const [from, to] = direction === 'c2p' ? ['c', 'p'] : ['p', 'c'];
    const rules = new Map();   // 源词 → 规则，后者覆盖前者
    for (const t of data.terms || data) {
      if (t.only && t.only !== direction) continue;
      if (!t[from]) continue;
      // 上下文条件是针对新教写法定义的，只在 p2c 方向生效
      const ctx = direction === 'p2c';
      rules.set(t[from], {
        key: t[from],
        out: t[to],
        notPrev: ctx && t.notPrev ? new Set(t.notPrev) : null,
        notNext: ctx && t.notNext ? new Set(t.notNext) : null,
      });
    }
    for (const [k, v] of Object.entries(custom || {})) {
      if (k) rules.set(k, { key: k, out: v, notPrev: null, notNext: null });
    }
    return rules;
  }

  function createConverter(data, direction = 'p2c', custom = {}) {
    const rules = buildRules(data, direction, custom);
    if (!rules.size) return s => s;

    // 前缀树：每个节点 { next: Map<char, node>, rule }
    const root = { next: new Map(), rule: null };
    for (const [key, rule] of rules) {
      let node = root;
      for (const ch of key) {
        let n = node.next.get(ch);
        if (!n) node.next.set(ch, n = { next: new Map(), rule: null });
        node = n;
      }
      node.rule = rule;
    }

    // stats：可选，传入对象时按源词累计实际替换次数 { 源词: 次数 }
    return (text, stats) => {
      const chars = Array.from(text);
      const n = chars.length;
      let out = '';
      let i = 0;
      while (i < n) {
        // 收集从 i 开始的所有候选（短到长）
        const cands = [];
        let node = root;
        for (let j = i; j < n; j++) {
          node = node.next.get(chars[j]);
          if (!node) break;
          if (node.rule) cands.push([j + 1, node.rule]);
        }
        let hit = null;
        for (let k = cands.length - 1; k >= 0; k--) {
          const [end, r] = cands[k];
          if (r.notPrev && i > 0 && r.notPrev.has(chars[i - 1])) continue;
          if (r.notNext && end < n && r.notNext.has(chars[end])) continue;
          hit = cands[k];
          break;
        }
        if (hit) {
          const r = hit[1];
          out += r.out;
          // 保护词（原样输出）不计入替换次数
          if (stats && r.out !== r.key) stats[r.key] = (stats[r.key] || 0) + 1;
          i = hit[0];
        } else {
          out += chars[i++];
        }
      }
      return out;
    };
  }

  // 解析自定义词条：每行「原词=新词」，# 开头为注释
  function parseCustom(text) {
    const out = {};
    for (const line of String(text || '').split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('=');
      if (i > 0) out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
    }
    return out;
  }

  return { createConverter, parseCustom };
});

// ==UserScript==
// @name         The Chosen 双字幕 (Dual Subtitles)
// @namespace    thechosen-dualsub
// @version      1.3.0
// @description  在 watch.thechosen.tv 上同时显示两种语言的字幕，可分别调节语言、大小、颜色、背景、偏移等；中文字幕可转换为天主教（思高本）用语
// @match        https://watch.thechosen.tv/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      cdn.thechosen.media
// @connect      api.watch.thechosen.tv
// ==/UserScript==

(() => {
  'use strict';

  // ---------- 设置 ----------
  const STORE_KEY = 'dualsub-settings-v2';
  const defaultTrack = (lang, color) => ({
    lang, color, size: 100, bgColor: '#000000', bgOpacity: 55,
    outline: 2, bold: false, offset: 0,
  });
  const defaults = {
    enabled: true,
    hideNative: true,
    position: 11,          // 距底部 %
    gap: 4,                // 两行间距 px
    order: 'primary-top',  // primary-top | secondary-top
    font: 'system-ui, "Microsoft YaHei", "PingFang SC", sans-serif',
    tracks: [defaultTrack('zh-CN', '#ffd85a'), defaultTrack('en', '#ffffff')],
    convert: 'p2c',        // 中文字幕用语：p2c 转为天主教（思高本）| off 不转换
    custom: '',            // 自定义词条，每行「原词=新词」
  };
  const settings = load();

  // ---------- 术语转换（构建时由 scripts/build.js 注入词表与转换器） ----------
  const TERMS = {"terms":[{"p":"上帝","c":"天主"},{"p":"神","c":"天主","only":"p2c","notPrev":"精眼心出留失走传女天死财灶门山海鬼众诸邪凶战福河花风雷爱酒假外封费无多别劳伤凝提安养","notNext":"职迹奇情经秘话仙明庙像态色采气父圣学童速通灵魂志智往化效器射枪算韵游伤殿祇祗们"},{"p":"神的儿子","c":"天主子"},{"p":"神之子","c":"天主子","only":"p2c"},{"p":"耶和华","c":"上主"},{"p":"圣灵","c":"圣神"},{"p":"弥赛亚","c":"默西亚"},{"p":"以马内利","c":"厄玛奴耳"},{"p":"拉比","c":"辣彼"},{"p":"和散那","c":"贺三纳"},{"p":"哈利路亚","c":"阿肋路亚"},{"p":"撒但","c":"撒殚"},{"p":"撒旦","c":"撒殚","only":"p2c"},{"p":"别西卜","c":"贝耳则步"},{"p":"米迦勒","c":"弥额尔"},{"p":"加百列","c":"加俾额尔"},{"p":"西门彼得","c":"西满伯多禄"},{"p":"彼得","c":"伯多禄"},{"p":"西门","c":"西满"},{"p":"安得烈","c":"安德肋"},{"p":"西庇太","c":"载伯德"},{"p":"雅各","c":"雅各伯","notNext":"伯"},{"p":"施洗约翰","c":"洗者若翰"},{"p":"施洗者约翰","c":"洗者若翰","only":"p2c"},{"p":"约翰","c":"若望"},{"p":"腓力","c":"斐理伯"},{"p":"拿但业","c":"纳塔乃耳"},{"p":"巴多罗买","c":"巴尔多禄茂"},{"p":"马太","c":"玛窦"},{"p":"利未","c":"肋未"},{"p":"亚勒腓","c":"阿耳斐"},{"p":"多马","c":"多默"},{"p":"达太","c":"达陡"},{"p":"奋锐党","c":"热诚党"},{"p":"加略人犹大","c":"依斯加略犹达斯"},{"p":"加略人","c":"依斯加略人"},{"p":"犹大","c":"犹达斯","notNext":"地支省国王族家山"},{"p":"使徒","c":"宗徒"},{"p":"抹大拉的马利亚","c":"玛利亚玛达肋纳"},{"p":"马利亚","c":"玛利亚"},{"p":"抹大拉","c":"玛达拉"},{"p":"马大","c":"玛尔大","notPrev":"罗","notNext":"军帝人"},{"p":"拉撒路","c":"拉匝禄"},{"p":"约瑟","c":"若瑟"},{"p":"尼哥底母","c":"尼苛德摩"},{"p":"撒该","c":"匝凯"},{"p":"以利沙伯","c":"依撒伯尔"},{"p":"撒迦利亚","c":"匝加利亚"},{"p":"希律","c":"黑落德"},{"p":"希律党","c":"黑落德党"},{"p":"彼拉多","c":"比拉多"},{"p":"该亚法","c":"盖法"},{"p":"亚那","c":"亚纳斯"},{"p":"亚拿","c":"亚纳","notNext":"尼突"},{"p":"亚拿突","c":"阿纳托特"},{"p":"巴拉巴","c":"巴辣巴"},{"p":"马可","c":"马尔谷"},{"p":"保罗","c":"保禄"},{"p":"司提反","c":"斯德望"},{"p":"亚利马太","c":"阿黎玛特雅"},{"p":"西缅","c":"西默盎"},{"p":"亚拿尼亚","c":"阿纳尼雅"},{"p":"革流巴","c":"克罗帕"},{"p":"撒罗米","c":"撒罗默"},{"p":"约亚拿","c":"约安纳"},{"p":"苏撒拿","c":"苏撒纳"},{"p":"巴底买","c":"巴尔提买"},{"p":"睚鲁","c":"雅依洛"},{"p":"亚伯拉罕","c":"亚巴郎"},{"p":"以撒","c":"依撒格"},{"p":"以扫","c":"厄撒乌"},{"p":"摩西","c":"梅瑟"},{"p":"亚伦","c":"亚郎"},{"p":"约书亚","c":"若苏厄"},{"p":"以赛亚","c":"依撒意亚"},{"p":"以利亚","c":"厄里亚"},{"p":"以利沙","c":"厄里叟"},{"p":"耶利米","c":"耶肋米亚"},{"p":"以西结","c":"厄则克耳"},{"p":"但以理","c":"达尼尔"},{"p":"何西阿","c":"欧瑟亚"},{"p":"约珥","c":"岳厄尔"},{"p":"阿摩司","c":"亚毛斯"},{"p":"约拿","c":"约纳"},{"p":"弥迦","c":"米该亚"},{"p":"玛拉基","c":"玛拉基亚"},{"p":"大卫","c":"达味"},{"p":"所罗门","c":"撒罗满"},{"p":"撒母耳","c":"撒慕尔"},{"p":"扫罗","c":"撒乌耳"},{"p":"挪亚","c":"诺厄"},{"p":"夏娃","c":"厄娃"},{"p":"亚伯","c":"亚伯尔","notNext":"拉"},{"p":"该隐","c":"加音"},{"p":"撒拉","c":"撒辣","notNext":"弗"},{"p":"利百加","c":"黎贝加"},{"p":"拉结","c":"辣黑耳"},{"p":"便雅悯","c":"本雅明"},{"p":"以法莲","c":"厄弗辣因"},{"p":"玛拿西","c":"默纳舍"},{"p":"耶西","c":"叶瑟"},{"p":"约西亚","c":"约史雅"},{"p":"约沙法","c":"约沙法特"},{"p":"押尼珥","c":"阿贝乃尔"},{"p":"底拿","c":"狄纳"},{"p":"他玛","c":"塔玛尔"},{"p":"迦勒","c":"加肋布"},{"p":"路得","c":"卢德"},{"p":"以斯帖","c":"艾斯德尔"},{"p":"以斯拉","c":"厄斯德拉"},{"p":"尼希米","c":"乃赫米雅"},{"p":"基甸","c":"基德红"},{"p":"参孙","c":"三松"},{"p":"底波拉","c":"德波辣"},{"p":"拿俄米","c":"纳敖米"},{"p":"米利暗","c":"米黎盎"},{"p":"法老","c":"法郎"},{"p":"该犹","c":"加约"},{"p":"以利亚夫","c":"以利亚夫"},{"p":"别的神","c":"别的神","only":"p2c"},{"p":"其他的神","c":"其他的神","only":"p2c"},{"p":"加利利","c":"加里肋亚"},{"p":"迦百农","c":"葛法翁"},{"p":"拿撒勒","c":"纳匝肋"},{"p":"伯利恒","c":"白冷"},{"p":"撒玛利亚","c":"撒玛黎雅"},{"p":"伯大尼","c":"伯达尼"},{"p":"伯赛大","c":"贝特赛达"},{"p":"迦拿","c":"加纳"},{"p":"约旦","c":"约但"},{"p":"耶利哥","c":"耶里哥"},{"p":"推罗","c":"提洛"},{"p":"西顿","c":"漆冬"},{"p":"低加波利","c":"十城区"},{"p":"叙加","c":"息哈尔"},{"p":"基利心","c":"革黎斤"},{"p":"锡安","c":"熙雍"},{"p":"所多玛","c":"索多玛"},{"p":"蛾摩拉","c":"哈摩辣"},{"p":"示剑","c":"舍根"},{"p":"西奈","c":"西乃"},{"p":"以东","c":"厄东"},{"p":"伯特利","c":"贝特耳"},{"p":"迦密","c":"加尔默耳"},{"p":"客西马尼","c":"革责玛尼"},{"p":"各各他","c":"哥耳哥达"},{"p":"哥拉汛","c":"苛辣匝因"},{"p":"以马忤斯","c":"厄玛乌"},{"p":"亚兰","c":"阿兰"},{"p":"拉玛","c":"辣玛"},{"p":"西布伦","c":"则步隆"},{"p":"拿弗他利","c":"纳斐塔里"},{"p":"大马色","c":"大马士革"},{"p":"埃塞俄比亚","c":"厄提约丕雅"},{"p":"法利赛","c":"法利塞"},{"p":"撒都该","c":"撒杜塞"},{"p":"文士","c":"经师"},{"p":"祭司","c":"司祭"},{"p":"公会","c":"公议会"},{"p":"拿细耳人","c":"纳齐尔人"},{"p":"住棚节","c":"帐棚节"},{"p":"主祷文","c":"天主经"},{"p":"律法书","c":"法律书"},{"p":"摩西律法","c":"梅瑟法律"},{"p":"麻风","c":"癞病"},{"p":"麻疯","c":"癞病","only":"p2c"},{"p":"创世记","c":"创世纪"},{"p":"出埃及记","c":"出谷纪"},{"p":"利未记","c":"肋未纪"},{"p":"民数记","c":"户籍纪"},{"p":"申命记","c":"申命纪"},{"p":"诗篇","c":"圣咏"},{"p":"传道书","c":"训道篇"}]};
  const { createConverter, parseCustom } = (() => {
    const module = { exports: {} };
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
        out: t[to],
        notPrev: ctx && t.notPrev ? new Set(t.notPrev) : null,
        notNext: ctx && t.notNext ? new Set(t.notNext) : null,
      });
    }
    for (const [k, v] of Object.entries(custom || {})) {
      if (k) rules.set(k, { out: v, notPrev: null, notNext: null });
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

    return text => {
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
          out += hit[1].out;
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

    return module.exports;
  })();

  let converter = null, converterKey = null;
  function getConverter() {
    const key = settings.convert + '\u0000' + settings.custom;
    if (key !== converterKey) {
      converterKey = key;
      converter = settings.convert === 'off' ? null
        : createConverter(TERMS, settings.convert, parseCustom(settings.custom));
    }
    return converter;
  }

  // 只转换中文字幕（目前词表为简体）
  function convertCues(list, lang) {
    const conv = /^zh/i.test(lang) && getConverter();
    return conv ? list.map(c => ({ ...c, text: conv(c.text) })) : list;
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s) {
        return {
          ...defaults, ...s,
          tracks: defaults.tracks.map((d, i) => ({ ...d, ...(s.tracks || [])[i] })),
        };
      }
    } catch {}
    return JSON.parse(JSON.stringify(defaults));
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
    }, 300);
  }

  // ---------- 网络请求 ----------
  // 优先用脚本管理器的跨域请求（Tampermonkey / Violentmonkey: GM_xmlhttpRequest；
  // FireMonkey / Greasemonkey 4: GM.xmlHttpRequest），都没有时退回 fetch
  // 注意要绑定 this：FireMonkey 的 GM.xmlHttpRequest 是依赖 this 的静态方法，且只返回 Promise
  const gmXhr = (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' && GM.xmlHttpRequest.bind(GM))
    || (typeof GM_xmlhttpRequest === 'function' && GM_xmlhttpRequest)
    || null;

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      const done = r => {
        if (!r || typeof r.responseText !== 'string') return;
        r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`));
      };
      const ret = gmXhr({
        method: 'GET', url, timeout: 15000,
        onload: done,
        onerror: e => reject(new Error((e && (e.error || e.statusText)) || '网络错误')),
        ontimeout: () => reject(new Error('超时')),
      });
      // FireMonkey 等实现可能返回 Promise
      if (ret && typeof ret.then === 'function') ret.then(done, reject);
    });
  }

  const fetchText = f => url => f(url, { credentials: 'omit' }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  // Firefox 扩展沙箱里，页面自己的 fetch 带页面 Origin，可以正常通过 CORS
  function pageFetch() {
    try {
      if (typeof content === 'object' && content && typeof content.fetch === 'function') return content.fetch.bind(content);
    } catch {}
    try {
      const w = window.wrappedJSObject || (typeof unsafeWindow !== 'undefined' && unsafeWindow);
      if (w && w !== window && typeof w.fetch === 'function') return w.fetch.bind(w);
    } catch {}
    return null;
  }

  const transports = [
    gmXhr && ['GM', gmGet],
    typeof fetch === 'function' && ['fetch', fetchText(fetch)],
    pageFetch() && ['page', fetchText(pageFetch())],
  ].filter(Boolean);
  let preferred = 0;

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), ms))]);
  }

  // 依次尝试各种请求方式，记住第一个成功的
  async function getText(url) {
    const errors = [];
    const order = transports.map((_, i) => (i + preferred) % transports.length);
    for (const i of order) {
      const [name, get] = transports[i];
      try {
        const text = await withTimeout(get(url), 15000);
        preferred = i;
        return text;
      } catch (e) {
        errors.push(`${name}: ${(e && e.message) || e}`);
      }
    }
    throw new Error(errors.join('；') || '没有可用的请求方式');
  }

  // ---------- 获取 master.m3u8 并解析字幕列表 ----------
  let masterUrl = null;
  let available = [];         // [{name, lang, uri}]
  let status = '等待视频加载…';
  const cueCache = new Map(); // lang -> Promise<cues>
  const cues = [[], []];      // 两条字幕的 cue 列表

  const isMaster = name => /\/master\.m3u8(\?|$)/.test(name);
  function setMaster(url) {
    if (!url || url === masterUrl) return;
    masterUrl = url;
    loadMaster(url);
  }

  // 方式一：监听页面资源请求
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (isMaster(e.name)) setMaster(e.name);
    }).observe({ type: 'resource', buffered: true });
  } catch (e) {
    console.warn('[dualsub] PerformanceObserver 不可用', e);
  }

  // 方式二：根据地址栏里的视频 ID 查询站点 API（URL 变化时触发，兼容站内跳转）
  let lastPath = null, pathBusy = false, retryAt = 0;
  async function checkPath() {
    const path = location.pathname;
    if (pathBusy || (path === lastPath && Date.now() < retryAt)) return;
    if (path === lastPath && !retryAt) return;
    lastPath = path;
    retryAt = 0;
    const m = path.match(/\/video\/([^/?#]+)/);
    if (!m) return;
    pathBusy = true;
    try {
      const j = JSON.parse(await getText('https://api.watch.thechosen.tv/v1/videos/' + m[1]));
      const d = j.data || j;
      const url = (d.details?.video || []).map(v => v.url).find(Boolean);
      if (location.pathname !== path) return;
      if (url) setMaster(url);
      else if (!masterUrl) setStatus('接口没有返回视频地址');
    } catch (e) {
      console.warn('[dualsub] API 查询失败', e);
      if (!masterUrl) setStatus(`视频信息查询失败（10 秒后重试）：${e.message}`);
      retryAt = Date.now() + 10000;
    } finally {
      pathBusy = false;
    }
  }

  function setStatus(s) {
    status = s;
    const el = panel && panel.querySelector('.ds-status');
    if (el) el.textContent = s;
  }

  async function loadMaster(url) {
    cueCache.clear();
    available = [];
    cues[0] = cues[1] = [];
    setStatus('正在读取字幕列表…');
    renderPanel();
    let err = null;
    try {
      const text = await getText(url);
      available = text.split('\n')
        .filter(l => l.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/.test(l))
        .map(l => ({ name: attr(l, 'NAME'), lang: attr(l, 'LANGUAGE'), uri: attr(l, 'URI') }))
        .filter(t => t.uri)
        .map(t => ({ ...t, uri: new URL(t.uri, url).href }));
    } catch (e) {
      err = e;
      console.warn('[dualsub] master 读取失败', e);
    }
    if (url !== masterUrl) return;
    if (err) {
      setStatus(`字幕列表读取失败：${err.message}（5 秒后重试）`);
      setTimeout(() => { if (masterUrl === url) { masterUrl = null; setMaster(url); } }, 5000);
    } else {
      setStatus(available.length ? `共 ${available.length} 种字幕语言` : '这个视频没有字幕');
    }
    renderPanel();
    [0, 1].forEach(loadTrack);
  }

  function attr(line, key) {
    const m = line.match(new RegExp(key + '="([^"]*)"'));
    return m ? m[1] : '';
  }

  async function loadTrack(i) {
    const url = masterUrl;
    const lang = settings.tracks[i].lang;
    let p = Promise.resolve([]);
    if (lang) {
      if (!cueCache.has(lang)) {
        const t = available.find(t => t.lang === lang);
        cueCache.set(lang, t ? fetchTrack(t.uri) : Promise.resolve([]));
      }
      p = cueCache.get(lang);
    }
    const list = await p;
    if (url !== masterUrl || settings.tracks[i].lang !== lang) return;
    cues[i] = convertCues(list, lang);
    invalidate();
  }

  async function fetchTrack(playlistUrl) {
    try {
      const pl = await getText(playlistUrl);
      const segs = pl.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      const texts = await Promise.all(segs.map(s => getText(new URL(s, playlistUrl).href)));
      return texts.flatMap(parseVtt).sort((a, b) => a.start - b.start);
    } catch (e) {
      console.warn('[dualsub] 字幕下载失败', playlistUrl, e);
      setStatus(`字幕下载失败：${e.message}`);
      return [];
    }
  }

  function parseTime(t) {
    const p = t.trim().replace(',', '.').split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }

  const entityMap = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', '#39': "'" };
  function parseVtt(text) {
    const out = [];
    for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
      const lines = block.split('\n');
      const i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const [a, b] = lines[i].split('-->');
      const body = lines.slice(i + 1).join('\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(amp|lt|gt|nbsp|quot|#39);/g, (_, k) => entityMap[k])
        .trim();
      if (body) out.push({ start: parseTime(a), end: parseTime(b.trim().split(/\s+/)[0]), text: body });
    }
    return out;
  }

  // 二分查找：返回 t 时刻显示的文本（处理少量重叠 cue）
  function findCue(list, t) {
    let lo = 0, hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].start <= t) lo = mid + 1; else hi = mid - 1;
    }
    let text = '';
    for (let i = hi; i >= 0 && i > hi - 4; i--) {
      if (list[i].end > t) text = text ? list[i].text + '\n' + text : list[i].text;
    }
    return text;
  }

  // ---------- 界面 ----------
  const css = `
    #dualsub-overlay { position:absolute; left:0; right:0; z-index:5; pointer-events:none;
      display:flex; flex-direction:column; align-items:center; padding:0 5%; text-align:center; }
    #dualsub-overlay.ds-off { display:none; }
    #dualsub-overlay span { display:inline-block; white-space:pre-line; line-height:1.3;
      padding:.1em .45em; border-radius:.2em; }
    #dualsub-overlay span:empty { display:none; }
    #dualsub-btn { position:absolute; top:12px; right:12px; z-index:20; cursor:pointer;
      background:rgba(0,0,0,.55); color:#fff; border:1px solid rgba(255,255,255,.35); border-radius:6px;
      font:600 12px system-ui, sans-serif; padding:4px 8px; opacity:.35; transition:opacity .2s; }
    .bitmovinplayer-container:hover #dualsub-btn, #dualsub-btn:focus-visible { opacity:1; }
    #dualsub-panel { position:absolute; top:44px; right:12px; z-index:21; width:300px;
      max-height:calc(100% - 60px); overflow:auto; display:none;
      background:rgba(20,20,20,.96); color:#eee; border:1px solid #444; border-radius:8px; padding:10px 12px;
      font:13px system-ui, "Microsoft YaHei", sans-serif; }
    #dualsub-panel.open { display:block; }
    #dualsub-panel fieldset { border:1px solid #444; border-radius:6px; margin:0 0 10px; padding:6px 10px 2px; }
    #dualsub-panel legend { padding:0 4px; font-weight:600; }
    #dualsub-panel .r { display:grid; grid-template-columns:72px 1fr 44px; align-items:center; gap:6px; margin:0 0 7px; }
    #dualsub-panel .r > :nth-child(2):last-child { grid-column: 2 / 4; }
    #dualsub-panel select, #dualsub-panel input[type=text], #dualsub-panel textarea { width:100%; background:#222; color:#eee;
      border:1px solid #555; border-radius:4px; padding:3px; box-sizing:border-box; }
    #dualsub-panel textarea { height:70px; resize:vertical; font:12px/1.4 ui-monospace, Consolas, monospace; margin:0 0 7px; }
    #dualsub-panel .hint { color:#999; font-size:11px; margin:0 0 4px; }
    #dualsub-panel input[type=range] { width:100%; }
    #dualsub-panel input[type=color] { width:100%; height:24px; padding:0; border:1px solid #555; background:none; }
    #dualsub-panel output { font-variant-numeric:tabular-nums; text-align:right; color:#aaa; }
    #dualsub-panel .ds-status { margin:0 0 8px; padding:4px 6px; border-radius:4px; background:#2a2a2a; color:#9cd; font-size:12px; }
    #dualsub-panel .btns { display:flex; gap:8px; justify-content:flex-end; }
    #dualsub-panel button { background:#333; color:#eee; border:1px solid #555; border-radius:4px; padding:3px 10px; cursor:pointer; }
    .dualsub-hide-native .bmpui-ui-subtitle-overlay { display:none !important; }
  `;

  let container = null, video = null, overlay = null, spans = [], btn = null, panel = null;
  let lastText = [null, null];
  let rafId = 0;

  function mount() {
    const c = document.querySelector('.bitmovinplayer-container');
    if (c && c === container && container.contains(overlay)) return;
    if (!c) return;
    container = c;
    video = c.querySelector('video');

    if (!document.getElementById('dualsub-style')) {
      const s = document.createElement('style');
      s.id = 'dualsub-style';
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
    overlay = document.createElement('div');
    overlay.id = 'dualsub-overlay';
    spans = [document.createElement('span'), document.createElement('span')];
    overlay.append(...spans);

    btn = document.createElement('button');
    btn.id = 'dualsub-btn';
    btn.type = 'button';
    btn.textContent = '双字幕';
    panel = document.createElement('div');
    panel.id = 'dualsub-panel';
    // 阻止事件穿透到播放器（避免触发暂停、快捷键）
    for (const el of [btn, panel]) {
      for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'wheel']) {
        el.addEventListener(ev, e => e.stopPropagation());
      }
    }
    btn.addEventListener('click', () => panel.classList.toggle('open'));
    container.append(overlay, btn, panel);

    // 播放时用 rAF 精确同步；暂停/拖动时只在事件触发时更新一次
    for (const ev of ['play', 'playing']) video.addEventListener(ev, startLoop);
    for (const ev of ['pause', 'ended', 'emptied']) video.addEventListener(ev, stopLoop);
    for (const ev of ['seeked', 'timeupdate']) video.addEventListener(ev, () => { if (!rafId) update(); });
    new ResizeObserver(applyStyle).observe(container);

    renderPanel();
    applyStyle();
    invalidate();
    if (!video.paused) startLoop();
  }

  function startLoop() {
    if (rafId) return;
    const loop = () => { update(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    update();
  }

  // 只有文本变化时才写 DOM
  function update() {
    if (!video || !settings.enabled) return;
    const t = video.currentTime;
    for (let i = 0; i < 2; i++) {
      const text = findCue(cues[i], t - settings.tracks[i].offset);
      if (text !== lastText[i]) {
        lastText[i] = text;
        spans[i].textContent = text;
      }
    }
  }
  function invalidate() {
    lastText = [null, null];
    update();
  }

  function hexA(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${pct / 100})`;
  }

  function applyStyle() {
    if (!overlay) return;
    const base = Math.max(14, container.clientHeight * 0.042);
    overlay.classList.toggle('ds-off', !settings.enabled);
    overlay.style.bottom = settings.position + '%';
    overlay.style.gap = settings.gap + 'px';
    overlay.style.fontFamily = settings.font;
    overlay.style.flexDirection = settings.order === 'secondary-top' ? 'column-reverse' : 'column';
    settings.tracks.forEach((t, i) => {
      const s = spans[i].style;
      const o = t.outline;
      s.fontSize = (base * t.size / 100) + 'px';
      s.color = t.color;
      s.fontWeight = t.bold ? '700' : '400';
      s.background = hexA(t.bgColor, t.bgOpacity);
      s.textShadow = o ? `0 0 ${o}px #000, 0 0 ${o}px #000, 0 0 ${o}px #000` : 'none';
    });
    container.classList.toggle('dualsub-hide-native', !!settings.hideNative);
  }

  // ---------- 设置面板 ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function trackFields(i) {
    const t = settings.tracks[i];
    const opts = ['<option value="">— 关闭 —</option>'].concat(available.map(a =>
      `<option value="${esc(a.lang)}"${a.lang === t.lang ? ' selected' : ''}>${esc(a.name)} (${esc(a.lang)})</option>`));
    if (!available.length && t.lang) opts.push(`<option value="${esc(t.lang)}" selected>${esc(t.lang)}</option>`);
    const p = `t${i}.`;
    return `
      <fieldset><legend>${i === 0 ? '第一字幕' : '第二字幕'}</legend>
        <div class="r"><span>语言</span><select data-k="${p}lang">${opts.join('')}</select></div>
        ${range(p + 'size', '字号', t.size, 40, 250, 5, '%')}
        <div class="r"><span>文字颜色</span><input type="color" data-k="${p}color" value="${t.color}"><span></span></div>
        <div class="r"><span>背景颜色</span><input type="color" data-k="${p}bgColor" value="${t.bgColor}"><span></span></div>
        ${range(p + 'bgOpacity', '背景透明', t.bgOpacity, 0, 100, 5, '%')}
        ${range(p + 'outline', '描边', t.outline, 0, 8, 1, 'px')}
        ${range(p + 'offset', '时间偏移', t.offset, -5, 5, 0.1, 's')}
        <div class="r"><span>粗体</span><input type="checkbox" data-k="${p}bold"${t.bold ? ' checked' : ''}><span></span></div>
      </fieldset>`;
  }

  function range(k, label, v, min, max, step, unit) {
    return `<div class="r"><span>${label}</span>
      <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}">
      <output data-unit="${unit}">${v}${unit}</output></div>`;
  }

  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = `
      <div class="ds-status"></div>
      <div class="r"><span>启用</span><input type="checkbox" data-k="enabled"${settings.enabled ? ' checked' : ''}><span></span></div>
      <div class="r"><span>隐藏原字幕</span><input type="checkbox" data-k="hideNative"${settings.hideNative ? ' checked' : ''}><span></span></div>
      ${trackFields(0)}
      ${trackFields(1)}
      <fieldset><legend>布局</legend>
        ${range('position', '底部距离', settings.position, 0, 60, 1, '%')}
        ${range('gap', '行间距', settings.gap, 0, 40, 1, 'px')}
        <div class="r"><span>上下顺序</span><select data-k="order">
          <option value="primary-top"${settings.order === 'primary-top' ? ' selected' : ''}>第一字幕在上</option>
          <option value="secondary-top"${settings.order === 'secondary-top' ? ' selected' : ''}>第二字幕在上</option>
        </select></div>
        <div class="r"><span>字体</span><input type="text" data-k="font" value="${esc(settings.font)}"></div>
      </fieldset>
      <fieldset><legend>中文用词</legend>
        <div class="r"><span>转换</span><select data-k="convert">
          <option value="p2c"${settings.convert === 'p2c' ? ' selected' : ''}>天主教（思高本）</option>
          <option value="off"${settings.convert === 'off' ? ' selected' : ''}>不转换（官方和合本）</option>
        </select></div>
        <div class="hint">自定义词条，每行「原词=新词」，优先于内置表</div>
        <textarea data-k="custom" placeholder="例如：&#10;伯多禄=伯铎">${esc(settings.custom)}</textarea>
      </fieldset>
      <div class="btns"><button type="button" data-act="swap">交换两条</button><button type="button" data-act="reset">恢复默认</button></div>`;
    panel.querySelector('.ds-status').textContent = status;

    panel.querySelectorAll('[data-k]').forEach(el => el.addEventListener(
      el.type === 'text' || el.tagName === 'TEXTAREA' ? 'change' : 'input', () => onInput(el)));
    panel.querySelector('[data-act=swap]').onclick = () => {
      settings.tracks.reverse();
      cues.reverse();
      save(); renderPanel(); applyStyle(); invalidate();
    };
    panel.querySelector('[data-act=reset]').onclick = () => {
      Object.assign(settings, JSON.parse(JSON.stringify(defaults)));
      save(); renderPanel(); applyStyle(); [0, 1].forEach(loadTrack);
    };
  }

  function onInput(el) {
    const k = el.dataset.k;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
    const out = el.nextElementSibling;
    if (out && out.tagName === 'OUTPUT') out.textContent = v + out.dataset.unit;

    const m = k.match(/^t(\d)\.(.+)$/);
    if (m) {
      const i = +m[1];
      settings.tracks[i][m[2]] = v;
      if (m[2] === 'lang') loadTrack(i);
      else if (m[2] === 'offset') invalidate();
    } else {
      settings[k] = v;
      if (k === 'enabled') invalidate();
      else if (k === 'convert' || k === 'custom') [0, 1].forEach(loadTrack);
    }
    applyStyle();
    save();
  }

  // 方式三：兜底扫描已记录的资源（某些沙箱里 PerformanceObserver 收不到回调）
  function scanResources() {
    try {
      const hits = performance.getEntriesByType('resource').filter(e => isMaster(e.name));
      if (hits.length) setMaster(hits[hits.length - 1].name);
    } catch {}
  }

  // SPA 页面切换时播放器会被重建，低频检查即可
  function poll() {
    checkPath();
    if (!masterUrl) scanResources();
    mount();
  }
  setInterval(poll, 1000);
  document.addEventListener('DOMContentLoaded', poll);
})();

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
  const TERMS = /* @@TERMS@@ */ { terms: [] };
  const { createConverter, parseCustom } = (() => {
    const module = { exports: {} };
    /* @@CONVERTER@@ */
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

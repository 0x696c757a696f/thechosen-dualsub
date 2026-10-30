// 下载 watch.thechosen.tv 上全部视频的字幕到 corpus/（已 gitignore，字幕有版权，不进仓库）
// 用法：node scripts/fetch-corpus.js [语言,逗号分隔|all]   默认 zh-CN,zh-TW,yue-hk,en
// 输出：corpus/<slug>/<videoID>/<lang>.vtt，以及 corpus/index.json
const fs = require('fs');
const path = require('path');

const API = 'https://api.watch.thechosen.tv';
const OUT = path.join(__dirname, '..', 'corpus');
const LANGS = (process.argv[2] || 'zh-CN,zh-TW,yue-hk,en').split(',');
const ALL = LANGS[0] === 'all';
const CONCURRENCY = 6;

async function get(url, type = 'text') {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return type === 'json' ? r.json() : r.text();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
}

// 简单的并发池
async function pool(items, fn) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

async function listVideos() {
  const seasons = (await get(`${API}/v1/seasons`, 'json')).data;
  const slugs = [...seasons.seasonCards, ...(seasons.pageCards || [])].map(c => c.cta.href);
  const videos = [];
  const seen = new Set();
  for (const slug of slugs) {
    const page = JSON.stringify(await get(`${API}/v2/pages/by/${slug}?locale=en`, 'json'));
    const ids = [...new Set((page.match(/"videoID":"[^"]+"/g) || []).map(m => m.split('"')[3]))];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      videos.push({ slug, id });
    }
  }
  return videos;
}

async function main() {
  const videos = await listVideos();
  console.log(`找到 ${videos.length} 个视频，读取详情…`);

  const details = await pool(videos, async v => {
    let d;
    try {
      const j = await get(`${API}/v1/videos/${v.id}`, 'json');
      d = j && (j.data || j);
    } catch (e) {
      console.warn(`跳过 ${v.id}：${e.message}`);
    }
    if (!d || !d.title) return { ...v, subtitleCount: 0 };
    return {
      ...v,
      title: d.title,
      season: d.seasonNumber,
      episode: d.episodeNumber,
      duration: d.duration,
      master: (d.details?.video || []).map(x => x.url).find(Boolean),
      subtitleCount: d.subtitle_language_count || 0,
    };
  });
  const withSubs = details.filter(v => v.master && v.subtitleCount > 0);
  console.log(`其中 ${withSubs.length} 个有字幕，开始下载 ${ALL ? '全部语言' : LANGS.join(', ')}…`);

  let files = 0;
  await pool(withSubs, async v => {
    const master = await get(v.master);
    const tracks = master.split('\n')
      .filter(l => l.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/.test(l))
      .map(l => ({
        lang: (l.match(/LANGUAGE="([^"]*)"/) || [])[1],
        uri: new URL((l.match(/URI="([^"]*)"/) || [])[1], v.master).href,
      }));
    v.languages = tracks.map(t => t.lang);
    const dir = path.join(OUT, v.slug, v.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const t of tracks) {
      if (!ALL && !LANGS.includes(t.lang)) continue;
      const file = path.join(dir, `${t.lang}.vtt`);
      if (fs.existsSync(file)) continue;
      const pl = await get(t.uri);
      const segs = pl.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      const parts = [];
      for (const s of segs) parts.push(await get(new URL(s, t.uri).href));
      fs.writeFileSync(file, parts.join('\n'));
      files++;
    }
  });

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(details, null, 2));
  console.log(`完成：新下载 ${files} 个字幕文件，索引写入 corpus/index.json`);
}

main().catch(e => { console.error(e); process.exit(1); });

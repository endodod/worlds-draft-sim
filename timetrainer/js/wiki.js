/* Image resolution from Wikipedia / Wikimedia Commons.
 * Uses images baked into data/bundle.js when present, otherwise asks the
 * MediaWiki API from the browser (CORS via origin=*) and caches the answer
 * in localStorage so every image is only looked up once per browser. */
(function () {
  const WP = 'https://en.wikipedia.org/w/api.php';
  const COMMONS = 'https://commons.wikimedia.org/w/api.php';
  const KEY = 'tt_imgcache_v1';
  const baked = (window.TT_DATA && window.TT_DATA.images) || { lead: {}, gallery: {}, logos: {} };

  let cache;
  try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cache = {}; }
  cache.lead = cache.lead || {}; cache.gallery = cache.gallery || {}; cache.logos = cache.logos || {};
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* quota or private mode */ } }, 300);
  }

  const YEAR = /(?<!\d)(19\d\d|20[0-2]\d)(?![\ds])/;
  const YEARS = /(?<!\d)(19\d\d|20[0-2]\d)(?![\ds])/g;
  const SKIP = /flag|map|coat.of.arms|wappen|logo|icon|symbol|commons-|wiki|edit-|question|portal|padlock|ambox|crystal|nuvola|loudspeaker|locat|emblem|signature|disambig|text-x|stub|blank|arrow/i;
  const BAD_EXT = /\.(ogg|ogv|webm|mp3|pdf|tiff?|gif)$/i;

  // Limit parallel requests so we stay polite with the API.
  let active = 0; const queue = [];
  function limited(fn) {
    return new Promise((resolve, reject) => {
      const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; if (queue.length) queue.shift()(); }); };
      active < 3 ? run() : queue.push(run);
    });
  }
  async function api(base, params) {
    const p = new URLSearchParams(Object.assign({ format: 'json', formatversion: '2', origin: '*' }, params));
    return limited(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await fetch(base + '?' + p.toString());
        if (r.status === 429) { await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }
      throw new Error('rate limited');
    });
  }
  async function apiAll(base, params) {
    const pages = {}; let cont = {};
    for (let i = 0; i < 20; i++) {
      const d = await api(base, Object.assign({}, params, cont));
      for (const p of (d.query && d.query.pages) || []) {
        pages[p.title] = Object.assign(pages[p.title] || {}, p);
      }
      if (!d.continue) break;
      cont = d.continue;
    }
    return Object.values(pages);
  }
  const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);

  /* ---------- lead images (one per article) ---------- */
  const pendingLead = {};
  let leadBatch = null;
  function lead(title) {
    if (baked.lead[title]) return Promise.resolve(baked.lead[title]);
    if (title in cache.lead) return Promise.resolve(cache.lead[title]);
    if (pendingLead[title]) return pendingLead[title];
    // Collect requests made in the same tick into one API call (max 50 titles).
    if (!leadBatch) {
      leadBatch = { titles: [], waiters: {} };
      setTimeout(() => { const b = leadBatch; leadBatch = null; runLeadBatch(b); }, 30);
    }
    const b = leadBatch;
    b.titles.push(title);
    pendingLead[title] = new Promise(res => { b.waiters[title] = res; });
    return pendingLead[title];
  }
  async function runLeadBatch(b) {
    for (let i = 0; i < b.titles.length; i += 50) {
      const chunk = b.titles.slice(i, i + 50);
      const found = {};
      try {
        const d = await api(WP, { action: 'query', prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: 800, redirects: 1, titles: chunk.join('|') });
        const q = d.query || {};
        const map = {}; chunk.forEach(t => map[t] = t);
        for (const n of q.normalized || []) for (const t in map) if (map[t] === n.from) map[t] = n.to;
        for (const r of q.redirects || []) for (const t in map) if (map[t] === r.from) map[t] = r.to;
        const byTitle = {}; (q.pages || []).forEach(p => byTitle[p.title] = p);
        for (const t of chunk) {
          const p = byTitle[map[t]];
          if (p && p.thumbnail) found[t] = { src: p.thumbnail.source, file: p.pageimage || '', page: p.title };
        }
      } catch (e) { console.warn('lead batch failed', e); }
      for (const t of chunk) {
        // No search fallback on purpose: a near-miss title usually lands on the generic
        // article whose lead image is the CURRENT generation, i.e. the wrong car.
        cache.lead[t] = found[t] || null;
        b.waiters[t](cache.lead[t]);
        delete pendingLead[t];
      }
      save();
    }
  }

  /* ---------- all images of an article (fashion decades, plates) ---------- */
  const pendingGal = {};
  function gallery(title, opts = {}) {
    if (baked.gallery[title] && baked.gallery[title].length) return Promise.resolve(baked.gallery[title]);
    if (cache.gallery[title]) return Promise.resolve(cache.gallery[title]);
    if (pendingGal[title]) return pendingGal[title];
    pendingGal[title] = (async () => {
      let list = [];
      try {
        const pages = await apiAll(WP, { action: 'query', generator: 'images', titles: title, redirects: 1, gimlimit: 50, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: 800, iiextmetadatafilter: 'ImageDescription|DateTimeOriginal|ObjectName' });
        for (const p of pages) {
          const ii = (p.imageinfo || [])[0] || {};
          const name = p.title;
          if (!ii.thumburl || SKIP.test(name) || BAD_EXT.test(name)) continue;
          if (/\.svg$/i.test(name) && !opts.allowSvg) continue;
          const em = ii.extmetadata || {};
          const desc = strip(em.ImageDescription && em.ImageDescription.value);
          const date = strip(em.DateTimeOriginal && em.DateTimeOriginal.value);
          let year = null;
          for (const s of [date, name, desc]) { const m = YEAR.exec(s || ''); if (m) { year = +m[1]; break; } }
          list.push({ src: ii.thumburl, file: name, desc, year });
        }
        list.sort((a, b) => a.file.localeCompare(b.file));
        cache.gallery[title] = list; save();
      } catch (e) { console.warn('gallery failed', title, e); }
      delete pendingGal[title];
      return list;
    })();
    return pendingGal[title];
  }

  /* ---------- historic logos from Commons categories ---------- */
  const pendingLogo = {};
  function logos(brand, cats) {
    if (baked.logos[brand] && baked.logos[brand].length) return Promise.resolve(baked.logos[brand]);
    if (cache.logos[brand]) return Promise.resolve(cache.logos[brand]);
    if (pendingLogo[brand]) return pendingLogo[brand];
    pendingLogo[brand] = (async () => {
      const files = {};
      for (const c of cats) {
        try {
          const pages = await apiAll(COMMONS, { action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + c, gcmtype: 'file', gcmlimit: 50, prop: 'imageinfo', iiprop: 'url', iiurlwidth: 400 });
          for (const p of pages) {
            const ii = (p.imageinfo || [])[0] || {};
            const ys = (p.title.match(YEARS) || []).map(Number);
            if (ii.thumburl && ys.length && ys[0] <= new Date().getFullYear()) {
              files[p.title] = { src: ii.thumburl, file: p.title, from: ys[0], to: ys[1] > ys[0] ? ys[1] : null };
            }
          }
        } catch (e) { /* category may not exist */ }
      }
      const list = Object.values(files).sort((a, b) => a.from - b.from || a.file.localeCompare(b.file));
      cache.logos[brand] = list; save();
      delete pendingLogo[brand];
      return list;
    })();
    return pendingLogo[brand];
  }

  function fileUrl(file) {
    if (!file) return null;
    const f = file.startsWith('File:') ? file : 'File:' + file;
    return 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(f.replace(/ /g, '_'));
  }
  function clearCache() { cache = { lead: {}, gallery: {}, logos: {} }; try { localStorage.removeItem(KEY); } catch (e) { } }
  function cacheSize() { return Object.keys(cache.lead).length + Object.keys(cache.gallery).length + Object.keys(cache.logos).length; }

  window.Wiki = { lead, gallery, logos, fileUrl, clearCache, cacheSize };
})();

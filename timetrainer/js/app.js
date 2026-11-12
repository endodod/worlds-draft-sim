/* TimeTrainer: picture-based drills for TimeGuessr. Vanilla JS, no build step. */
(function () {
  'use strict';
  const D = window.TT_DATA;
  const app = document.getElementById('app');
  const NOW = new Date().getFullYear();
  const MIN_YEAR = 1900;

  /* ------------------------------------------------------------ utils */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; }
  function rngFrom(seed) { // mulberry32
    let a = hashStr(String(seed));
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(rng, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function weightedPick(rng, arr, weight) {
    const ws = arr.map(weight); const tot = ws.reduce((a, b) => a + b, 0);
    let r = rng() * tot; for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1];
  }
  const decade = y => Math.floor(y / 10) * 10;
  const range = (f, t) => t == null ? `${f}–today` : (f === t ? `${f}` : `${f}–${t}`);
  function yearScore(guess, f, t) {
    const hi = t == null ? NOW : t;
    const d = guess < f ? f - guess : guess > hi ? guess - hi : 0;
    return { pts: Math.round(1000 * Math.exp(-d / 7)), off: d };
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
  }
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); toast('Copied to clipboard'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied'); }
  }
  function download(name, text, type = 'text/plain') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  /* ------------------------------------------------------------ stats */
  const STATS = 'tt_stats_v1';
  function stats() { return store.get(STATS, { modes: {}, games: [] }); }
  function recordRound(mode, key, label, pts) {
    const s = stats(); const m = s.modes[mode] = s.modes[mode] || { rounds: 0, pts: 0, perfect: 0, miss: {}, labels: {} };
    m.rounds++; m.pts += pts; if (pts >= 900) m.perfect++;
    m.labels[key] = label;
    if (pts < 500) m.miss[key] = (m.miss[key] || 0) + 1;
    else if (m.miss[key]) { m.miss[key] = Math.max(0, m.miss[key] - 1); if (!m.miss[key]) delete m.miss[key]; }
    store.set(STATS, s);
  }
  function recordGame(g) { const s = stats(); s.games.unshift(g); s.games = s.games.slice(0, 50); store.set(STATS, s); }
  function missWeight(mode) { const m = (stats().modes[mode] || {}).miss || {}; return key => 1 + 2 * (m[key] || 0); }

  /* ------------------------------------------------------------ media helpers */
  function figure(img, alt) {
    if (!img) return `<div class="media empty">Image could not be loaded</div>`;
    return `<figure class="media"><img src="${esc(img.src)}" alt="${esc(alt || 'quiz image')}" loading="eager" decoding="async"></figure>`;
  }
  function credit(img) {
    if (!img || !img.file) return '';
    return `<a class="credit" href="${esc(Wiki.fileUrl(img.file))}" target="_blank" rel="noopener">${esc(img.file.replace(/^File:/, ''))} · Wikimedia Commons</a>`;
  }
  const SIGN_STYLES = ['sign-street', 'sign-shop', 'sign-green', 'sign-plaque', 'sign-neon', 'sign-red'];
  function signs(texts, rng) {
    return `<div class="signs">${texts.map((t, i) => `<div class="sign ${SIGN_STYLES[Math.floor(rng() * SIGN_STYLES.length)]}" dir="auto">${esc(t)}</div>`).join('')}</div>`;
  }

  /* ------------------------------------------------------------ modes */
  const cars = D.cars.items;
  const langs = D.languages.items;
  const sampleOwners = {};
  langs.forEach(l => new Set(l.s.map(t => t.toLowerCase())).forEach(t => sampleOwners[t] = (sampleOwners[t] || 0) + 1));
  const plates = D.plates.items;
  const brands = D.logos.brands;
  const outfitArts = D.outfits.articles;
  const plateGroups = [...new Set(plates.map(p => p.g))];

  async function outfitPool() {
    const lists = await Promise.all(outfitArts.map(a => Wiki.gallery(a.w)));
    const pool = [];
    lists.forEach((list, i) => {
      const a = outfitArts[i];
      list.forEach(img => {
        const exact = img.year && img.year >= a.f && img.year <= a.t;
        pool.push({ img, f: exact ? img.year : a.f, t: exact ? img.year : a.t, art: a });
      });
    });
    return pool;
  }
  const outfitRow = y => D.outfits.sheet.find(r => r[0] === decade(y) + 's') || [];
  function logoRange(list, i) {
    const l = list[i];
    if (l.to) return [l.from, l.to];
    const next = list.slice(i + 1).find(x => x.from > l.from);
    return [l.from, next ? next.from - 1 : null];
  }

  const MODES = {
    cars: {
      icon: '🚗', title: 'Cars', blurb: 'Date the car or name the model. In street scenes the newest car sets the earliest possible year.',
      types: [{ id: 'year', label: 'Launch year (slider)' }, { id: 'model', label: 'Name the model (4 choices)' }],
      filters: [{ id: 'all', label: 'All eras' }, { id: 'pre45', label: '1900–1945' }, { id: '45-80', label: '1945–1980' }, { id: '80-00', label: '1980–2000' }, { id: 'post00', label: '2000–today' }],
      async question(rng, s, weight) {
        const lim = { all: [0, 9999], pre45: [0, 1945], '45-80': [1945, 1980], '80-00': [1980, 2000], post00: [2000, 9999] }[s.filter || 'all'];
        const pool = cars.filter(c => c.f >= lim[0] && c.f < lim[1]);
        const c = weightedPick(rng, pool, x => weight('cars:' + x.w));
        const img = await Wiki.lead(c.w);
        if (!img) return null;
        const reveal = `<b>${esc(c.n)}</b> · built ${range(c.f, c.t)} · ${esc(c.r)}<br><span class="tell">${esc(c.tell)}</span>`;
        if (s.type === 'model') {
          const near = cars.filter(x => x !== c && Math.abs(x.f - c.f) <= 12);
          const opts = shuffle(rng, [c, ...shuffle(rng, near.length >= 3 ? near : cars.filter(x => x !== c)).slice(0, 3)]);
          return { key: 'cars:' + c.w, label: c.n, media: figure(img, 'a car'), img, prompt: 'Which model is this?', kind: 'choice', options: opts.map(o => ({ id: o.w, label: o.n })), answer: c.w, reveal };
        }
        return { key: 'cars:' + c.w, label: c.n, media: figure(img, 'a car'), img, prompt: 'When was this model launched?', kind: 'year', f: c.f, t: c.f, reveal };
      }
    },
    outfits: {
      icon: '👗', title: 'Outfits', blurb: 'Guess the year from clothes, hair and photo style. Fashion images by decade.',
      types: [{ id: 'year', label: 'Guess the year (slider)' }],
      async question(rng, s, weight) {
        const pool = await (this._pool || (this._pool = outfitPool()));
        if (!pool.length) { this._pool = null; return null; }
        const it = weightedPick(rng, pool, x => weight('outfits:' + x.img.file));
        const row = outfitRow(Math.round((it.f + it.t) / 2));
        const reveal = `<b>${it.f === it.t ? it.f : range(it.f, it.t)}</b> (${esc(it.art.w)})${it.img.desc ? `<br><span class="desc">${esc(it.img.desc)}</span>` : ''}${row.length ? `<br><span class="tell">Women: ${esc(row[1])}<br>Men: ${esc(row[2])}</span>` : ''}`;
        return { key: 'outfits:' + it.img.file, label: it.img.file.replace(/^File:/, ''), media: figure(it.img, 'historic fashion'), img: it.img, prompt: 'Which year is this outfit from?', kind: 'year', f: it.f, t: it.t, reveal };
      }
    },
    languages: {
      icon: '🔤', title: 'Languages', blurb: 'Read the signs and name the language: Spain vs Latin America, Portugal vs Brazil, Nordic, Cyrillic, Eastern Europe, Asia…',
      types: [{ id: 'lang', label: 'Which language? (4 choices)' }],
      filters: [{ id: 'all', label: 'All' }].concat(Object.entries(D.languages.groups).map(([id, label]) => ({ id, label }))),
      async question(rng, s, weight) {
        const pool = s.filter && s.filter !== 'all' ? langs.filter(l => l.g.includes(s.filter)) : langs;
        const l = weightedPick(rng, pool, x => weight('lang:' + x.id));
        const g = s.filter && s.filter !== 'all' ? s.filter : l.g[0];
        let others = shuffle(rng, langs.filter(x => x !== l && x.g.includes(g)));
        if (others.length < 3) others = others.concat(shuffle(rng, langs.filter(x => x !== l && !others.includes(x))));
        const opts = shuffle(rng, [l, ...others.slice(0, 3)]);
        // Prefer samples that no other language uses (e.g. 'Аптека' is Russian AND Ukrainian AND Bulgarian).
        const uniqueS = l.s.filter(t => !sampleOwners[t.toLowerCase()] || sampleOwners[t.toLowerCase()] === 1);
        const texts = shuffle(rng, uniqueS.length >= 3 ? uniqueS : l.s).slice(0, 3);
        const reveal = `<b>${esc(l.n)}</b> · ${esc(l.script)}<br><span class="tell">Unique: ${esc(l.uniq)}<br>Giveaways: ${esc(l.words)}<br>vs. others: ${esc(l.vs)}</span>`;
        return { key: 'lang:' + l.id, label: l.n, media: signs(texts, rng), prompt: 'Which language is this?', kind: 'choice', options: opts.map(o => ({ id: o.id, label: o.n })), answer: l.id, reveal };
      }
    },
    plates: {
      icon: '🚘', title: 'License plates', blurb: 'Which country is this plate from? Current and historic plates from Wikipedia.',
      types: [{ id: 'country', label: 'Which country? (4 choices)' }],
      filters: [{ id: 'all', label: 'All' }].concat(plateGroups.map(g => ({ id: g, label: g }))),
      async question(rng, s, weight) {
        const pool = s.filter && s.filter !== 'all' ? plates.filter(p => p.g === s.filter) : plates;
        const p = weightedPick(rng, pool, x => weight('plates:' + x.c));
        const gal = await Wiki.gallery(p.w, { allowSvg: true });
        if (!gal.length) return null;
        const img = pick(rng, gal);
        let others = shuffle(rng, plates.filter(x => x !== p && x.g === p.g));
        const opts = shuffle(rng, [p, ...others.slice(0, 3)]);
        const reveal = `<b>${esc(p.c)}</b>${img.year ? ` · image year ${img.year}` : ''}<br><span class="tell">Now: ${esc(p.now)}<br>${esc(p.tell)}</span>${img.desc ? `<br><span class="desc">${esc(img.desc)}</span>` : ''}`;
        return { key: 'plates:' + p.c, label: p.c, media: figure(img, 'license plate'), img, prompt: 'Which country is this plate from?', kind: 'choice', options: opts.map(o => ({ id: o.c, label: o.c })), answer: p.c, reveal };
      }
    },
    logos: {
      icon: '🥤', title: 'Logos & brands', blurb: 'When was this version of the logo in use? Coca-Cola, Pepsi, Shell, BP, VW, Apple…',
      types: [{ id: 'year', label: 'When was it in use? (slider)' }],
      async question(rng, s, weight) {
        const b = pick(rng, brands);
        const list = await Wiki.logos(b.b, b.cats);
        if (!list.length) return null;
        const i = list.indexOf(weightedPick(rng, list, x => weight('logos:' + x.file)));
        const l = list[i]; const [f, t] = logoRange(list, i);
        const tl = b.timeline.map(([y, txt]) => `<li${y <= (t || NOW) && y >= f - 1 ? ' class="hit"' : ''}><b>${y}</b> ${esc(txt)}</li>`).join('');
        const reveal = `<b>${esc(b.b)}</b>: this design ${range(f, t)}<ul class="timeline">${tl}</ul>`;
        return { key: 'logos:' + l.file, label: `${b.b} ${l.from}`, media: figure(l, b.b + ' logo').replace('class="media"', 'class="media logo"'), img: l, prompt: `When was this ${esc(b.b)} logo in use?`, kind: 'year', f, t: t == null ? NOW : t, reveal };
      }
    },
    gauntlet: {
      icon: '🏆', title: 'Gauntlet (mixed)', blurb: 'Everything mixed like a real round: cars, outfits, logos, plates and languages.',
      types: [{ id: 'mix', label: 'Mixed' }],
      async question(rng, s, weight) {
        const m = pick(rng, ['cars', 'cars', 'outfits', 'outfits', 'logos', 'plates', 'languages']);
        const type = { cars: rng() < 0.6 ? 'year' : 'model', outfits: 'year', logos: 'year', plates: 'country', languages: 'lang' }[m];
        const q = await MODES[m].question.call(MODES[m], rng, { type, filter: 'all' }, missWeight(m));
        if (q) q.sub = m;
        return q;
      }
    }
  };

  /* ------------------------------------------------------------ views */
  function setNav(id) { $$('header nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === id)); }

  function viewHome() {
    setNav('home');
    const st = stats();
    const card = (id) => {
      const m = MODES[id]; const ms = st.modes[id];
      const avg = ms && ms.rounds ? Math.round(ms.pts / ms.rounds) : null;
      return `<a class="card mode" href="#/mode/${id}"><div class="icon">${m.icon}</div><h3>${m.title}</h3><p>${m.blurb}</p>
        <div class="meta">${ms ? `${ms.rounds} rounds · avg ${avg}` : 'not played yet'}</div></a>`;
    };
    app.innerHTML = `
      <section class="hero">
        <h1>Train for TimeGuessr 2v2 ranked</h1>
        <p>Picture-first drills for the things that win rounds: <b>cars</b>, <b>outfits</b>, <b>signage languages</b>, <b>license plates</b> and <b>logo changes</b>.
        Every mode has a <a href="#/sheets">cheat sheet</a> (also as <a href="TimeTrainer_Cheatsheets.xlsx">Excel file</a>). Your misses come back more often.</p>
        <p class="sub">Playing with a teammate? Start a mode, press <b>Challenge link</b> and send it. You both get the same rounds and can compare scores.</p>
      </section>
      <div class="grid modes">${Object.keys(MODES).map(card).join('')}
        <a class="card mode" href="#/tips"><div class="icon">💡</div><h3>Queue tips</h3><p>Import the tips TimeGuessr shows while you queue, sorted by topic, as flashcards.</p><div class="meta">${tipsAll().length} tips</div></a>
        <a class="card mode" href="#/sheets/general"><div class="icon">🕰️</div><h3>Era tells</h3><p>The baseline: photo quality, phones, streetlights, landmarks, historical events.</p><div class="meta">cheat sheet</div></a>
      </div>`;
  }

  function viewMode(id) {
    const m = MODES[id]; if (!m) return viewHome();
    setNav('home');
    const last = store.get('tt_last_' + id, {});
    const sel = (name, list, cur) => `<label>${name}<select name="${name.toLowerCase()}">${list.map(o => `<option value="${o.id}"${o.id === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    app.innerHTML = `
      <section class="panel">
        <div class="crumb"><a href="#/">Train</a> / ${m.title}</div>
        <h1>${m.icon} ${m.title}</h1>
        <p>${m.blurb}</p>
        <p class="sub">${esc((D[id] && D[id].about) || '')}</p>
        <form id="setup" class="setup">
          ${sel('Type', m.types, last.type)}
          ${m.filters ? sel('Filter', m.filters, last.filter) : ''}
          ${sel('Rounds', [{ id: '5', label: '5' }, { id: '10', label: '10' }, { id: '20', label: '20' }, { id: '0', label: 'Endless' }], last.rounds || '10')}
          <div class="row">
            <button class="btn primary" type="submit">Start ▶</button>
            <button class="btn" type="button" id="challenge">Challenge link 🔗</button>
            ${id !== 'gauntlet' ? `<a class="btn ghost" href="#/learn/${id}">Learn gallery</a><a class="btn ghost" href="#/sheets/${id}">Cheat sheet</a>` : ''}
          </div>
        </form>
      </section>`;
    const params = () => { const f = new FormData($('#setup')); const o = { type: f.get('type'), filter: f.get('filter') || 'all', rounds: f.get('rounds') }; store.set('tt_last_' + id, o); return o; };
    $('#setup').onsubmit = e => { e.preventDefault(); const p = params(); location.hash = `#/play/${id}?type=${p.type}&filter=${encodeURIComponent(p.filter)}&n=${p.rounds}`; };
    $('#challenge').onclick = () => {
      const p = params(); const seed = Math.random().toString(36).slice(2, 8);
      const url = location.href.split('#')[0] + `#/play/${id}?type=${p.type}&filter=${encodeURIComponent(p.filter)}&n=${p.rounds === '0' ? 10 : p.rounds}&seed=${seed}`;
      copyText(url);
      toast('Challenge link copied: send it to your teammate');
    };
  }

  /* ---------------- play ---------------- */
  let game = null;
  async function viewPlay(id, q) {
    const m = MODES[id]; if (!m) return viewHome();
    setNav('home');
    const n = +(q.get('n') || 10);
    const seed = q.get('seed');
    game = { id, m, n, seed, rng: rngFrom(seed || Math.random()), s: { type: q.get('type') || m.types[0].id, filter: q.get('filter') || 'all' }, round: 0, total: 0, log: [], token: Symbol() };
    game.weight = seed ? () => 1 : missWeight(id);
    nextRound();
  }
  async function nextRound() {
    const g = game; const tok = g.token;
    if (g.n && g.round >= g.n) return endGame();
    g.round++;
    app.innerHTML = `<section class="play"><div class="hud"><span>${g.m.icon} ${g.m.title}${g.seed ? ` · <span class="pill">challenge ${esc(g.seed)}</span>` : ''}</span><span>Round ${g.round}${g.n ? '/' + g.n : ''} · <b>${g.total}</b> pts</span></div><div class="loading">Loading picture…</div></section>`;
    let qn = null;
    for (let i = 0; i < 10 && !qn; i++) {
      try { qn = await g.m.question.call(g.m, g.rng, g.s, g.weight); } catch (e) { console.warn(e); }
      if (tok !== game.token) return;
    }
    if (!qn) { app.innerHTML = `<section class="panel"><h2>Couldn't load pictures</h2><p>The Wikipedia image API didn't answer. Check your connection (or an ad/privacy blocker blocking wikipedia.org) and try again.</p><a class="btn" href="#/mode/${g.id}">Back</a></section>`; return; }
    if (qn.img) { await new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = qn.img.src; setTimeout(res, 4000); }); }
    if (tok !== game.token) return;
    g.q = qn;
    renderQuestion();
  }
  function renderQuestion() {
    const g = game, q = g.q;
    const answerUi = q.kind === 'year'
      ? `<div class="yearpick">
          <div class="yearval" id="yv">${g.lastGuess || 1970}</div>
          <input type="range" id="yr" min="${MIN_YEAR}" max="${NOW}" value="${g.lastGuess || 1970}">
          <div class="row center"><button class="btn sm" data-d="-10">−10</button><button class="btn sm" data-d="-1">−1</button><button class="btn sm" data-d="1">+1</button><button class="btn sm" data-d="10">+10</button></div>
          <div class="decades">${Array.from({ length: Math.floor((NOW - MIN_YEAR) / 10) + 1 }, (_, i) => MIN_YEAR + i * 10).map(d => `<button class="chip" data-y="${d + 5}">${d}s</button>`).join('')}</div>
          <button class="btn primary big" id="go">Guess ⏎</button></div>`
      : `<div class="choices">${q.options.map((o, i) => `<button class="btn choice" data-id="${esc(o.id)}"><kbd>${i + 1}</kbd> ${esc(o.label)}</button>`).join('')}</div>`;
    $('.play').innerHTML = `<div class="hud"><span>${g.m.icon} ${g.m.title}${q.sub ? ' · ' + MODES[q.sub].title : ''}${g.seed ? ` · <span class="pill">challenge ${esc(g.seed)}</span>` : ''}</span><span>Round ${g.round}${g.n ? '/' + g.n : ''} · <b>${g.total}</b> pts</span></div>
      <div class="stage">${q.media}</div>
      <h2 class="prompt">${q.prompt}</h2>
      <div id="answer">${answerUi}</div>
      <div id="reveal"></div>`;
    if (q.kind === 'year') {
      const yr = $('#yr'), yv = $('#yv');
      const set = v => { v = Math.max(MIN_YEAR, Math.min(NOW, v)); yr.value = v; yv.textContent = v; };
      yr.oninput = () => set(+yr.value);
      $$('[data-d]').forEach(b => b.onclick = () => set(+yr.value + +b.dataset.d));
      $$('[data-y]').forEach(b => b.onclick = () => set(+b.dataset.y));
      $('#go').onclick = () => answer(+yr.value);
      yr.focus();
    } else {
      $$('.choice').forEach(b => b.onclick = () => answer(b.dataset.id));
    }
  }
  function answer(val) {
    const g = game, q = g.q; if (g.answered === g.round) return; g.answered = g.round;
    let pts, verdict;
    if (q.kind === 'year') {
      g.lastGuess = val;
      const r = yearScore(val, q.f, q.t); pts = r.pts;
      verdict = r.off === 0 ? `Spot on: <b>${val}</b>` : `You said <b>${val}</b>, ${r.off} year${r.off === 1 ? '' : 's'} off`;
      $('#answer').innerHTML = `<div class="yearline">${yearLine(val, q.f, q.t)}</div>`;
    } else {
      pts = val === q.answer ? 1000 : 0;
      verdict = pts ? 'Correct!' : 'Not quite';
      $$('.choice').forEach(b => { b.disabled = true; if (b.dataset.id === q.answer) b.classList.add('right'); else if (b.dataset.id === val) b.classList.add('wrong'); });
    }
    g.total += pts;
    g.log.push({ label: q.label, pts, sub: q.sub });
    recordRound(q.sub || g.id, q.key, q.label, pts);
    $('.hud span:last-child').innerHTML = `Round ${g.round}${g.n ? '/' + g.n : ''} · <b>${g.total}</b> pts`;
    $('#reveal').innerHTML = `<div class="reveal ${pts >= 900 ? 'good' : pts >= 400 ? 'ok' : 'bad'}">
        <div class="verdict">${verdict} <span class="pts">+${pts}</span></div>
        <div class="explain">${q.reveal}</div>${credit(q.img)}
        <div class="row"><button class="btn primary" id="next">${g.n && g.round >= g.n ? 'Results' : 'Next'} ⏎</button><a class="btn ghost" href="#/mode/${g.id}">Quit</a></div></div>`;
    $('#next').onclick = nextRound;
    $('#next').focus();
  }
  function yearLine(guess, f, t) {
    const pos = y => ((y - MIN_YEAR) / (NOW - MIN_YEAR) * 100).toFixed(2) + '%';
    const hi = t == null ? NOW : t;
    return `<div class="track"><div class="band" style="left:${pos(f)};width:calc(${pos(hi)} - ${pos(f)} + 4px)"></div><div class="mark guess" style="left:${pos(guess)}"><span>${guess}</span></div><div class="mark truth" style="left:${pos(f)}"><span>${f === hi ? f : f + '–' + (t == null ? 'now' : hi)}</span></div></div><div class="axis">${[1900, 1925, 1950, 1975, 2000].map(y => `<span style="left:${pos(y)}">${y}</span>`).join('')}<span style="left:100%">${NOW}</span></div>`;
  }
  function endGame() {
    const g = game; const max = g.log.length * 1000;
    const text = `TimeTrainer · ${g.m.title}${g.seed ? ' · challenge ' + g.seed : ''}: ${g.total}/${max} pts (${g.log.filter(l => l.pts >= 900).length}/${g.log.length} perfect)`;
    recordGame({ mode: g.id, pts: g.total, max, seed: g.seed || null, at: Date.now() });
    app.innerHTML = `<section class="panel">
      <h1>${g.m.icon} ${g.total} <small>/ ${max}</small></h1>
      <p>${g.log.filter(l => l.pts >= 900).length} of ${g.log.length} spot on.</p>
      <ol class="results">${g.log.map(l => `<li class="${l.pts >= 900 ? 'good' : l.pts >= 400 ? 'ok' : 'bad'}"><span>${esc(l.label)}</span><b>${l.pts}</b></li>`).join('')}</ol>
      <div class="row"><button class="btn" id="share">Copy result</button><button class="btn primary" id="again">Play again</button><a class="btn ghost" href="#/mode/${g.id}">Settings</a>${g.id !== 'gauntlet' ? `<a class="btn ghost" href="#/sheets/${g.id}">Cheat sheet</a>` : ''}</div></section>`;
    $('#share').onclick = () => copyText(text + (g.seed ? '\n' + location.href : ''));
    $('#again').onclick = () => { const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.delete('seed'); location.hash = `#/play/${g.id}?${q}&r=${Date.now() % 1e5}`; };
  }
  document.addEventListener('keydown', e => {
    if (!game || !$('.play')) return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key === 'Enter') { const n = $('#next'); if (n) { e.preventDefault(); n.click(); } else if ($('#go')) { e.preventDefault(); $('#go').click(); } }
    if (/^[1-4]$/.test(e.key)) { const b = $$('.choice')[+e.key - 1]; if (b && !b.disabled) b.click(); }
  });

  /* ---------------- learn galleries ---------------- */
  const lazyObs = 'IntersectionObserver' in window ? new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { lazyObs.unobserve(en.target); en.target._load(); } }), { rootMargin: '400px' }) : null;
  function lazy(el, fn) { el._load = fn; lazyObs ? lazyObs.observe(el) : fn(); }

  function viewLearn(id) {
    setNav('home');
    const head = (t, extra = '') => `<div class="crumb"><a href="#/">Train</a> / <a href="#/mode/${id}">${MODES[id].title}</a> / Learn</div><h1>${MODES[id].icon} ${t}</h1>${extra}`;
    if (id === 'cars') {
      const decs = [...new Set(cars.map(c => decade(c.f)))].sort((a, b) => a - b);
      app.innerHTML = `<section>${head('Car gallery', `<p class="sub">Sorted by launch year. Hover/tap a card for the tell. ${D.cars.about}</p>`)}
        <div class="chips">${decs.map(d => `<a class="chip" href="#dec${d}" onclick="document.getElementById('dec${d}').scrollIntoView({behavior:'smooth'});return false">${d}s</a>`).join('')}</div>
        ${decs.map(d => `<h2 id="dec${d}" class="dechead">${d}s</h2><div class="grid gallery">${cars.filter(c => decade(c.f) === d).sort((a, b) => a.f - b.f).map(c => `<div class="card pic" data-w="${esc(c.w)}"><div class="ph"></div><div class="cap"><b>${esc(c.n)}</b><span>${range(c.f, c.t)} · ${esc(c.r)}</span><em>${esc(c.tell)}</em></div></div>`).join('')}</div>`).join('')}</section>`;
      $$('.pic[data-w]').forEach(el => lazy(el, async () => { const img = await Wiki.lead(el.dataset.w); el.querySelector('.ph').outerHTML = img ? `<img src="${esc(img.src)}" alt="" loading="lazy">` : '<div class="ph none">no image</div>'; }));
    } else if (id === 'outfits') {
      app.innerHTML = `<section>${head('Fashion by decade', `<p class="sub">${D.outfits.about}</p>`)}
        ${outfitArts.map(a => { const rows = D.outfits.sheet.filter(r => { const d = parseInt(r[0], 10); return d >= decade(a.f) && d <= a.t; }); return `<h2 class="dechead">${range(a.f, a.t)}</h2>${rows.map(row => `<p class="tell"><b>${esc(row[0])} women:</b> ${esc(row[1])}<br><b>Men:</b> ${esc(row[2])}<br><b>Quick tell:</b> ${esc(row[3])}</p>`).join('')}<div class="grid gallery small" data-art="${esc(a.w)}"><div class="loading">Loading…</div></div>`; }).join('')}</section>`;
      $$('[data-art]').forEach(el => lazy(el, async () => {
        const list = await Wiki.gallery(el.dataset.art);
        el.innerHTML = list.map(img => `<a class="card pic" href="${esc(Wiki.fileUrl(img.file))}" target="_blank" rel="noopener"><img src="${esc(img.src)}" alt="" loading="lazy"><div class="cap">${img.year ? `<b>${img.year}</b>` : ''}<em>${esc(img.desc || img.file.replace(/^File:/, ''))}</em></div></a>`).join('') || '<p class="sub">No images found.</p>';
      }));
    } else if (id === 'plates') {
      app.innerHTML = `<section>${head('Plates by country', `<p class="sub">${D.plates.about}</p>`)}
        ${plateGroups.map(gr => `<h2 class="dechead">${esc(gr)}</h2><div class="grid plates">${plates.filter(p => p.g === gr).map(p => `<div class="card plate" data-w="${esc(p.w)}"><h3>${esc(p.c)}</h3><p class="now">${esc(p.now)}</p><p class="tell">${esc(p.tell)}</p><div class="strip"><div class="loading">…</div></div></div>`).join('')}</div>`).join('')}</section>`;
      $$('.plate[data-w]').forEach(el => lazy(el, async () => {
        const list = await Wiki.gallery(el.dataset.w, { allowSvg: true });
        el.querySelector('.strip').innerHTML = list.slice(0, 8).map(img => `<a href="${esc(Wiki.fileUrl(img.file))}" target="_blank" rel="noopener" title="${esc(img.desc || img.file)}"><img src="${esc(img.src)}" alt="" loading="lazy">${img.year ? `<span>${img.year}</span>` : ''}</a>`).join('') || '<span class="sub">no images</span>';
      }));
    } else if (id === 'logos') {
      app.innerHTML = `<section>${head('Logo timelines', `<p class="sub">${D.logos.about}</p>`)}
        ${brands.map(b => `<div class="card brand" data-b="${esc(b.b)}"><h3>${esc(b.b)}</h3><div class="strip logos"><div class="loading">…</div></div><ul class="timeline">${b.timeline.map(([y, t]) => `<li><b>${y}</b> ${esc(t)}</li>`).join('')}</ul></div>`).join('')}</section>`;
      $$('.brand[data-b]').forEach(el => lazy(el, async () => {
        const b = brands.find(x => x.b === el.dataset.b);
        const list = await Wiki.logos(b.b, b.cats);
        el.querySelector('.strip').innerHTML = list.map((l, i) => { const [f, t] = logoRange(list, i); return `<a href="${esc(Wiki.fileUrl(l.file))}" target="_blank" rel="noopener" title="${esc(l.file)}"><img src="${esc(l.src)}" alt="" loading="lazy"><span>${range(f, t)}</span></a>`; }).join('') || '<span class="sub">no historic logo files found on Commons, use the timeline</span>';
      }));
    } else if (id === 'languages') {
      const rng = rngFrom('learn');
      app.innerHTML = `<section>${head('Languages & scripts', `<p class="sub">${D.languages.about}</p>`)}
        ${Object.entries(D.languages.groups).map(([g, label]) => `<h2 class="dechead">${esc(label)}</h2><div class="grid langs">${langs.filter(l => l.g[0] === g).map(l => `<div class="card lang"><h3>${esc(l.n)} <small>${esc(l.script)}</small></h3>${signs(l.s.slice(0, 4), rng)}<p><b>Unique:</b> ${esc(l.uniq)}</p><p><b>Giveaways:</b> ${esc(l.words)}</p><p><b>Don't confuse:</b> ${esc(l.vs)}</p></div>`).join('')}</div>`).join('')}</section>`;
    } else viewHome();
  }

  /* ---------------- cheat sheets ---------------- */
  function sheetTables(id) {
    switch (id) {
      case 'general': return [
        { title: 'Era tells', cols: ['Category', 'Clue', 'Period'], rows: D.general.sheet },
        { title: 'Baseline strategy', cols: ['#', 'Tip'], rows: D.general.baseline_tips.map((t, i) => [i + 1, t]) },
        { title: 'Dating clues from brands & objects', cols: ['Clue', 'Year', 'Note'], rows: D.logos.sheet_extra }];
      case 'cars': return [
        { title: 'Car shapes by era', cols: ['Era', 'What to look for', 'Typical models'], rows: D.cars.sheet },
        { title: 'Model list', cols: ['Model', 'From', 'To', 'Region', 'Tell'], rows: cars.slice().sort((a, b) => a.f - b.f).map(c => [c.n, c.f, c.t == null ? 'today' : c.t, c.r, c.tell]) }];
      case 'outfits': return [{ title: 'Fashion by decade', cols: ['Decade', 'Women', 'Men', 'Quick tell'], rows: D.outfits.sheet }];
      case 'languages': return [{ title: 'Languages & scripts', cols: ['Language', 'Script', 'Unique letters', 'Giveaway words', "Don't confuse with"], rows: langs.map(l => [l.n, l.script, l.uniq, l.words, l.vs]) }];
      case 'plates': return [{ title: 'License plates', cols: ['Country', 'Region', 'Current format', 'Tells & history'], rows: plates.map(p => [p.c, p.g, p.now, p.tell]) }];
      case 'logos': return [
        { title: 'Logo changes', cols: ['Brand', 'Year', 'Change'], rows: brands.flatMap(b => b.timeline.map(([y, t]) => [b.b, y, t])) },
        { title: 'Other dating clues', cols: ['Clue', 'Year', 'Note'], rows: D.logos.sheet_extra }];
      case 'tips': return [{ title: 'Queue tips', cols: ['Topic', 'Tip'], rows: tipsAll().map(t => [t.cat, t.text]) }];
    }
    return [];
  }
  const SHEET_TABS = [['general', '🕰️ Era tells'], ['cars', '🚗 Cars'], ['outfits', '👗 Outfits'], ['languages', '🔤 Languages'], ['plates', '🚘 Plates'], ['logos', '🥤 Logos'], ['tips', '💡 Queue tips']];
  function viewSheets(id) {
    setNav('sheets');
    id = id || 'general';
    const tables = sheetTables(id);
    app.innerHTML = `<section>
      <h1>Cheat sheets</h1>
      <p class="sub">The most important tells per mode. Download everything as one <a href="TimeTrainer_Cheatsheets.xlsx">Excel workbook</a>, or each table as CSV (opens in Google Sheets / Excel).</p>
      <div class="tabs">${SHEET_TABS.map(([k, l]) => `<a class="tab${k === id ? ' on' : ''}" href="#/sheets/${k}">${l}</a>`).join('')}</div>
      <input class="search" id="flt" placeholder="Filter rows…">
      ${tables.map((t, i) => `<div class="sheet"><div class="sheethead"><h2>${esc(t.title)}</h2><button class="btn sm" data-csv="${i}">CSV ⬇</button></div>
        <div class="tablewrap"><table><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${t.cols.length}">Nothing yet. ${id === 'tips' ? '<a href="#/tips">Import tips</a>' : ''}</td></tr>`}</tbody></table></div></div>`).join('')}
    </section>`;
    $$('[data-csv]').forEach(b => b.onclick = () => { const t = tables[+b.dataset.csv]; download(`timetrainer-${id}-${t.title.toLowerCase().replace(/\W+/g, '-')}.csv`, '﻿' + [t.cols, ...t.rows].map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv'); });
    $('#flt').oninput = e => { const v = e.target.value.toLowerCase(); $$('tbody tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(v) ? '' : 'none'); };
  }

  /* ---------------- queue tips ---------------- */
  const TIPS = 'tt_tips_v1';
  const TIP_CATS = [
    ['Plates', /\bplates?\b|registration|licen[cs]e plate|number plate/i],
    ['Cars & vehicles', /\bcars?\b|vehicle|truck|lorry|\bbus(es)?\b|tram|taxi|motorbike|scooter|bicycle|tuk|wheel|headlight/i],
    ['Clothing', /cloth|fashion|dress|\bhats?\b|outfit|uniform|hair|shoe|skirt|\bsuit|jeans|wear|beard|moustache|glasses/i],
    ['Language & script', /language|script|alphabet|cyrillic|latin|letter|\bwords?\b|spell|accent|diacritic|kanji|hangul|arabic|chinese|japanese|thai/i],
    ['Logos, signs & brands', /logo|brand|advert|billboard|shop sign|signage|coca|pepsi|store|company|currency|price/i],
    ['Photo quality', /photo|colou?r|black and white|b&w|sepia|film|camera|digital|grain|resolution|blurr|saturat/i],
    ['Architecture', /building|architect|roof|church|mosque|temple|tower|skyscraper|house|bridge|brick|window|balcon/i],
    ['Roads & infrastructure', /road|street|lamp|pole|bollard|traffic|driv|\brail|train|power line|sidewalk|pavement|lane|marking/i],
    ['Nature & landscape', /tree|vegetat|climate|soil|mountain|snow|palm|landscape|desert|forest|beach|weather/i],
    ['History & events', /\bwar\b|soldier|army|flag|protest|olympic|king|queen|president|revolution|empire|soviet|nazi|colonial/i]
  ];
  const categorize = t => (TIP_CATS.find(([, re]) => re.test(t)) || ['Other'])[0];
  function tipText(t) {
    if (typeof t === 'string') return t;
    for (const k of ['text', 'tip', 'content', 'body', 'message', 'en']) if (typeof t[k] === 'string' && t[k].trim()) return t[k];
    const s = Object.values(t).filter(v => typeof v === 'string').sort((a, b) => b.length - a.length)[0];
    return s || JSON.stringify(t);
  }
  function tipsAll() {
    const mine = store.get(TIPS, []);
    const seen = new Set(); const out = [];
    for (const t of [...(D.tips || []), ...mine]) {
      const text = tipText(t).trim(); if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      out.push({ text, cat: categorize(text), by: t.submittedBy && (t.submittedBy.username || t.submittedBy) || t.by || null });
    }
    return out;
  }
  const SNIPPET = `(async () => {
  // TimeTrainer tip exporter: run in the DevTools console on timeguessr.com while logged in.
  const tips = [], seen = new Set(); let after, dupes = 0;
  for (let i = 0; i < 3000 && dupes < 40; i++) {
    const q = new URLSearchParams({ locale: 'en' });
    if (after !== undefined) q.set('after', after);
    const r = await fetch('/multiplayer/tip?' + q, { credentials: 'include' });
    if (!r.ok) { console.warn('stopped with HTTP', r.status); break; }
    const { tip } = await r.json();
    if (!tip) break;
    const key = tip.id ?? JSON.stringify(tip);
    if (seen.has(key)) { if (tip.id !== undefined) break; dupes++; continue; }
    seen.add(key); tips.push(tip); dupes = 0;
    if (tip.id !== undefined) after = tip.id;
    await new Promise(res => setTimeout(res, 300));
  }
  const json = JSON.stringify(tips, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'timeguessr-tips.json'; a.click();
  try { await navigator.clipboard.writeText(json); } catch (e) { try { copy(json); } catch (_) {} }
  console.log(tips.length + ' tips saved to timeguessr-tips.json (and copied)');
})();`;
  function viewTips() {
    setNav('tips');
    const all = tipsAll();
    const done = new Set(store.get('tt_tips_done', []));
    const cats = [...new Set(all.map(t => t.cat))].sort();
    app.innerHTML = `<section>
      <h1>💡 Queue tips</h1>
      <p>While you queue for ranked, TimeGuessr shows community tips. They're the best hint of what knowledge the game expects.
      The tips are only served to logged-in players, so you export them from your own browser:</p>
      <ol class="steps">
        <li>Log in on <a href="https://timeguessr.com/multiplayer" target="_blank" rel="noopener">timeguessr.com</a>.</li>
        <li>Open the developer console (<kbd>F12</kbd> → Console. Chrome may ask you to type <code>allow pasting</code> first).</li>
        <li>Paste this script and press Enter. It walks through every tip and downloads <code>timeguessr-tips.json</code>. Read the script before you run it: it only reads tips and saves them.</li>
      </ol>
      <div class="code"><button class="btn sm" id="cp">Copy script</button><pre>${esc(SNIPPET)}</pre></div>
      <h2>Import</h2>
      <p class="sub">Choose the downloaded JSON file, or paste JSON or plain text (one tip per line). Tips are stored in this browser. Commit the file as <code>timetrainer/data/tips.json</code> and rebuild to share them with your teammate.</p>
      <div class="row"><input type="file" id="file" accept=".json,.txt"><button class="btn" id="exp">Export JSON</button><button class="btn" id="rand">Random tip 🎲</button></div>
      <textarea id="paste" rows="4" placeholder="Paste tips here…"></textarea>
      <div class="row"><button class="btn primary" id="imp">Import pasted text</button><button class="btn ghost" id="clr">Clear my imported tips</button></div>
      <div id="flash"></div>
      <h2>${all.length} tips <small>${done.size} marked learned</small></h2>
      <input class="search" id="flt" placeholder="Search tips…">
      ${cats.map(c => `<details open class="tipcat"><summary>${esc(c)} <small>${all.filter(t => t.cat === c).length}</small></summary><ul class="tips">${all.filter(t => t.cat === c).map(t => `<li><label><input type="checkbox" data-t="${esc(t.text)}"${done.has(t.text) ? ' checked' : ''}> <span>${esc(t.text)}</span>${t.by ? ` <small>by ${esc(t.by)}</small>` : ''}</label></li>`).join('')}</ul></details>`).join('') || '<p class="sub">No tips yet.</p>'}
    </section>`;
    $('#cp').onclick = () => copyText(SNIPPET);
    const add = items => { const mine = store.get(TIPS, []); store.set(TIPS, mine.concat(items)); toast(items.length + ' tips imported'); viewTips(); };
    const parse = txt => { txt = txt.trim(); if (!txt) return []; try { const j = JSON.parse(txt); return Array.isArray(j) ? j : (j.tips || [j]); } catch (e) { return txt.split(/\n+/).map(s => s.trim()).filter(s => s.length > 3); } };
    $('#imp').onclick = () => add(parse($('#paste').value));
    $('#file').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => add(parse(t))); };
    $('#exp').onclick = () => download('timetrainer-tips.json', JSON.stringify(tipsAll().map(t => ({ text: t.text, cat: t.cat, by: t.by })), null, 1), 'application/json');
    $('#clr').onclick = () => { if (confirm('Remove all tips you imported in this browser?')) { store.set(TIPS, []); viewTips(); } };
    $('#rand').onclick = () => { const t = all[Math.floor(Math.random() * all.length)]; $('#flash').innerHTML = t ? `<div class="card flash"><small>${esc(t.cat)}</small><p>${esc(t.text)}</p></div>` : ''; };
    $$('[data-t]').forEach(cb => cb.onchange = () => { const s = new Set(store.get('tt_tips_done', [])); cb.checked ? s.add(cb.dataset.t) : s.delete(cb.dataset.t); store.set('tt_tips_done', [...s]); });
    $('#flt').oninput = e => { const v = e.target.value.toLowerCase(); $$('.tips li').forEach(li => li.style.display = li.textContent.toLowerCase().includes(v) ? '' : 'none'); };
  }

  /* ---------------- progress ---------------- */
  function viewStats() {
    setNav('stats');
    const s = stats();
    const ids = [...new Set([...Object.keys(MODES), ...Object.keys(s.modes)])].filter(k => s.modes[k]);
    app.innerHTML = `<section>
      <h1>📈 Progress</h1>
      ${ids.length ? `<div class="grid statgrid">${ids.map(k => { const m = s.modes[k]; return `<div class="card"><h3>${(MODES[k] || {}).icon || ''} ${(MODES[k] || { title: k }).title}</h3><div class="big">${Math.round(m.pts / m.rounds)}</div><p>avg points over ${m.rounds} rounds · ${Math.round(100 * m.perfect / m.rounds)}% spot on</p>
        ${Object.keys(m.miss).length ? `<p><b>Weak spots</b> (come up more often):</p><ul class="weak">${Object.entries(m.miss).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => `<li>${esc(m.labels[key] || key)} <small>×${n}</small></li>`).join('')}</ul>` : '<p class="sub">No weak spots right now.</p>'}</div>`; }).join('')}</div>` : '<p>No rounds played yet. <a href="#/">Start training</a>.</p>'}
      ${s.games.length ? `<h2>Recent games</h2><table class="mini"><tbody>${s.games.slice(0, 15).map(g => `<tr><td>${new Date(g.at).toLocaleString()}</td><td>${(MODES[g.mode] || { title: g.mode }).title}</td><td>${g.pts}/${g.max}</td><td>${g.seed ? 'challenge ' + esc(g.seed) : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="row"><button class="btn ghost" id="reset">Reset progress</button><button class="btn ghost" id="cache">Clear image cache (${Wiki.cacheSize()})</button></div>
    </section>`;
    $('#reset').onclick = () => { if (confirm('Reset all progress?')) { store.set(STATS, { modes: {}, games: [] }); viewStats(); } };
    $('#cache').onclick = () => { Wiki.clearCache(); toast('Image cache cleared'); viewStats(); };
  }

  /* ------------------------------------------------------------ router */
  function route() {
    if (game) game.token = Symbol(); // cancel pending loads
    const [path, qs] = (location.hash.slice(1) || '/').split('?');
    const parts = path.split('/').filter(Boolean);
    const q = new URLSearchParams(qs || '');
    window.scrollTo(0, 0);
    switch (parts[0]) {
      case 'mode': return viewMode(parts[1]);
      case 'play': return viewPlay(parts[1], q);
      case 'learn': return viewLearn(parts[1]);
      case 'sheets': return viewSheets(parts[1]);
      case 'tips': return viewTips();
      case 'stats': return viewStats();
      default: game = null; return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();

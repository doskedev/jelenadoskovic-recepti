(function(){
  const CONFIG = window.RECEPTI_CONFIG || {};
  const MODE = CONFIG.mode || 'static';
  const PAGE = CONFIG.page || 'index';
  const BASE = CONFIG.base || '';
  const dataEl = document.getElementById('data');
  const recipes = dataEl ? JSON.parse(dataEl.textContent) : [];
  const CAT_ORDER = ['Torte','Kolači i keks','Peciva i hleb','Doručak','Deserti i kremovi','Slano','Ostalo'];
  const PAGE_SIZE = 24;
  const SITE_NAME = 'Recepti Jelene Dosković';

  const fold = s => (s||'').toLowerCase().replace(/č|ć/g,'c').replace(/š/g,'s').replace(/ž/g,'z').replace(/đ/g,'dj').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmtDate = d => { const p = (d||'').split('-'); return p.length === 3 ? `${+p[2]}. ${+p[1]}. ${p[0]}.` : ''; };
  const byCode = {}, bySlug = {};
  recipes.forEach(r => { byCode[r.code] = r; bySlug[r.slug] = r; });

  const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10Z"/></svg>';
  const checkSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4.5 4.5L19 7"/></svg>';
  const noteSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 16h4"/></svg>';
  const calSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  const listSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/></svg>';
  const filmSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';
  const photoSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 18 5-4 4 3 3-2 2 2"/></svg>';
  const starPath = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z';
  const starsText = n => '★'.repeat(n) + `<i>${'★'.repeat(5 - n)}</i>`;
  const kindIcon = k => k === 'reel' ? filmSvg : photoSvg;
  const recipeHref = r => MODE === 'artifact' ? `#/${encodeURIComponent(r.slug)}` : `${BASE}recept/${r.slug}/`;

  function metaHtml(r){
    return `<span>${calSvg}${fmtDate(r.date)}</span><span>${kindIcon(r.kind)}${esc(r.kind)}</span>`
      + (r.n ? `<span>${listSvg}${r.n} sastojaka</span>` : '');
  }
  function marksHtml(e){
    const bits = [];
    if (e.rating) bits.push(`<span class="stars-static" aria-label="Ocena ${e.rating} od 5">${starsText(e.rating)}</span>`);
    if (e.made) bits.push(`<span class="made-mark">${checkSvg}Napravljeno</span>`);
    if (e.note && e.note.trim()) bits.push(`<span class="note-mark" title="Ima belešku" aria-label="Ima belešku">${noteSvg}</span>`);
    return bits.join('');
  }
  function actsHtml(e){
    return `<div class="qacts">
      <button class="qa h" type="button" aria-label="Sačuvaj recept" aria-pressed="${e.fav}">${heartSvg}</button>
      <button class="qa m" type="button" aria-label="Označi kao napravljeno" aria-pressed="${e.made}">${checkSvg}</button>
    </div>`;
  }

  const EMPTY = {fav:false, made:false, rating:0, note:''};
  const KEY = 'recepti-stanje-v1';
  const OLD_KEY = 'fav-recepti';
  const isSet = e => !!(e && (e.fav || e.made || e.rating || (e.note && e.note.trim())));

  const store = {
    entries: {}, db: null, listeners: [],
    onChange(fn){ this.listeners.push(fn); },
    emit(code){ this.listeners.forEach(fn => fn(code)); },
    get(code){ return Object.assign({}, EMPTY, this.entries[code] || {}); },
    countMade(){ return Object.values(this.entries).filter(e => e.made).length; },
    countFav(){ return Object.values(this.entries).filter(e => e.fav).length; },
    countRated(){ return Object.values(this.entries).filter(e => e.rating > 0).length; },
    countNote(){ return Object.values(this.entries).filter(e => e.note && e.note.trim()).length; },
    readLocal(){
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch(e){ return; }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') this.entries = parsed.entries || parsed || {};
        } catch(e){}
      } else {
        try {
          const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
          if (Array.isArray(old)) old.forEach(code => { this.entries[code] = {fav:true, made:false, rating:0, note:'', updatedAt:1}; });
        } catch(e){}
      }
      Object.keys(this.entries).forEach(code => {
        const e = this.entries[code];
        if (!e || typeof e !== 'object') { delete this.entries[code]; return; }
        this.entries[code] = {fav:!!e.fav, made:!!e.made, rating:Number(e.rating) || 0, note:typeof e.note === 'string' ? e.note : '', updatedAt:Number(e.updatedAt) || 1};
      });
    },
    writeLocal(){ try { localStorage.setItem(KEY, JSON.stringify({version:1, entries:this.entries})); } catch(e){} },
    set(code, patch){
      const next = Object.assign(this.get(code), patch, {updatedAt: Date.now()});
      this.entries[code] = next;
      this.writeLocal();
      this.push(code, next);
      this.emit(code);
      return next;
    },
    merge(code, remote){
      const mine = this.entries[code];
      const incoming = {fav:!!remote.fav, made:!!remote.made, rating:Number(remote.rating) || 0, note:typeof remote.note === 'string' ? remote.note : '', updatedAt:Number(remote.updatedAt) || 1};
      if (mine && Number(mine.updatedAt || 0) >= incoming.updatedAt) return false;
      this.entries[code] = incoming;
      return true;
    },
    push(code, entry){
      if (!this.db) return;
      try {
        this.db.doc('beleske/' + code).set({code, fav:entry.fav, made:entry.made, rating:entry.rating, note:entry.note, updatedAt:entry.updatedAt}).catch(() => {});
      } catch(e){}
    },
    async connect(){
      if (!(window.claude && typeof window.claude.use === 'function')) return;
      let db = null;
      try { db = await window.claude.use('db'); } catch(e){ return; }
      if (!db) return;
      this.db = db;
      const syncNote = document.getElementById('syncNote');
      try {
        const snap = await db.collection('beleske').get();
        let changed = false;
        const seen = new Set();
        snap.docs.forEach(d => { seen.add(d.id); if (this.merge(d.id, d.data() || {})) changed = true; });
        Object.keys(this.entries).forEach(code => {
          const e = this.entries[code];
          if (!seen.has(code) && isSet(e)) this.push(code, e);
        });
        if (changed) { this.writeLocal(); this.emit(); }
        if (syncNote) syncNote.textContent = 'Oznake, ocene i beleške sinhronizuju se sa vašim Claude nalogom, pa ih vidite na svim uređajima.';
        db.collection('beleske').onSnapshot(s2 => {
          let dirty = false;
          s2.docs.forEach(d => { if (this.merge(d.id, d.data() || {})) dirty = true; });
          if (dirty) { this.writeLocal(); this.emit(); }
        }, () => {});
      } catch(e){ this.db = null; }
    }
  };
  store.readLocal();

  function mineHtml(){
    return `<section class="mine">
      <div class="mine-head"><h4>Moja beleška</h4><span class="saved" data-saved>Sačuvano</span></div>
      <div class="mine-row">
        <button class="made-btn" data-made type="button" aria-pressed="false">${checkSvg}<span data-made-label>Označi kao napravljeno</span></button>
        <div class="rate">
          <span class="rate-label">Ocena</span>
          <div class="stars" data-stars role="group" aria-label="Ocena recepta od 1 do 5"></div>
          <button class="rate-clear" data-rate-clear type="button" hidden>obriši</button>
        </div>
      </div>
      <textarea class="note-field" data-note placeholder="Kako je ispalo, šta bih drugi put promenio, koliko je peklo i na kojoj temperaturi…" aria-label="Moja beleška o receptu"></textarea>
    </section>`;
  }

  function wireMine(scope, code){
    const mine = scope.querySelector('.mine');
    if (!mine) return null;
    const madeBtn = mine.querySelector('[data-made]');
    const madeLabel = mine.querySelector('[data-made-label]');
    const starsBox = mine.querySelector('[data-stars]');
    const clearBtn = mine.querySelector('[data-rate-clear]');
    const noteField = mine.querySelector('[data-note]');
    const savedTag = mine.querySelector('[data-saved]');
    let savedTimer = null, noteTimer = null;

    const flash = () => {
      if (!savedTag) return;
      savedTag.classList.add('on');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => savedTag.classList.remove('on'), 1400);
    };
    if (starsBox && !starsBox.children.length) {
      for (let i = 1; i <= 5; i++) {
        const b = document.createElement('button');
        b.className = 'star';
        b.type = 'button';
        b.dataset.value = String(i);
        b.setAttribute('aria-label', `Oceni sa ${i} od 5`);
        b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${starPath}"/></svg>`;
        b.addEventListener('click', () => {
          const cur = store.get(code).rating;
          store.set(code, {rating: cur === i ? 0 : i});
          flash();
        });
        starsBox.appendChild(b);
      }
    }
    if (clearBtn) clearBtn.addEventListener('click', () => { store.set(code, {rating:0}); flash(); });
    if (madeBtn) madeBtn.addEventListener('click', () => { store.set(code, {made: !store.get(code).made}); flash(); });
    if (noteField) {
      noteField.addEventListener('input', () => {
        const value = noteField.value;
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => { store.set(code, {note:value}); flash(); }, 500);
      });
      noteField.addEventListener('blur', () => {
        clearTimeout(noteTimer);
        if (store.get(code).note !== noteField.value) { store.set(code, {note:noteField.value}); flash(); }
      });
      window.addEventListener('beforeunload', () => {
        clearTimeout(noteTimer);
        if (store.get(code).note !== noteField.value) store.set(code, {note:noteField.value});
      });
    }
    const sync = () => {
      const e = store.get(code);
      if (madeBtn) madeBtn.setAttribute('aria-pressed', String(e.made));
      if (madeLabel) madeLabel.textContent = e.made ? 'Napravljeno' : 'Označi kao napravljeno';
      if (starsBox) starsBox.querySelectorAll('.star').forEach(s => s.classList.toggle('on', Number(s.dataset.value) <= e.rating));
      if (clearBtn) clearBtn.hidden = !e.rating;
      if (noteField && noteField.value !== e.note && document.activeElement !== noteField) noteField.value = e.note;
      const favBtn = scope.querySelector('.qa.h');
      if (favBtn) favBtn.setAttribute('aria-pressed', String(e.fav));
    };
    sync();
    return sync;
  }

  function wireQuickActs(scope, code){
    const h = scope.querySelector('.qa.h'), m = scope.querySelector('.qa.m');
    if (h) h.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); store.set(code, {fav: !store.get(code).fav}); });
    if (m) m.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); store.set(code, {made: !store.get(code).made}); });
  }

  /* ---------------- stranica jednog recepta ---------------- */
  function initRecipePage(){
    const article = document.querySelector('.recipe');
    if (!article) return;
    const code = article.dataset.code;
    const sync = wireMine(article, code);
    wireQuickActs(article, code);
    store.onChange(() => { if (sync) sync(); });
    store.connect();
  }

  /* ---------------- prikaz recepta u artifact verziji ---------------- */
  function recipeViewHtml(r){
    const cat = esc(r.category);
    const ings = (r.ingredients || []).map((i, idx) => i.t === 'h'
      ? `<li class="h">${esc(i.x)}</li>`
      : `<li><input type="checkbox" id="ing-${idx}"><label for="ing-${idx}">${esc(i.x)}</label></li>`).join('');
    const idx = recipes.indexOf(r);
    const prev = recipes[idx - 1], next = recipes[idx + 1];
    const related = recipes.filter(x => x.category === r.category && x.code !== r.code).slice(0, 4);
    const e = store.get(r.code);
    return `<nav class="crumbs"><a href="#">Svi recepti</a><span>›</span><span>${cat}</span></nav>
    <div class="recipe-layout">
      <div>
        <article class="recipe" data-code="${esc(r.code)}">
          <div class="r-top">
            <div class="r-top-text">
              <span class="eyebrow">${cat}</span>
              <h1>${esc(r.title)}</h1>
              <div class="mchips">${metaHtml(r)}</div>
              <div class="r-foot"><div class="mine-marks">${marksHtml(e)}</div>${actsHtml(e)}</div>
            </div>
            ${r.img ? `<figure class="r-hero"><img src="${r.img}" alt="${esc(r.title)}"></figure>` : ''}
          </div>
          <div class="recipe-body">
            ${mineHtml()}
            ${r.intro ? `<p class="intro">${esc(r.intro)}</p>` : ''}
            ${ings ? `<section><h2>Sastojci</h2><div class="ing-cols"><ul class="ing-list">${ings}</ul></div></section>` : ''}
            ${r.steps ? `<section><h2>Priprema</h2><p class="steps">${esc(r.steps)}</p></section>` : ''}
            <details><summary>Originalni opis sa Instagrama</summary><pre>${esc(r.raw)}</pre></details>
            <a class="ig-link" href="${esc(r.url)}" target="_blank" rel="noopener">Otvori post na Instagramu ↗</a>
            <nav class="r-pager">
              ${prev ? `<a class="pager-link prev" href="${recipeHref(prev)}"><span>Noviji recept</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
              ${next ? `<a class="pager-link next" href="${recipeHref(next)}"><span>Stariji recept</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
            </nav>
          </div>
        </article>
        ${related.length ? `<section class="panel" style="margin-top:14px">
          <h2 class="panel-title">Iz iste kategorije</h2>
          <div class="related-grid">${related.map(x => `<a class="rel" href="${recipeHref(x)}">
            <span class="rel-img">${x.img ? `<img src="${x.img}" alt="" loading="lazy">` : ''}</span><b>${esc(x.title)}</b></a>`).join('')}</div>
        </section>` : ''}
      </div>
      <aside class="side">
        <section class="panel">
          <h2 class="panel-title">O profilu</h2>
          <div class="side-body">
            <p>Recepti i fotografije su Jelenin rad, objavljeni na njenom Instagram profilu. Ovde su samo sređeni za pretragu i kuvanje.</p>
            <a class="ghost-link" href="https://www.instagram.com/jelenadoskovic/" target="_blank" rel="noopener">Prati na Instagramu</a>
            <p>Ako vam je zbirka koristila, možete se zahvaliti u iznosu koji sami izaberete.</p>
            <a class="pill-link" href="https://paypal.me/jelenadoskovic" target="_blank" rel="noopener">${heartSvg}Podrži preko PayPala</a>
          </div>
        </section>
      </aside>
    </div>`;
  }

  /* ---------------- spisak recepata ---------------- */
  function initIndex(){
    const params = new URLSearchParams(location.search);
    let state = {
      q: params.get('q') || '',
      cat: params.get('kat') || 'Sve',
      sort: 'new',
      favOnly: params.get('sacuvani') === '1',
      madeOnly: params.get('napravljeni') === '1',
      shown: PAGE_SIZE
    };
    if (!CAT_ORDER.includes(state.cat)) state.cat = 'Sve';

    const listEl = document.getElementById('list');
    const featuredEl = document.getElementById('featured');
    const tilesEl = document.getElementById('tiles');
    const tilesGrid = document.getElementById('tilesGrid');
    const nav = document.getElementById('nav');
    const more = document.getElementById('more');
    const empty = document.getElementById('empty');
    const resultText = document.getElementById('resultText');
    const hint = document.getElementById('hint');
    const pickList = document.getElementById('pickList');
    const pickTitle = document.getElementById('pickTitle');
    const qInput = document.getElementById('q');
    const listView = document.getElementById('listView');
    const detailView = document.getElementById('detailView');
    const cardEls = new Map();

    const catCounts = {};
    recipes.forEach(r => catCounts[r.category] = (catCounts[r.category] || 0) + 1);
    const featuredRecipe = recipes.find(r => r.featured) || recipes.find(r => r.img) || recipes[0];

    const navEls = [];
    ['Sve'].concat(CAT_ORDER.filter(c => catCounts[c])).forEach(cat => {
      const b = document.createElement('button');
      b.className = 'nav-btn';
      b.type = 'button';
      b.innerHTML = `${esc(cat)}<i>${cat === 'Sve' ? recipes.length : catCounts[cat]}</i>`;
      b.addEventListener('click', () => { state.cat = cat; state.shown = PAGE_SIZE; update(); });
      nav.appendChild(b);
      navEls.push({el:b, cat});
    });

    const tileEls = [];
    CAT_ORDER.filter(c => catCounts[c] && c !== 'Ostalo').forEach(cat => {
      const pick = recipes.find(r => r.category === cat && r.img);
      const b = document.createElement('button');
      b.className = 'tile';
      b.type = 'button';
      b.innerHTML = `${pick && pick.img ? `<img src="${pick.img}" alt="" loading="lazy" decoding="async">` : ''}<span>${esc(cat)}</span>`;
      b.addEventListener('click', () => { state.cat = state.cat === cat ? 'Sve' : cat; state.shown = PAGE_SIZE; update(); });
      tilesGrid.appendChild(b);
      tileEls.push({el:b, cat});
    });

    function filtered(){
      const terms = fold(state.q.trim()) ? fold(state.q.trim()).split(/\s+/) : [];
      const list = recipes.filter(r => {
        const e = store.entries[r.code];
        if (state.cat !== 'Sve' && r.category !== state.cat) return false;
        if (state.favOnly && !(e && e.fav)) return false;
        if (state.madeOnly && !(e && e.made)) return false;
        return terms.every(t => r.hay.includes(t));
      });
      if (state.sort === 'new') list.sort((a,b) => b.date.localeCompare(a.date));
      else if (state.sort === 'old') list.sort((a,b) => a.date.localeCompare(b.date));
      else if (state.sort === 'az') list.sort((a,b) => fold(a.title).localeCompare(fold(b.title), 'sr'));
      else list.sort((a,b) => (store.get(b.code).rating - store.get(a.code).rating) || b.date.localeCompare(a.date));
      return list;
    }

    function cardHtml(r, e){
      return `<div class="r-text">
          <span class="eyebrow">${esc(r.category)}</span>
          <div class="mchips">${metaHtml(r)}</div>
          <h3><a class="card-link" href="${recipeHref(r)}">${esc(r.title)}</a></h3>
          <div class="r-foot"><div class="mine-marks">${marksHtml(e)}</div>${actsHtml(e)}</div>
        </div>
        ${r.img ? `<span class="r-img"><img src="${r.img}" alt="" loading="lazy" decoding="async"></span>` : ''}`;
    }

    function card(r){
      const e = store.get(r.code);
      const el = document.createElement('article');
      el.className = 'rcard' + (r.img ? '' : ' no-img') + (e.made ? ' is-made' : '');
      el.dataset.code = r.code;
      el.innerHTML = cardHtml(r, e);
      wireQuickActs(el, r.code);
      return el;
    }

    function renderFeatured(){
      const r = featuredRecipe;
      const e = store.get(r.code);
      featuredEl.className = 'featured' + (r.img ? '' : ' no-img');
      featuredEl.innerHTML = `<div class="f-text">
          <span class="eyebrow">${esc(r.category)}</span>
          <div class="mchips">${metaHtml(r)}</div>
          <h2><a class="card-link" href="${recipeHref(r)}">${esc(r.title)}</a></h2>
          ${r.excerpt ? `<p class="excerpt">${esc(r.excerpt)}</p>` : ''}
          <div class="r-foot"><div class="mine-marks">${marksHtml(e)}</div>${actsHtml(e)}</div>
        </div>
        ${r.img ? `<span class="f-img"><img src="${r.img}" alt=""><span class="f-tag">Najnovije</span></span>` : ''}`;
      wireQuickActs(featuredEl, r.code);
    }

    function refreshCard(code){
      const targets = [];
      if (cardEls.has(code)) targets.push(cardEls.get(code));
      if (featuredRecipe.code === code && !featuredEl.hidden) targets.push(featuredEl);
      if (!targets.length) return false;
      const e = store.get(code);
      targets.forEach(el => {
        el.classList.toggle('is-made', e.made);
        const marks = el.querySelector('.mine-marks');
        if (marks) marks.innerHTML = marksHtml(e);
        const h = el.querySelector('.qa.h'), m = el.querySelector('.qa.m');
        if (h) h.setAttribute('aria-pressed', String(e.fav));
        if (m) m.setAttribute('aria-pressed', String(e.made));
      });
      return true;
    }

    function renderPicks(){
      const rated = recipes.filter(r => store.get(r.code).rating > 0)
        .sort((a,b) => (store.get(b.code).rating - store.get(a.code).rating) || b.date.localeCompare(a.date));
      const useRated = rated.length > 0;
      const items = (useRated ? rated : recipes).slice(0, 6);
      pickTitle.textContent = useRated ? 'Moje ocene' : 'Najnovije';
      pickList.innerHTML = items.map(r => {
        const e = store.get(r.code);
        return `<a class="side-item" href="${recipeHref(r)}">
          ${r.img ? `<img src="${r.img}" alt="" loading="lazy" decoding="async">` : '<span class="ph"></span>'}
          <span class="side-item-text"><span class="eyebrow">${esc(r.category)}</span><b>${esc(r.title)}</b>${e.rating ? `<span class="stars-static">${starsText(e.rating)}</span>` : ''}</span>
        </a>`;
      }).join('');
    }

    function syncCounts(){
      document.getElementById('cFav').textContent = store.countFav();
      document.getElementById('cMade').textContent = store.countMade();
      document.getElementById('sMade').textContent = store.countMade();
      document.getElementById('sRated').textContent = store.countRated();
      document.getElementById('sNote').textContent = store.countNote();
      document.getElementById('chipFav').setAttribute('aria-pressed', String(state.favOnly));
      document.getElementById('chipMade').setAttribute('aria-pressed', String(state.madeOnly));
      navEls.forEach(n => n.el.setAttribute('aria-pressed', String(state.cat === n.cat)));
      tileEls.forEach(t => t.el.setAttribute('aria-pressed', String(state.cat === t.cat)));
    }

    function syncUrl(){
      if (MODE === 'artifact') return;
      const p = new URLSearchParams();
      if (state.q.trim()) p.set('q', state.q.trim());
      if (state.cat !== 'Sve') p.set('kat', state.cat);
      if (state.favOnly) p.set('sacuvani', '1');
      if (state.madeOnly) p.set('napravljeni', '1');
      const qs = p.toString();
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    }

    function update(changedCode){
      const browsing = !state.q.trim() && state.cat === 'Sve' && !state.favOnly && !state.madeOnly;
      if (changedCode && state.sort !== 'rating' && !state.favOnly && !state.madeOnly && refreshCard(changedCode)) {
        syncCounts();
        renderPicks();
        return;
      }
      const current = filtered();
      syncCounts();
      syncUrl();
      featuredEl.hidden = !browsing;
      tilesEl.hidden = !browsing;
      if (browsing) renderFeatured();
      listEl.innerHTML = '';
      cardEls.clear();
      const slice = current.slice(0, state.shown);
      slice.forEach(r => { const el = card(r); cardEls.set(r.code, el); listEl.appendChild(el); });
      more.hidden = current.length <= state.shown;
      empty.hidden = current.length > 0;
      const parts = [];
      if (state.q.trim()) parts.push(`„${state.q.trim()}“`);
      if (state.cat !== 'Sve') parts.push(state.cat);
      if (state.favOnly) parts.push('sačuvani');
      if (state.madeOnly) parts.push('napravljeni');
      resultText.textContent = parts.length ? `${current.length} od ${recipes.length} · ${parts.join(' · ')}` : `${recipes.length} recepata`;
      hint.textContent = current.length > state.shown ? `prikazano ${slice.length}` : '';
      document.getElementById('clearQ').hidden = !state.q;
      renderPicks();
    }

    more.addEventListener('click', () => { state.shown += PAGE_SIZE; update(); });
    let timer;
    qInput.value = state.q;
    qInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = qInput.value; state.shown = PAGE_SIZE; update(); }, 120); });
    document.getElementById('clearQ').addEventListener('click', () => { qInput.value = ''; state.q = ''; update(); qInput.focus(); });
    document.getElementById('sort').addEventListener('change', ev => { state.sort = ev.target.value; update(); });
    document.getElementById('chipFav').addEventListener('click', () => { state.favOnly = !state.favOnly; state.shown = PAGE_SIZE; update(); });
    document.getElementById('chipMade').addEventListener('click', () => { state.madeOnly = !state.madeOnly; state.shown = PAGE_SIZE; update(); });

    const backupMsg = document.getElementById('backupMsg');
    function showMsg(text){
      backupMsg.textContent = text;
      setTimeout(() => { if (backupMsg.textContent === text) backupMsg.textContent = ''; }, 4000);
    }
    document.getElementById('exportBtn').addEventListener('click', async () => {
      const payload = {};
      Object.keys(store.entries).forEach(code => { if (isSet(store.entries[code])) payload[code] = store.entries[code]; });
      const codes = Object.keys(payload);
      if (!codes.length) { showMsg('Još nema označenih recepata.'); return; }
      const bodyText = JSON.stringify({version:1, izvezeno:new Date().toISOString(), entries:payload}, null, 1);
      const filename = 'moje-beleske-recepti.json';
      let saved = false;
      if (window.claude && typeof window.claude.use === 'function') {
        try {
          const downloads = await window.claude.use('downloads');
          if (downloads) { await downloads.save({filename, data:bodyText}); saved = true; }
        } catch(e){ saved = false; }
      }
      if (!saved) {
        try {
          const url = URL.createObjectURL(new Blob([bodyText], {type:'application/json'}));
          const a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          saved = true;
        } catch(e){}
      }
      showMsg(saved ? `Sačuvano ${codes.length} zapisa.` : 'Preuzimanje nije moguće u ovom prikazu.');
    });
    document.getElementById('importInput').addEventListener('change', ev => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let incoming = null;
        try { incoming = JSON.parse(String(reader.result)); } catch(e){ showMsg('Fajl nije ispravan JSON.'); return; }
        const entries = incoming && (incoming.entries || incoming);
        if (!entries || typeof entries !== 'object') { showMsg('U fajlu nema beleški.'); return; }
        let n = 0;
        Object.keys(entries).forEach(code => {
          if (!byCode[code]) return;
          const e = entries[code];
          if (!e || typeof e !== 'object') return;
          const merged = {fav:!!e.fav, made:!!e.made, rating:Number(e.rating) || 0, note:typeof e.note === 'string' ? e.note : '', updatedAt:Number(e.updatedAt) || Date.now()};
          const mine = store.entries[code];
          if (mine && Number(mine.updatedAt || 0) >= merged.updatedAt) return;
          store.entries[code] = merged;
          store.push(code, merged);
          n++;
        });
        store.writeLocal();
        update();
        showMsg(n ? `Uvezeno ${n} zapisa.` : 'Nema novijih zapisa za uvoz.');
      };
      reader.onerror = () => showMsg('Fajl nije moguće pročitati.');
      reader.readAsText(file);
      ev.target.value = '';
    });

    let detailSync = null;
    function showList(){
      detailSync = null;
      if (detailView) { detailView.hidden = true; detailView.innerHTML = ''; }
      listView.hidden = false;
      document.title = SITE_NAME;
      window.scrollTo(0, 0);
    }
    function showDetail(r){
      listView.hidden = true;
      detailView.hidden = false;
      detailView.innerHTML = recipeViewHtml(r);
      detailSync = wireMine(detailView, r.code);
      wireQuickActs(detailView, r.code);
      document.title = `${r.title} · ${SITE_NAME}`;
      window.scrollTo(0, 0);
    }
    function route(){
      if (MODE !== 'artifact') return;
      const m = location.hash.match(/^#\/(.+)$/);
      if (m) {
        const r = bySlug[decodeURIComponent(m[1])];
        if (r) return showDetail(r);
      }
      showList();
    }

    store.onChange(code => {
      if (detailSync) { detailSync(); return; }
      update(code);
    });
    update();
    if (MODE === 'artifact') {
      window.addEventListener('hashchange', route);
      route();
    }
    store.connect();
  }

  if (PAGE === 'recipe') initRecipePage();
  else initIndex();
})();

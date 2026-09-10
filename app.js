(function(){
  const CONFIG = window.RECEPTI_CONFIG || {};
  const PAGE = CONFIG.page || 'index';
  const BASE = CONFIG.base || '';
  const dataEl = document.getElementById('data');
  const recipes = dataEl ? JSON.parse(dataEl.textContent) : [];
  const TAGS = Array.isArray(CONFIG.tags) ? CONFIG.tags.slice() : [];
  const TAG_NAME = {};
  TAGS.forEach(t => { TAG_NAME[t.slug] = t.name; });
  const PAGE_SIZE = 24;

  const fold = s => (s||'').toLowerCase().replace(/č|ć/g,'c').replace(/š/g,'s').replace(/ž/g,'z').replace(/đ/g,'dj').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmtDate = d => { const p = (d||'').split('-'); return p.length === 3 ? `${+p[2]}. ${+p[1]}. ${p[0]}.` : ''; };
  const byCode = {};
  recipes.forEach(r => { byCode[r.code] = r; });

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
  const recipeHref = r => `${BASE}recept/${r.slug}/`;

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

  const FB_VERSION = "12.4.0";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBBtAbgKkqX4NK-mD9nK-1IEiKSkNK10TI",
    authDomain: "jelenadoskovic.firebaseapp.com",
    projectId: "jelenadoskovic",
    storageBucket: "jelenadoskovic.firebasestorage.app",
    messagingSenderId: "1094516599117",
    appId: "1:1094516599117:web:decde32807130dc1e02f04"
  };


  /* ---------------- javno citanje iz baze (REST, bez SDK-a) ---------------- */
  const FS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
  const BUILT_VERSION = CONFIG.version || '';
  const META_CACHE = 'recepti-meta';
  const CATALOG_CACHE = 'recepti-katalog';

  function fsValue(v){
    if (v == null) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
    if ('mapValue' in v) return fsFields(v.mapValue.fields || {});
    return null;
  }
  function fsFields(fields){
    const out = {};
    Object.keys(fields).forEach(k => { out[k] = fsValue(fields[k]); });
    return out;
  }
  async function fsList(path){
    const res = await fetch(`${FS_URL}/${path}?pageSize=100&key=${FIREBASE_CONFIG.apiKey}`, {cache:'no-store'});
    if (!res.ok) throw new Error('firestore ' + res.status);
    const json = await res.json();
    return (json.documents || []).map(d => {
      const o = fsFields(d.fields || {});
      o.id = d.name.split('/').pop();
      return o;
    });
  }
  async function fetchTags(){
    const docs = await fsList('tags');
    return docs.map(d => ({slug: d.slug || d.id, name: d.name || d.id,
                           order: Number(d.order) || 0, count: Number(d.count) || 0}))
               .sort((a, b) => a.order - b.order);
  }
  function applyTags(list){
    if (!Array.isArray(list) || !list.length) return;
    TAGS.length = 0;
    list.forEach(t => TAGS.push(t));
    Object.keys(TAG_NAME).forEach(k => delete TAG_NAME[k]);
    TAGS.forEach(t => { TAG_NAME[t.slug] = t.name; });
  }
  async function fsGet(path){
    const res = await fetch(`${FS_URL}/${path}?key=${FIREBASE_CONFIG.apiKey}`, {cache:'no-store'});
    if (!res.ok) throw new Error('firestore ' + res.status);
    const json = await res.json();
    return fsFields(json.fields || {});
  }
  async function catalogVersion(){
    if (!BUILT_VERSION) return '';
    try {
      const c = JSON.parse(sessionStorage.getItem(META_CACHE) || 'null');
      if (c && Date.now() - c.at < 600000) return c.version;
    } catch(e){}
    const meta = await fsGet('catalog/meta');
    try { sessionStorage.setItem(META_CACHE, JSON.stringify({version: meta.version, chunks: meta.chunks, at: Date.now()})); } catch(e){}
    return meta.version;
  }
  function cachedCatalog(){
    try {
      const c = JSON.parse(lsGet(CATALOG_CACHE) || 'null');
      if (c && c.version && Array.isArray(c.items)) return c;
    } catch(e){}
    return null;
  }
  async function fetchCatalog(){
    const meta = await fsGet('catalog/meta');
    const [parts, freshTags] = await Promise.all([
      Promise.all(Array.from({length: Number(meta.chunks) || 1}, (_, i) => fsGet(`catalog/chunk-${i}`))),
      fetchTags().catch(() => null)
    ]);
    const items = [];
    parts.forEach(p => { try { JSON.parse(p.json).forEach(x => items.push(x)); } catch(e){} });
    if (!items.length) throw new Error('prazan katalog');
    const payload = {version: meta.version, items, tags: freshTags || TAGS.slice()};
    lsSet(CATALOG_CACHE, JSON.stringify(payload));
    return payload;
  }

  const EMPTY = {fav:false, made:false, rating:0, note:''};
  const LEGACY_KEY = 'recepti-stanje-v1';
  const SIGNED_FLAG = 'recepti-prijavljen';
  const LAST_UID = 'recepti-zadnji-uid';
  const USER_CACHE = 'recepti-korisnik';
  const cacheKey = uid => `recepti-kes-${uid}`;
  const migratedKey = uid => `recepti-preneto-${uid}`;
  const isSet = e => !!(e && (e.fav || e.made || e.rating || (e.note && e.note.trim())));
  const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
  const lsDel = k => { try { localStorage.removeItem(k); } catch(e){} };

  function normalize(raw){
    const out = {};
    Object.keys(raw || {}).forEach(code => {
      const v = raw[code];
      if (!v || typeof v !== 'object') return;
      out[code] = {fav: !!v.fav, made: !!v.made, rating: Number(v.rating) || 0,
                   note: typeof v.note === 'string' ? v.note : '', updatedAt: Number(v.updatedAt) || 1};
    });
    return out;
  }
  function readLegacy(){
    const raw = lsGet(LEGACY_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return normalize(parsed && (parsed.entries || parsed));
      } catch(e){ return {}; }
    }
    try {
      const old = JSON.parse(lsGet('fav-recepti') || '[]');
      if (Array.isArray(old)) {
        const out = {};
        old.forEach(code => { out[code] = {fav:true, made:false, rating:0, note:'', updatedAt:1}; });
        return out;
      }
    } catch(e){}
    return {};
  }

  const auth = {
    user: null, sdk: null, loading: null, resolved: false, listeners: [], queue: [],
    onChange(fn){ this.listeners.push(fn); },
    emit(){ this.listeners.forEach(fn => fn(this.user)); },
    get signedIn(){ return !!this.user; },
    get pending(){ return !this.resolved && !!lsGet(SIGNED_FLAG); },
    later(fn){
      this.queue.push(fn);
      this.load().catch(() => {});
    },
    flush(){
      const jobs = this.queue.slice();
      this.queue.length = 0;
      if (this.signedIn) jobs.forEach(fn => { try { fn(); } catch(e){} });
    },
    cachedProfile(){
      try { return JSON.parse(lsGet(USER_CACHE) || 'null'); } catch(e){ return null; }
    },
    async load(){
      if (this.loading) return this.loading;
      this.loading = (async () => {
        const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
        const [appMod, authMod, dbMod] = await Promise.all([
          import(base + 'firebase-app.js'),
          import(base + 'firebase-auth.js'),
          import(base + 'firebase-firestore.js')
        ]);
        const app = appMod.initializeApp(FIREBASE_CONFIG);
        const fbAuth = authMod.getAuth(app);
        try { await authMod.setPersistence(fbAuth, authMod.browserLocalPersistence); } catch(e){}
        const fs = dbMod.getFirestore(app);
        this.sdk = {authMod, dbMod, auth: fbAuth, fs};
        authMod.onAuthStateChanged(fbAuth, u => {
          this.user = u || null;
          this.resolved = true;
          if (u) {
            lsSet(SIGNED_FLAG, '1');
            lsSet(LAST_UID, u.uid);
            lsSet(USER_CACHE, JSON.stringify({name: u.displayName || '', photo: u.photoURL || ''}));
          } else {
            lsDel(SIGNED_FLAG);
            lsDel(USER_CACHE);
          }
          this.emit();
          store.onAuth(u);
          this.flush();
        });
        try { await authMod.getRedirectResult(fbAuth); } catch(e){}
        return this.sdk;
      })();
      return this.loading;
    },
    async signIn(){
      let sdk;
      try { sdk = await this.load(); }
      catch(e){ return {ok:false, error:'Ne mogu da učitam prijavu. Proverite internet vezu.'}; }
      const {authMod, auth: a} = sdk;
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({prompt: 'select_account'});
      try {
        await authMod.signInWithPopup(a, provider);
        return {ok:true};
      } catch(err){
        const code = err && err.code;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          try { await authMod.signInWithRedirect(a, provider); return {ok:true}; }
          catch(e2){ return {ok:false, error:'Prijava nije uspela. Pokušajte ponovo.'}; }
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return {ok:false};
        if (code === 'auth/unauthorized-domain') return {ok:false, error:'Ovaj domen nije dozvoljen u Firebase podešavanjima.'};
        return {ok:false, error:'Prijava nije uspela. Pokušajte ponovo.'};
      }
    },
    async signOut(){
      if (!this.sdk) return;
      try { await this.sdk.authMod.signOut(this.sdk.auth); } catch(e){}
    }
  };

  const store = {
    entries: {}, uid: null, unsub: null, listeners: [],
    onChange(fn){ this.listeners.push(fn); },
    emit(code){ this.listeners.forEach(fn => fn(code)); },
    get(code){ return Object.assign({}, EMPTY, this.entries[code] || {}); },
    countMade(){ return Object.values(this.entries).filter(e => e.made).length; },
    countFav(){ return Object.values(this.entries).filter(e => e.fav).length; },
    countRated(){ return Object.values(this.entries).filter(e => e.rating > 0).length; },
    countNote(){ return Object.values(this.entries).filter(e => e.note && e.note.trim()).length; },
    writeCache(){ if (this.uid) lsSet(cacheKey(this.uid), JSON.stringify({version:2, entries:this.entries})); },
    loadCache(uid){
      const raw = lsGet(cacheKey(uid));
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return normalize(parsed && (parsed.entries || parsed));
      } catch(e){ return {}; }
    },
    set(code, patch){
      if (!auth.signedIn) {
        if (auth.pending) { auth.later(() => this.set(code, patch)); return false; }
        requireSignIn();
        return false;
      }
      const next = Object.assign(this.get(code), patch, {updatedAt: Date.now()});
      this.entries[code] = next;
      this.writeCache();
      this.push(code, next);
      this.emit(code);
      return true;
    },
    merge(code, remote){
      const mine = this.entries[code];
      const incoming = normalize({x: remote}).x;
      if (!incoming) return false;
      if (mine && Number(mine.updatedAt || 0) >= incoming.updatedAt) return false;
      this.entries[code] = incoming;
      return true;
    },
    push(code, entry){
      if (!auth.sdk || !this.uid) return;
      const {dbMod, fs} = auth.sdk;
      try {
        dbMod.setDoc(dbMod.doc(fs, 'users', this.uid, 'marks', code), {
          code, fav: entry.fav, made: entry.made, rating: entry.rating,
          note: entry.note, updatedAt: entry.updatedAt
        }).catch(() => {});
      } catch(e){}
    },
    async onAuth(user){
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (!user) {
        this.uid = null;
        this.entries = {};
        this.emit();
        return;
      }
      this.uid = user.uid;
      this.entries = this.loadCache(user.uid);
      this.emit();
      const {dbMod, fs} = auth.sdk;
      const marks = dbMod.collection(fs, 'users', user.uid, 'marks');
      try {
        const snap = await dbMod.getDocs(marks);
        snap.forEach(d => this.merge(d.id, d.data() || {}));
        await this.migrateLegacy(user.uid, new Set(snap.docs.map(d => d.id)));
        this.writeCache();
        this.emit();
      } catch(e){}
      try {
        this.unsub = dbMod.onSnapshot(marks, snap => {
          let dirty = false;
          snap.forEach(d => { if (this.merge(d.id, d.data() || {})) dirty = true; });
          if (dirty) { this.writeCache(); this.emit(); }
        }, () => {});
      } catch(e){}
    },
    async migrateLegacy(uid, remoteCodes){
      if (lsGet(migratedKey(uid))) return 0;
      const legacy = readLegacy();
      let moved = 0;
      Object.keys(legacy).forEach(code => {
        const e = legacy[code];
        if (!isSet(e)) return;
        const mine = this.entries[code];
        if (mine && Number(mine.updatedAt || 0) >= Number(e.updatedAt || 0)) return;
        this.entries[code] = e;
        this.push(code, e);
        moved++;
      });
      lsSet(migratedKey(uid), String(Date.now()));
      if (moved) notify(`Preneto ${moved} zapisa sa ovog uređaja na vaš nalog.`);
      return moved;
    },
    async deleteAll(){
      if (!auth.sdk || !this.uid) return 0;
      const {dbMod, fs} = auth.sdk;
      const codes = Object.keys(this.entries);
      for (const code of codes) {
        try { await dbMod.deleteDoc(dbMod.doc(fs, 'users', this.uid, 'marks', code)); } catch(e){}
      }
      this.entries = {};
      this.writeCache();
      this.emit();
      return codes.length;
    }
  };


  /* ---------------- obaveštenja i prijava ---------------- */
  let toastEl = null, toastTimer = null;
  function notify(text){
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 4000);
  }

  const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true" class="gicon"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 14 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17.3z"/><path fill="#FBBC05" d="M10.4 28.2c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 15.9 0 19.8 0 23.5s1 7.6 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 47c6.2 0 11.5-2 15.3-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.8 2.2-6.4 0-11.7-4.5-13.6-10.5l-7.8 6.1C6.5 41.1 14.6 47 24 47z"/></svg>';
  let authDlg = null, authErr = null, signingIn = false;
  function buildAuthDialog(){
    if (authDlg) return authDlg;
    authDlg = document.createElement('dialog');
    authDlg.className = 'auth-dlg';
    authDlg.innerHTML = `<button class="auth-close" type="button" aria-label="Zatvori">×</button>
      <h2>Prijavite se</h2>
      <p>Da biste čuvali recepte, označavali šta ste napravili, davali ocenu i pisali beleške, prijavite se Google nalogom. Vaše beleške vidite samo vi, na svim uređajima.</p>
      <button class="google-btn" type="button">${GOOGLE_G}Nastavi preko Google naloga</button>
      <p class="auth-err" hidden></p>
      <p class="auth-fine">Čuvamo samo vaše ime sa Google naloga i ono što sami upišete uz recepte. Podatke možete obrisati u svakom trenutku.</p>`;
    document.body.appendChild(authDlg);
    authErr = authDlg.querySelector('.auth-err');
    authDlg.querySelector('.auth-close').addEventListener('click', () => authDlg.close());
    authDlg.addEventListener('click', ev => { if (ev.target === authDlg) authDlg.close(); });
    const btn = authDlg.querySelector('.google-btn');
    btn.addEventListener('click', async () => {
      if (signingIn) return;
      signingIn = true;
      btn.disabled = true;
      authErr.hidden = true;
      const res = await auth.signIn();
      signingIn = false;
      btn.disabled = false;
      if (res && res.ok) authDlg.close();
      else if (res && res.error) { authErr.textContent = res.error; authErr.hidden = false; }
    });
    return authDlg;
  }
  function requireSignIn(){
    const dlg = buildAuthDialog();
    auth.load().catch(() => {});
    if (!dlg.open) dlg.showModal();
  }

  function renderAuthSlot(){
    const slot = document.getElementById('authSlot');
    if (!slot) return;
    if (!auth.signedIn && auth.pending) {
      const c = auth.cachedProfile() || {};
      const nm = (c.name || 'Nalog').split(' ')[0];
      const ini = (c.name || 'N').trim().charAt(0).toUpperCase();
      slot.innerHTML = `<span class="user-chip pending">
          ${c.photo ? `<img class="avatar" src="${c.photo}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar avatar-ph">${ini}</span>`}
          <span class="uname">${nm}</span>
        </span>`;
      return;
    }
    if (auth.signedIn) {
      const u = auth.user;
      const name = (u.displayName || 'Nalog').split(' ')[0];
      const initial = (u.displayName || 'N').trim().charAt(0).toUpperCase();
      slot.innerHTML = `<span class="user-chip">
          ${u.photoURL ? `<img class="avatar" src="${u.photoURL}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar avatar-ph">${initial}</span>`}
          <span class="uname">${name}</span>
          <button class="link-btn" type="button" data-signout>Odjava</button>
        </span>`;
      const img = slot.querySelector('img.avatar');
      if (img) img.addEventListener('error', () => {
        img.replaceWith(Object.assign(document.createElement('span'), {className:'avatar avatar-ph', textContent:initial}));
      });
      slot.querySelector('[data-signout]').addEventListener('click', () => auth.signOut());
    } else {
      slot.innerHTML = '<button class="signin-btn" type="button">Prijava</button>';
      slot.querySelector('button').addEventListener('click', requireSignIn);
    }
  }

  function initAuth(){
    renderAuthSlot();
    auth.onChange(() => { renderAuthSlot(); });
    if (lsGet(SIGNED_FLAG)) auth.load().catch(() => {});
  }

  if (lsGet(SIGNED_FLAG)) {
    const lastUid = lsGet(LAST_UID);
    if (lastUid) {
      store.uid = lastUid;
      store.entries = store.loadCache(lastUid);
    }
  }

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
    let lockNote = mine.querySelector('.mine-lock');
    if (!lockNote) {
      lockNote = document.createElement('p');
      lockNote.className = 'mine-lock';
      lockNote.innerHTML = 'Prijavite se da biste čuvali oznake, ocenu i belešku. <button class="link-btn" type="button">Prijava</button>';
      mine.appendChild(lockNote);
    }
    mine.addEventListener('click', ev => {
      if (auth.signedIn || auth.pending) return;
      ev.preventDefault();
      ev.stopPropagation();
      requireSignIn();
    }, true);
    const sync = () => {
      const e = store.get(code);
      const locked = !auth.signedIn && !auth.pending;
      mine.classList.toggle('locked', locked);
      lockNote.hidden = !locked;
      if (noteField) noteField.readOnly = locked;
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
  function applyRecipe(article, r){
    const h1 = article.querySelector('h1');
    if (h1 && r.title) {
      h1.textContent = r.title;
      document.title = `${r.title} · Recepti Jelene Dosković`;
    }
    const intro = article.querySelector('.intro');
    if (intro) { intro.textContent = r.intro || ''; intro.hidden = !r.intro; }
    const steps = article.querySelector('.steps');
    if (steps) steps.textContent = r.steps || '';
    const raw = article.querySelector('details pre');
    if (raw) raw.textContent = r.raw || '';
    const ul = article.querySelector('.ing-list');
    if (ul && Array.isArray(r.ingredients)) {
      ul.innerHTML = r.ingredients.map((i, idx) => i.t === 'h'
        ? `<li class="h">${esc(i.x)}</li>`
        : `<li><input type="checkbox" id="ing-${idx}"><label for="ing-${idx}">${esc(i.x)}</label></li>`).join('');
    }
  }
  async function refreshRecipe(article){
    const slug = article.dataset.slug;
    if (!slug) return;
    try {
      const version = await catalogVersion();
      if (!version || version === BUILT_VERSION) return;
      const [r, freshTags] = await Promise.all([
        fsGet(`recipes/${encodeURIComponent(slug)}`),
        fetchTags().catch(() => null)
      ]);
      if (freshTags) applyTags(freshTags);
      if (r && r.title) applyRecipe(article, r);
      if (r && Array.isArray(r.tags)) applyRecipeTags(article, r.tags);
    } catch(e){}
  }
  function applyRecipeTags(article, list){
    const box = article.querySelector('.tag-chips');
    if (box) {
      box.innerHTML = list.map(t =>
        `<a class="tag-chip" href="${BASE}?tag=${encodeURIComponent(t)}">${esc(TAG_NAME[t] || t)}</a>`).join('');
    }
    const crumb = document.getElementById('crumbTag');
    if (crumb && list.length) {
      crumb.textContent = TAG_NAME[list[0]] || list[0];
      crumb.href = `${BASE}?tag=${encodeURIComponent(list[0])}`;
    }
  }
  function initRecipePage(){
    const article = document.querySelector('.recipe');
    if (!article) return;
    const code = article.dataset.code;
    const sync = wireMine(article, code);
    wireQuickActs(article, code);
    store.onChange(() => { if (sync) sync(); });
    auth.onChange(() => { if (sync) sync(); });
    initAuth();
    refreshRecipe(article);
  }

  /* ---------------- spisak recepata ---------------- */
  function initIndex(){
    const params = new URLSearchParams(location.search);
    let state = {
      q: params.get('q') || '',
      tag: params.get('tag') || '',
      sort: 'new',
      favOnly: params.get('sacuvani') === '1',
      madeOnly: params.get('napravljeni') === '1',
      shown: PAGE_SIZE
    };


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
    const cardEls = new Map();

    const tagCounts = {};
    function countTags(){
      Object.keys(tagCounts).forEach(k => delete tagCounts[k]);
      recipes.forEach(r => (r.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    }
    countTags();
    let featuredRecipe = recipes.find(r => r.featured) || recipes.find(r => r.img) || recipes[0];

    let navEls = [], tileEls = [];
    function buildNav(){
      nav.innerHTML = '';
      navEls = [];
      [{slug:'', name:'Sve'}].concat(TAGS).forEach(t => {
        const b = document.createElement('button');
        b.className = 'nav-btn';
        b.type = 'button';
        b.innerHTML = `${esc(t.name)}<i>${t.slug ? (tagCounts[t.slug] || 0) : recipes.length}</i>`;
        b.addEventListener('click', () => { state.tag = t.slug; state.shown = PAGE_SIZE; update(); });
        nav.appendChild(b);
        navEls.push({el:b, tag:t.slug});
      });
    }
    function buildTiles(){
      tilesGrid.innerHTML = '';
      tileEls = [];
      TAGS.filter(t => t.slug !== 'ostalo').forEach(t => {
        const pick = recipes.find(r => (r.tags || []).includes(t.slug) && r.img);
        const b = document.createElement('button');
        b.className = 'tile';
        b.type = 'button';
        b.innerHTML = `${pick && pick.img ? `<img src="${pick.img}" alt="" loading="lazy" decoding="async">` : ''}<span>${esc(t.name)}</span>`;
        b.addEventListener('click', () => { state.tag = state.tag === t.slug ? '' : t.slug; state.shown = PAGE_SIZE; update(); });
        tilesGrid.appendChild(b);
        tileEls.push({el:b, tag:t.slug});
      });
    }
    buildNav();
    buildTiles();

    function filtered(){
      const terms = fold(state.q.trim()) ? fold(state.q.trim()).split(/\s+/) : [];
      const list = recipes.filter(r => {
        const e = store.entries[r.code];
        if (state.tag && !(r.tags || []).includes(state.tag)) return false;
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
      navEls.forEach(n => n.el.setAttribute('aria-pressed', String(state.tag === n.tag)));
      tileEls.forEach(t => t.el.setAttribute('aria-pressed', String(state.tag === t.tag)));
    }

    function syncUrl(){
      const p = new URLSearchParams();
      if (state.q.trim()) p.set('q', state.q.trim());
      if (state.tag) p.set('tag', state.tag);
      if (state.favOnly) p.set('sacuvani', '1');
      if (state.madeOnly) p.set('napravljeni', '1');
      const qs = p.toString();
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    }

    function update(changedCode){
      const browsing = !state.q.trim() && !state.tag && !state.favOnly && !state.madeOnly;
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
      if (state.tag) parts.push(TAG_NAME[state.tag] || state.tag);
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

    const syncNoteEl = document.getElementById('syncNote');
    const deleteBtn = document.getElementById('deleteDataBtn');
    function syncAccountPanel(){
      if (syncNoteEl) {
        syncNoteEl.textContent = auth.signedIn
          ? `Prijavljeni ste kao ${auth.user.displayName || 'korisnik'}. Oznake, ocene i beleške čuvaju se na vašem nalogu i vidite ih na svim uređajima.`
          : 'Prijavite se Google nalogom da biste čuvali oznake, ocene i beleške.';
      }
      if (deleteBtn) deleteBtn.hidden = !auth.signedIn;
    }
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      if (!auth.signedIn) { requireSignIn(); return; }
      const n = Object.keys(store.entries).filter(c => isSet(store.entries[c])).length;
      if (!n) { notify('Nemate sačuvanih oznaka ni beleški.'); return; }
      if (!confirm(`Trajno obrisati svih ${n} vaših zapisa sa naloga? Ovo se ne može poništiti.`)) return;
      deleteBtn.disabled = true;
      const removed = await store.deleteAll();
      deleteBtn.disabled = false;
      notify(`Obrisano ${removed} zapisa.`);
    });

    store.onChange(code => update(code));
    update();
    refreshCatalog();
    auth.onChange(() => { syncAccountPanel(); update(); });
    initAuth();
    syncAccountPanel();
  }

  if (PAGE === 'recipe') initRecipePage();
  else initIndex();
})();

(function(){
  const FB_VERSION = "12.4.0";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBBtAbgKkqX4NK-mD9nK-1IEiKSkNK10TI",
    authDomain: "jelenadoskovic.firebaseapp.com",
    projectId: "jelenadoskovic",
    storageBucket: "jelenadoskovic.firebasestorage.app",
    messagingSenderId: "1094516599117",
    appId: "1:1094516599117:web:decde32807130dc1e02f04"
  };
  const OWNER_EMAIL = "doske1992@gmail.com";

  const $ = id => document.getElementById(id);
  const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fold = s => (s||'').toLowerCase().replace(/č|ć/g,'c').replace(/š/g,'s').replace(/ž/g,'z').replace(/đ/g,'dj').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const fmtDate = d => { const p = (d||'').split('-'); return p.length === 3 ? `${+p[2]}. ${+p[1]}. ${p[0]}.` : ''; };
  function slugify(text){
    const map = {'đ':'dj','č':'c','ć':'c','š':'s','ž':'z'};
    return (text||'').toLowerCase().replace(/[đčćšž]/g, c => map[c])
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/-{2,}/g,'-').replace(/^-|-$/g,'');
  }

  let fb = null, user = null, isAdmin = false;
  let tags = [], catalog = [], chunkCache = {}, current = null, dirty = false;

  function status(text, kind){
    const el = $('status');
    el.textContent = text || '';
    el.className = 'admin-status' + (kind ? ' ' + kind : '');
    if (text) { clearTimeout(status._t); status._t = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 5000); }
  }

  async function loadSdk(){
    if (fb) return fb;
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
    const [appMod, authMod, dbMod] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js')
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch(e){}
    fb = {authMod, dbMod, auth, fs: dbMod.getFirestore(app)};
    return fb;
  }

  async function checkAdmin(u){
    if (!u) return false;
    if (u.email === OWNER_EMAIL) return true;
    try {
      const snap = await fb.dbMod.getDoc(fb.dbMod.doc(fb.fs, 'admins', u.uid));
      return snap.exists();
    } catch(e){ return false; }
  }

  async function loadTags(){
    const {dbMod, fs} = fb;
    const snap = await dbMod.getDocs(dbMod.query(dbMod.collection(fs, 'tags'), dbMod.orderBy('order')));
    tags = snap.docs.map(d => Object.assign({slug: d.id}, d.data()));
  }

  async function loadCatalog(){
    const {dbMod, fs} = fb;
    const meta = await dbMod.getDoc(dbMod.doc(fs, 'catalog', 'meta'));
    const chunks = (meta.data() || {}).chunks || 1;
    chunkCache = {};
    catalog = [];
    for (let i = 0; i < chunks; i++) {
      const snap = await dbMod.getDoc(dbMod.doc(fs, 'catalog', `chunk-${i}`));
      const data = snap.data() || {};
      let items = [];
      try { items = JSON.parse(data.json || '[]'); } catch(e){}
      chunkCache[i] = items;
      items.forEach(x => catalog.push(Object.assign({chunk: i}, x)));
    }
    catalog.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  async function bumpVersion(){
    const {dbMod, fs} = fb;
    const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await dbMod.updateDoc(dbMod.doc(fs, 'catalog', 'meta'), {version: v, updatedAt: new Date().toISOString()});
  }

  async function writeChunk(index){
    const {dbMod, fs} = fb;
    await dbMod.updateDoc(dbMod.doc(fs, 'catalog', `chunk-${index}`), {
      json: JSON.stringify(chunkCache[index]),
      count: chunkCache[index].length
    });
  }

  async function adjustTagCounts(added, removed){
    const {dbMod, fs} = fb;
    const jobs = [];
    added.forEach(slug => jobs.push(dbMod.updateDoc(dbMod.doc(fs, 'tags', slug), {count: dbMod.increment(1)})));
    removed.forEach(slug => jobs.push(dbMod.updateDoc(dbMod.doc(fs, 'tags', slug), {count: dbMod.increment(-1)})));
    await Promise.all(jobs.map(p => p.catch(() => {})));
    await loadTags();
  }

  /* ---------------- spisak recepata ---------------- */
  function renderList(){
    const q = fold($('adminSearch').value.trim());
    const tagFilter = $('adminTagFilter').value;
    const rows = catalog.filter(r => {
      if (tagFilter && !(r.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      return fold(r.title).includes(q) || (r.hay || '').includes(q);
    });
    $('listCount').textContent = `${rows.length} od ${catalog.length}`;
    $('adminList').innerHTML = rows.slice(0, 200).map(r => `
      <button class="arow${current && current.slug === r.slug ? ' on' : ''}" type="button" data-slug="${esc(r.slug)}">
        <span class="arow-title">${esc(r.title)}</span>
        <span class="arow-meta">${fmtDate(r.date)} · ${(r.tags || []).map(t => esc(tagName(t))).join(', ') || 'bez taga'}</span>
      </button>`).join('') || '<p class="admin-empty">Nema recepata za taj upit.</p>';
    $('adminList').querySelectorAll('.arow').forEach(b => {
      b.addEventListener('click', () => openRecipe(b.dataset.slug));
    });
  }
  const tagName = slug => (tags.find(t => t.slug === slug) || {}).name || slug;

  /* ---------------- uređivanje recepta ---------------- */
  function ingredientsToText(list){
    return (list || []).map(i => i.t === 'h' ? '# ' + i.x : i.x).join('\n');
  }
  function textToIngredients(text){
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => l.startsWith('# ') ? {t: 'h', x: l.slice(2).trim()} : {t: 'i', x: l});
  }

  async function openRecipe(slug){
    if (dirty && !confirm('Imate nesačuvane izmene. Nastaviti bez čuvanja?')) return;
    status('Učitavam…');
    const {dbMod, fs} = fb;
    const snap = await dbMod.getDoc(dbMod.doc(fs, 'recipes', slug));
    if (!snap.exists()) { status('Recept ne postoji.', 'err'); return; }
    current = Object.assign({slug}, snap.data());
    dirty = false;
    status('');
    renderEditor();
    renderList();
  }

  function renderEditor(){
    const r = current;
    if (!r) { $('editor').hidden = true; $('editorEmpty').hidden = false; return; }
    $('editorEmpty').hidden = true;
    $('editor').hidden = false;
    $('fTitle').value = r.title || '';
    $('fIntro').value = r.intro || '';
    $('fIngredients').value = ingredientsToText(r.ingredients);
    $('fSteps').value = r.steps || '';
    $('fImg').value = r.imgUrl || '';
    $('editorSlug').textContent = r.slug;
    $('editorLink').href = `../recept/${r.slug}/`;
    $('editorPost').href = r.url || '#';
    $('fTags').innerHTML = tags.map(t => `
      <label class="tag-pick"><input type="checkbox" value="${esc(t.slug)}"${(r.tags || []).includes(t.slug) ? ' checked' : ''}> ${esc(t.name)}</label>`).join('');
    updatePreview();
    $('editor').querySelectorAll('input, textarea').forEach(el => {
      el.addEventListener('input', () => { dirty = true; if (el.id === 'fImg') updatePreview(); });
    });
  }

  function updatePreview(){
    const url = $('fImg').value.trim();
    const fallback = current && current.hasImg ? `../img/${current.code}.jpg` : '';
    const src = url || fallback;
    const box = $('imgPreview');
    box.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span class="admin-note">Nema slike</span>';
    $('imgSource').textContent = url ? 'sopstvena adresa' : (fallback ? 'slika sa Instagrama' : '');
  }

  async function saveRecipe(){
    if (!current) return;
    const title = $('fTitle').value.trim();
    if (!title) { status('Naslov ne sme biti prazan.', 'err'); return; }
    const picked = Array.from($('fTags').querySelectorAll('input:checked')).map(i => i.value);
    const before = current.tags || [];
    const added = picked.filter(t => !before.includes(t));
    const removed = before.filter(t => !picked.includes(t));
    const imgUrl = $('fImg').value.trim();

    const patch = {
      title,
      intro: $('fIntro').value,
      steps: $('fSteps').value,
      ingredients: textToIngredients($('fIngredients').value),
      tags: picked,
      imgUrl: imgUrl,
      n: textToIngredients($('fIngredients').value).filter(i => i.t === 'i').length,
      editedAt: new Date().toISOString()
    };

    $('saveBtn').disabled = true;
    status('Čuvam…');
    try {
      const {dbMod, fs} = fb;
      await dbMod.updateDoc(dbMod.doc(fs, 'recipes', current.slug), patch);

      const chunk = typeof current.chunk === 'number' ? current.chunk : null;
      if (chunk !== null && chunkCache[chunk]) {
        const items = chunkCache[chunk];
        const i = items.findIndex(x => x.slug === current.slug);
        if (i >= 0) {
          items[i].title = title;
          items[i].tags = picked;
          items[i].n = patch.n;
          if (imgUrl) items[i].img = imgUrl;
          else if (current.hasImg) items[i].img = `img/${current.code}.jpg`;
          else delete items[i].img;
          await writeChunk(chunk);
        }
      }
      if (added.length || removed.length) await adjustTagCounts(added, removed);
      await bumpVersion();

      Object.assign(current, patch);
      const inList = catalog.find(x => x.slug === current.slug);
      if (inList) { inList.title = title; inList.tags = picked; }
      dirty = false;
      renderList();
      renderTagsView();
      status('Sačuvano.', 'ok');
    } catch(err){
      status('Čuvanje nije uspelo: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
    $('saveBtn').disabled = false;
  }

  async function deleteRecipe(){
    if (!current) return;
    if (!confirm(`Trajno obrisati recept „${current.title}“? Ovo se ne može poništiti.`)) return;
    $('deleteBtn').disabled = true;
    status('Brišem…');
    try {
      const {dbMod, fs} = fb;
      await dbMod.deleteDoc(dbMod.doc(fs, 'recipes', current.slug));
      const chunk = typeof current.chunk === 'number' ? current.chunk : null;
      if (chunk !== null && chunkCache[chunk]) {
        const items = chunkCache[chunk];
        const i = items.findIndex(x => x.slug === current.slug);
        if (i >= 0) { items.splice(i, 1); await writeChunk(chunk); }
      }
      if ((current.tags || []).length) await adjustTagCounts([], current.tags);
      await bumpVersion();
      catalog = catalog.filter(x => x.slug !== current.slug);
      current = null;
      dirty = false;
      renderEditor();
      renderList();
      renderTagsView();
      status('Recept obrisan.', 'ok');
    } catch(err){
      status('Brisanje nije uspelo: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
    $('deleteBtn').disabled = false;
  }

  /* ---------------- tagovi ---------------- */
  function renderTagsView(){
    $('tagList').innerHTML = tags.map(t => `
      <div class="tag-row">
        <span class="tag-row-name">${esc(t.name)}</span>
        <code>${esc(t.slug)}</code>
        <span class="tag-row-count">${t.count || 0}</span>
        <button class="link-btn" type="button" data-del="${esc(t.slug)}"${(t.count || 0) > 0 ? ' disabled title="Tag se koristi, prvo ga sklonite sa recepata"' : ''}>Obriši</button>
      </div>`).join('');
    $('tagList').querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => deleteTag(b.dataset.del));
    });
    const sel = $('adminTagFilter');
    const keep = sel.value;
    sel.innerHTML = '<option value="">Svi tagovi</option>' + tags.map(t => `<option value="${esc(t.slug)}">${esc(t.name)} (${t.count || 0})</option>`).join('');
    sel.value = keep;
  }

  async function addTag(){
    const name = $('newTagName').value.trim();
    if (!name) { status('Upišite naziv taga.', 'err'); return; }
    const slug = slugify(name);
    if (!slug) { status('Naziv nije upotrebljiv.', 'err'); return; }
    if (tags.some(t => t.slug === slug)) { status('Tag sa tom adresom već postoji.', 'err'); return; }
    $('addTagBtn').disabled = true;
    try {
      const {dbMod, fs} = fb;
      const order = tags.length ? Math.max(...tags.map(t => t.order || 0)) + 1 : 0;
      await dbMod.setDoc(dbMod.doc(fs, 'tags', slug), {slug, name, order, count: 0});
      await loadTags();
      await bumpVersion();
      renderTagsView();
      if (current) renderEditor();
      $('newTagName').value = '';
      status(`Tag „${name}“ dodat.`, 'ok');
    } catch(err){
      status('Dodavanje nije uspelo: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
    $('addTagBtn').disabled = false;
  }

  async function deleteTag(slug){
    const t = tags.find(x => x.slug === slug);
    if (!t) return;
    if ((t.count || 0) > 0) { status('Tag se koristi na receptima.', 'err'); return; }
    if (!confirm(`Obrisati tag „${t.name}“?`)) return;
    try {
      const {dbMod, fs} = fb;
      await dbMod.deleteDoc(dbMod.doc(fs, 'tags', slug));
      await loadTags();
      await bumpVersion();
      renderTagsView();
      if (current) renderEditor();
      status('Tag obrisan.', 'ok');
    } catch(err){
      status('Brisanje nije uspelo: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
  }

  /* ---------------- prijava i pokretanje ---------------- */
  async function start(){
    status('Učitavam podatke…');
    await Promise.all([loadTags(), loadCatalog()]);
    renderTagsView();
    renderList();
    renderEditor();
    status('');
    $('adminApp').hidden = false;
    $('gate').hidden = true;
  }

  function showGate(message){
    $('adminApp').hidden = true;
    $('gate').hidden = false;
    $('gateMsg').textContent = message || '';
  }

  async function init(){
    $('signInBtn').addEventListener('click', async () => {
      $('signInBtn').disabled = true;
      try {
        const {authMod, auth} = await loadSdk();
        const provider = new authMod.GoogleAuthProvider();
        provider.setCustomParameters({prompt: 'select_account'});
        await authMod.signInWithPopup(auth, provider);
      } catch(err){
        const code = err && err.code;
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          $('gateMsg').textContent = 'Prijava nije uspela: ' + (code || 'greška');
        }
      }
      $('signInBtn').disabled = false;
    });
    $('signOutBtn').addEventListener('click', async () => {
      if (fb) await fb.authMod.signOut(fb.auth);
    });
    $('adminSearch').addEventListener('input', renderList);
    $('adminTagFilter').addEventListener('change', renderList);
    $('saveBtn').addEventListener('click', saveRecipe);
    $('deleteBtn').addEventListener('click', deleteRecipe);
    $('addTagBtn').addEventListener('click', addTag);
    $('newTagName').addEventListener('keydown', ev => { if (ev.key === 'Enter') addTag(); });
    document.querySelectorAll('.admin-tab').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        document.querySelectorAll('.admin-view').forEach(v => { v.hidden = v.dataset.view !== b.dataset.tab; });
      });
    });
    window.addEventListener('beforeunload', ev => {
      if (dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });

    const {authMod, auth} = await loadSdk();
    authMod.onAuthStateChanged(auth, async u => {
      user = u || null;
      if (!user) {
        isAdmin = false;
        $('whoami').textContent = '';
        $('signOutBtn').hidden = true;
        showGate('');
        return;
      }
      $('whoami').textContent = user.email || '';
      $('signOutBtn').hidden = false;
      isAdmin = await checkAdmin(user);
      if (!isAdmin) {
        showGate(`Nalog ${user.email} nema pristup ovoj stranici.`);
        return;
      }
      try { await start(); }
      catch(err){ showGate('Podaci se ne mogu učitati: ' + (err && err.code ? err.code : 'greška')); }
    });
  }

  init();
})();

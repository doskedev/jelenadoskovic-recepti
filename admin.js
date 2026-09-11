(function(){
  const FB_VERSION = "12.4.0";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBBtAbgKkqX4NK-mD9nK-1IEiKSkNK10TI",
    authDomain: "jelenadoskovic.com",
    projectId: "jelenadoskovic",
    storageBucket: "jelenadoskovic.firebasestorage.app",
    messagingSenderId: "1094516599117",
    appId: "1:1094516599117:web:decde32807130dc1e02f04"
  };
  const OWNER_EMAIL = "doske1992@gmail.com";
  const ADMIN = window.ADMIN || {};
  const PAGE = ADMIN.page || 'recipes';
  const BASE = ADMIN.base || '../';

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
  const imgSrc = path => !path ? '' : (/^https?:/i.test(path) ? path : BASE + path);

  let fb = null, user = null;
  let tags = [], catalog = [], chunkCache = {}, current = null, dirty = false;

  function status(text, kind){
    const el = $('status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'a-status' + (kind ? ' ' + kind : '');
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
      let items = [];
      try { items = JSON.parse((snap.data() || {}).json || '[]'); } catch(e){}
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

  const tagName = slug => (tags.find(t => t.slug === slug) || {}).name || slug;

  /* ================= stranica recepata ================= */
  function visibleRows(){
    const q = fold($('adminSearch').value.trim());
    const tagFilter = $('adminTagFilter').value;
    return catalog.filter(r => {
      if (tagFilter && !(r.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      return fold(r.title).includes(q) || (r.hay || '').includes(q);
    });
  }

  function renderList(){
    const rows = visibleRows();
    const shown = rows.slice(0, 120);
    $('listCount').textContent = rows.length === catalog.length
      ? `${catalog.length} recepata`
      : `${rows.length} od ${catalog.length}`;
    $('adminList').innerHTML = shown.map(r => {
      const src = imgSrc(r.img);
      const on = current && current.slug === r.slug;
      return `<button class="a-row${on ? ' on' : ''}" type="button" data-slug="${esc(r.slug)}">
        ${src ? `<img class="a-row-img" src="${esc(src)}" alt="" loading="lazy" decoding="async">` : '<span class="a-row-img ph"></span>'}
        <span class="a-row-text">
          <span class="a-row-title">${esc(r.title)}</span>
          <span class="a-row-meta">${fmtDate(r.date)} · ${(r.tags || []).map(t => esc(tagName(t))).join(', ') || 'bez taga'}</span>
        </span>
      </button>`;
    }).join('') || '<p class="a-empty"><strong>Nema rezultata</strong>Probajte kraću reč.</p>';
    if (rows.length > shown.length) {
      $('adminList').insertAdjacentHTML('beforeend',
        `<p class="a-more-note">Prikazano prvih ${shown.length}. Suzite pretragu da vidite ostale.</p>`);
    }
    $('adminList').querySelectorAll('.a-row').forEach(b => {
      b.addEventListener('click', () => openRecipe(b.dataset.slug));
    });
  }

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
    if (window.matchMedia('(max-width:1000px)').matches) {
      const box = document.querySelector('.a-editor');
      if (box) box.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  function renderTagPicks(){
    const picked = (current && current.tags) || [];
    $('fTags').innerHTML = tags.map(t => {
      const on = picked.includes(t.slug);
      return `<label class="a-pick${on ? ' on' : ''}"><input type="checkbox" value="${esc(t.slug)}"${on ? ' checked' : ''}><span>${esc(t.name)}</span></label>`;
    }).join('') || '<p class="a-hint">Još nema tagova.</p>';
    $('fTags').querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        inp.closest('.a-pick').classList.toggle('on', inp.checked);
        dirty = true;
      });
    });
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
    $('editorLink').href = `${BASE}recept/${r.slug}/`;
    $('editorPost').href = r.url || '#';
    renderTagPicks();
    updatePreview();
  }

  function updatePreview(){
    const url = $('fImg').value.trim();
    const fallback = current && current.hasImg ? `${BASE}img/${current.code}.jpg` : '';
    const src = url || fallback;
    $('imgPreview').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span>Nema slike</span>';
    $('imgSource').textContent = url ? 'Pregled, sopstvena adresa' : (fallback ? 'Pregled, slika sa Instagrama' : 'Pregled');
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
    const ingredients = textToIngredients($('fIngredients').value);

    const patch = {
      title,
      intro: $('fIntro').value,
      steps: $('fSteps').value,
      ingredients,
      tags: picked,
      imgUrl,
      n: ingredients.filter(i => i.t === 'i').length,
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
      if (inList) { inList.title = title; inList.tags = picked; if (imgUrl) inList.img = imgUrl; }
      dirty = false;
      fillTagFilter();
      renderList();
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
      fillTagFilter();
      renderList();
      status('Recept obrisan.', 'ok');
    } catch(err){
      status('Brisanje nije uspelo: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
    $('deleteBtn').disabled = false;
  }

  function fillTagFilter(){
    const sel = $('adminTagFilter');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">Svi tagovi</option>' +
      tags.map(t => `<option value="${esc(t.slug)}">${esc(t.name)} (${t.count || 0})</option>`).join('');
    sel.value = keep;
  }

  function initRecipesPage(){
    ['fTitle', 'fIntro', 'fIngredients', 'fSteps', 'fImg'].forEach(id => {
      $(id).addEventListener('input', () => {
        dirty = true;
        if (id === 'fImg') updatePreview();
      });
    });
    let t;
    $('adminSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderList, 120); });
    $('adminSearch').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        const first = visibleRows()[0];
        if (first) openRecipe(first.slug);
      }
    });
    $('adminTagFilter').addEventListener('change', renderList);
    $('saveBtn').addEventListener('click', saveRecipe);
    $('deleteBtn').addEventListener('click', deleteRecipe);
  }

  /* ================= stranica tagova ================= */
  function renderTagsView(){
    const box = $('tagList');
    if (!box) return;
    box.innerHTML = tags.map(t => `
      <div class="a-trow" data-slug="${esc(t.slug)}">
        <input class="a-input a-tname" type="text" value="${esc(t.name)}" maxlength="60" aria-label="Naziv taga">
        <span class="a-tslug">${esc(t.slug)}</span>
        <span class="a-tcount" title="Broj recepata sa ovim tagom">${t.count || 0}</span>
        <span class="a-trow-actions">
          <button class="a-btn small" type="button" data-rename hidden>Sačuvaj</button>
          <button class="a-btn ghost" type="button" data-del${(t.count || 0) > 0 ? ' disabled title="Tag se koristi na receptima"' : ''}>Obriši</button>
        </span>
      </div>`).join('') || '<p class="a-empty"><strong>Još nema tagova</strong>Dodajte prvi tag iznad.</p>';

    box.querySelectorAll('.a-trow').forEach(row => {
      const slug = row.dataset.slug;
      const input = row.querySelector('.a-tname');
      const saveBtn = row.querySelector('[data-rename]');
      const original = (tags.find(x => x.slug === slug) || {}).name || '';
      input.addEventListener('input', () => {
        saveBtn.hidden = input.value.trim() === original || !input.value.trim();
      });
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && !saveBtn.hidden) renameTag(slug, input.value.trim());
      });
      saveBtn.addEventListener('click', () => renameTag(slug, input.value.trim()));
      row.querySelector('[data-del]').addEventListener('click', () => deleteTag(slug));
    });
  }

  async function renameTag(slug, name){
    if (!name) return;
    status('Čuvam…');
    try {
      const {dbMod, fs} = fb;
      await dbMod.updateDoc(dbMod.doc(fs, 'tags', slug), {name});
      await loadTags();
      await bumpVersion();
      renderTagsView();
      status('Naziv promenjen.', 'ok');
    } catch(err){
      status('Promena nije uspela: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
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
      $('newTagName').value = '';
      $('newTagName').focus();
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
      status('Tag obrisan.', 'ok');
    } catch(err){
      status('Brisanje nije uspelo: ' + (err && err.code ? err.code : 'greška'), 'err');
    }
  }

  function initTagsPage(){
    $('addTagBtn').addEventListener('click', addTag);
    $('newTagName').addEventListener('keydown', ev => { if (ev.key === 'Enter') addTag(); });
  }

  /* ================= prijava ================= */
  async function start(){
    status('Učitavam…');
    if (PAGE === 'tags') {
      await loadTags();
      renderTagsView();
    } else {
      await Promise.all([loadTags(), loadCatalog()]);
      fillTagFilter();
      renderList();
      renderEditor();
    }
    status('');
    $('gate').hidden = true;
    $('adminApp').hidden = false;
    $('tabs').hidden = false;
    const search = $('adminSearch');
    if (search) search.focus();
  }

  function showGate(message){
    $('adminApp').hidden = true;
    $('gate').hidden = false;
    $('tabs').hidden = true;
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
    $('signOutBtn').addEventListener('click', async () => { if (fb) await fb.authMod.signOut(fb.auth); });
    if (PAGE === 'tags') initTagsPage(); else initRecipesPage();
    window.addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });

    const {authMod, auth} = await loadSdk();
    authMod.onAuthStateChanged(auth, async u => {
      user = u || null;
      if (!user) {
        $('whoami').textContent = '';
        $('signOutBtn').hidden = true;
        showGate('');
        return;
      }
      $('whoami').textContent = user.email || '';
      $('signOutBtn').hidden = false;
      if (!(await checkAdmin(user))) {
        showGate(`Nalog ${user.email} nema pristup ovoj stranici.`);
        return;
      }
      try { await start(); }
      catch(err){ showGate('Podaci se ne mogu učitati: ' + (err && err.code ? err.code : 'greška')); }
    });
  }

  init();
})();

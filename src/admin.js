/* ═══════════════════════════════════════════════════════════════════════════
   admin.js — panel oculto para editar sets, galería y biografía.

   No hay botón ni link a esto en ningún lado del sitio: se entra poniendo
   #admin al final de la URL (ej. tudominio.com/#admin). Adentro pide una
   contraseña — cámbiala aquí abajo, es la única línea que importa:
   ═══════════════════════════════════════════════════════════════════════════ */
const PASSWORD = 'honn3y2026';
/* ═══════════════════════════════════════════════════════════════════════════
   El check es en el navegador, sin backend detrás (igual que el admin de
   PIPRO) — suficiente para un sitio de un solo dueño, no es seguridad real:
   cualquiera que vea el código fuente puede leer la contraseña. Si algún día
   esto necesita proteger algo sensible, hace falta Supabase Auth de verdad.

   Todo lo que escribe el admin (título de un set, la bio, un caption de
   foto) termina en innerHTML de la página pública — por eso esc() escapa
   TODO antes de insertarlo, aquí y en main.js. No lo quites.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  fetchSetsRaw, insertSet, updateSet, deleteSet,
  fetchGallery, insertGalleryItem, updateGalleryItem, deleteGalleryItem,
  fetchMeta, upsertMeta,
  uploadFile, deleteFile,
} from './supabase-client.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let panelEl = null;
let authed = false;

function injectStyle() {
  if (document.getElementById('apStyle')) return;
  const s = document.createElement('style');
  s.id = 'apStyle';
  s.textContent = `
#adminPanel{position:fixed;inset:0;z-index:9000;background:#0a0a0ad9;backdrop-filter:blur(6px);
  display:none;place-items:center;padding:24px;font-family:'Space Mono',ui-monospace,monospace;color:#eae8e3}
#adminPanel.open{display:grid}
#adminPanel *{box-sizing:border-box}
.ap-gate{background:#141414;border:1px solid #2f2f2f;padding:32px;width:min(360px,100%);text-align:center}
.ap-gate b{display:block;letter-spacing:.14em;font-size:13px;margin-bottom:18px;color:#e2a52f}
.ap-gate input{width:100%;background:#0c0c0c;border:1px solid #2f2f2f;color:#eae8e3;padding:10px;font:inherit;margin-bottom:10px}
.ap-gate button{width:100%;background:#e2a52f;color:#060606;border:0;padding:10px;font:inherit;font-weight:700;cursor:pointer;margin-bottom:8px}
.ap-gate .ap-cancel{background:none;color:#5a5a5a;text-decoration:underline;padding:4px}
.ap-err{color:#c0553e;font-size:11px;margin:4px 0}
.ap-panel{background:#0c0c0c;border:1px solid #2f2f2f;width:min(920px,100%);height:min(720px,90vh);
  display:flex;flex-direction:column;overflow:hidden}
.ap-panel header{display:flex;align-items:center;gap:16px;padding:14px 18px;border-bottom:1px solid #2f2f2f;flex-shrink:0}
.ap-panel header b{color:#e2a52f;letter-spacing:.1em;font-size:12px}
.ap-panel nav{display:flex;gap:8px;flex:1}
.ap-panel nav button{padding:6px 14px;border:1px solid #2f2f2f;color:#8f8f8f;font:inherit;font-size:11px;cursor:pointer}
.ap-panel nav button.on{color:#eae8e3;border-color:#5a5a5a;background:#141414}
.ap-x{color:#8f8f8f;font-size:16px;cursor:pointer;border:0;background:none}
.ap-body{flex:1;overflow-y:auto;padding:18px}
.ap-loading,.ap-err{color:#8f8f8f;font-size:12px}
.ap-list{display:flex;flex-direction:column;gap:14px;margin-bottom:16px}
.ap-card{border:1px solid #2f2f2f;background:#0a0a0a;padding:14px}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:10px}
.ap-card label,.ap-bioform label{display:flex;flex-direction:column;gap:4px;font-size:9.5px;letter-spacing:.06em;color:#8f8f8f;text-transform:uppercase}
.ap-card input,.ap-card textarea,.ap-bioform input,.ap-bioform textarea{
  background:#141414;border:1px solid #2f2f2f;color:#eae8e3;padding:7px 8px;font:12px/1.4 inherit;text-transform:none;letter-spacing:normal}
.ap-full{grid-column:1/-1;margin-bottom:10px}
.ap-card textarea{min-height:56px;resize:vertical}
.ap-audio{display:flex;align-items:center;gap:10px;font-size:11px;color:#8f8f8f;margin-bottom:10px;flex-wrap:wrap}
.ap-row-actions{display:flex;gap:8px}
.ap-save{background:#e2a52f;color:#060606;border:0;padding:7px 16px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
.ap-del{background:none;color:#c0553e;border:1px solid #c0553e;padding:7px 16px;font:inherit;font-size:11px;cursor:pointer}
.ap-add,.ap-upload-btn{background:none;border:1px dashed #5a5a5a;color:#8f8f8f;padding:10px 16px;font:inherit;font-size:11px;cursor:pointer;display:inline-block}
.ap-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:16px}
.ap-gcard{border:1px solid #2f2f2f;background:#0a0a0a;padding:8px;display:flex;flex-direction:column;gap:6px}
.ap-gcard img{width:100%;aspect-ratio:1;object-fit:cover}
.ap-gcard input{background:#141414;border:1px solid #2f2f2f;color:#eae8e3;padding:5px 6px;font:11px inherit}
.ap-gcard button{background:none;color:#c0553e;border:1px solid #c0553e;padding:5px;font:10px inherit;cursor:pointer}
.ap-bioform{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;margin-bottom:16px}
#apBioStatus{margin-left:12px;font-size:11px;color:#8f8f8f}
`;
  document.head.appendChild(s);
}

function ensurePanel() {
  injectStyle();
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'adminPanel';
  document.body.appendChild(panelEl);
  return panelEl;
}

function closePanel() { location.hash = ''; }

function renderGate() {
  const el = ensurePanel();
  el.innerHTML = `
    <div class="ap-gate">
      <b>HONN3Y — ADMIN</b>
      <input type="password" id="apPwd" placeholder="Contraseña" autocomplete="off">
      <button id="apGo">Entrar</button>
      <p id="apErr" class="ap-err" hidden>Contraseña incorrecta.</p>
      <button id="apCancel" class="ap-cancel">Cerrar</button>
    </div>`;
  el.classList.add('open');
  const login = () => {
    const val = document.getElementById('apPwd').value;
    if (val === PASSWORD) { authed = true; renderDashboard(); }
    else document.getElementById('apErr').hidden = false;
  };
  document.getElementById('apGo').onclick = login;
  document.getElementById('apPwd').onkeydown = e => { if (e.key === 'Enter') login(); };
  document.getElementById('apCancel').onclick = closePanel;
  document.getElementById('apPwd').focus();
}

function renderDashboard() {
  const el = ensurePanel();
  el.innerHTML = `
    <div class="ap-panel">
      <header>
        <b>HONN3Y — ADMIN</b>
        <nav>
          <button data-tab="sets" class="on">Sets</button>
          <button data-tab="gallery">Galería</button>
          <button data-tab="bio">Bio</button>
        </nav>
        <button id="apClose" class="ap-x">✕</button>
      </header>
      <div id="apBody" class="ap-body"></div>
    </div>`;
  el.classList.add('open');
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
  document.getElementById('apClose').onclick = closePanel;
  selectTab('sets');
}

function selectTab(tab) {
  panelEl.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const body = document.getElementById('apBody');
  body.innerHTML = '<p class="ap-loading">Cargando…</p>';
  if (tab === 'sets') renderSetsTab(body);
  if (tab === 'gallery') renderGalleryTab(body);
  if (tab === 'bio') renderBioTab(body);
}

/* ═══════════ SETS ═══════════ */
async function renderSetsTab(body) {
  let rows;
  try { rows = await fetchSetsRaw(); } catch (err) { body.innerHTML = `<p class="ap-err">No pude cargar: ${esc(err.message)}</p>`; return; }
  body.innerHTML = `<div class="ap-list" id="apSets"></div><button id="apAddSet" class="ap-add">+ Agregar set</button>`;
  const list = document.getElementById('apSets');
  rows.forEach(r => list.appendChild(setRow(r)));
  document.getElementById('apAddSet').onclick = async () => {
    const maxPos = rows.reduce((m, r) => Math.max(m, r.position), -1);
    const [created] = await insertSet({ title: 'Nuevo set', position: maxPos + 1 });
    rows.push(created);
    list.appendChild(setRow(created));
  };
}

function setRow(r) {
  const div = document.createElement('div');
  div.className = 'ap-card';
  div.innerHTML = `
    <div class="ap-grid">
      <label>Título<input data-f="title" value="${esc(r.title)}"></label>
      <label>Venue<input data-f="venue" value="${esc(r.venue || '')}"></label>
      <label>Año<input data-f="date" value="${esc(r.date || '')}"></label>
      <label>BPM<input data-f="bpm" value="${esc(r.bpm || '')}"></label>
      <label>Key<input data-f="key_camelot" value="${esc(r.key_camelot || '')}"></label>
      <label>Duración<input data-f="dur" value="${esc(r.dur || '')}" placeholder="33:32"></label>
      <label>YouTube ID<input data-f="yt" value="${esc(r.yt || '')}"></label>
      <label>YouTube inicio (s)<input data-f="yt_start" type="number" value="${r.yt_start || 0}"></label>
      <label>Posición<input data-f="position" type="number" value="${r.position || 0}"></label>
    </div>
    <label class="ap-full">Descripción<textarea data-f="description">${esc(r.description || '')}</textarea></label>
    <div class="ap-audio">
      <span class="ap-audio-cur">${r.audio ? '🎵 ' + esc(r.audio.split('/').pop()) : 'Sin audio (usa el loop demo)'}</span>
      <input type="file" accept="audio/*" data-audio>
      <span class="ap-audio-status"></span>
    </div>
    <div class="ap-row-actions">
      <button data-save class="ap-save">Guardar</button>
      <button data-del class="ap-del">Borrar</button>
    </div>`;

  div.querySelector('[data-save]').onclick = async () => {
    const patch = {};
    div.querySelectorAll('[data-f]').forEach(inp => { patch[inp.dataset.f] = inp.type === 'number' ? (+inp.value || 0) : inp.value; });
    const btn = div.querySelector('[data-save]');
    btn.textContent = 'Guardando…'; btn.disabled = true;
    try { await updateSet(r.id, patch); btn.textContent = 'Guardado ✓'; }
    catch (err) { btn.textContent = 'Error'; console.error(err); }
    setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 1200);
  };

  div.querySelector('[data-del]').onclick = async () => {
    if (!confirm(`¿Borrar "${r.title}"? No se puede deshacer.`)) return;
    try { await deleteSet(r.id); div.remove(); } catch (err) { alert('No se pudo borrar: ' + err.message); }
  };

  div.querySelector('[data-audio]').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const status = div.querySelector('.ap-audio-status');
    status.textContent = 'Subiendo…';
    try {
      const path = `${Date.now()}-${file.name}`;
      const url = await uploadFile('audio', path, file);
      await updateSet(r.id, { audio: url });
      div.querySelector('.ap-audio-cur').textContent = '🎵 ' + file.name;
      status.textContent = 'Listo ✓';
    } catch (err) { status.textContent = 'Error: ' + err.message; }
  };

  return div;
}

/* ═══════════ GALERÍA ═══════════ */
async function renderGalleryTab(body) {
  let rows;
  try { rows = await fetchGallery(); } catch (err) { body.innerHTML = `<p class="ap-err">No pude cargar: ${esc(err.message)}</p>`; return; }
  body.innerHTML = `
    <label class="ap-upload-btn">+ Subir foto<input type="file" accept="image/*" id="apGalUpload" hidden></label>
    <div class="ap-gallery" id="apGallery"></div>`;
  const grid = document.getElementById('apGallery');
  rows.forEach(r => grid.appendChild(galleryCard(r)));

  document.getElementById('apGalUpload').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    const maxPos = rows.reduce((m, r) => Math.max(m, r.position), -1);
    try {
      const path = `${Date.now()}-${file.name}`;
      const url = await uploadFile('gallery', path, file);
      const [created] = await insertGalleryItem({ image_url: url, position: maxPos + 1, caption: '' });
      rows.push(created);
      grid.appendChild(galleryCard(created));
    } catch (err) { alert('No se pudo subir: ' + err.message); }
  };
}

function galleryCard(r) {
  const div = document.createElement('div');
  div.className = 'ap-gcard';
  div.innerHTML = `
    <img src="${esc(r.image_url)}" alt="">
    <input data-f="caption" value="${esc(r.caption || '')}" placeholder="Descripción (opcional)">
    <button data-del>Borrar</button>`;

  div.querySelector('[data-f]').onchange = e => { updateGalleryItem(r.id, { caption: e.target.value }).catch(err => console.error(err)); };

  div.querySelector('[data-del]').onclick = async () => {
    if (!confirm('¿Borrar esta foto?')) return;
    try {
      await deleteGalleryItem(r.id);
      const path = r.image_url.split('/gallery/')[1];
      if (path) await deleteFile('gallery', decodeURIComponent(path));
      div.remove();
    } catch (err) { alert('No se pudo borrar: ' + err.message); }
  };

  return div;
}

/* ═══════════ BIO ═══════════ */
const META_FIELDS = [
  ['bio_lead', 'Frase inicial', 'text'],
  ['bio_p1', 'Párrafo 1', 'textarea'],
  ['bio_p2', 'Párrafo 2', 'textarea'],
  ['stat_years', 'Años tocando', 'text'],
  ['stat_dates', 'Fechas', 'text'],
  ['contact_email', 'Email de contacto', 'text'],
  ['social_instagram', 'Instagram (URL)', 'text'],
  ['social_soundcloud', 'SoundCloud (URL)', 'text'],
  ['social_youtube', 'YouTube (URL)', 'text'],
  ['social_ra', 'Resident Advisor (URL)', 'text'],
];

async function renderBioTab(body) {
  let meta;
  try { meta = await fetchMeta(); } catch (err) { body.innerHTML = `<p class="ap-err">No pude cargar: ${esc(err.message)}</p>`; return; }
  body.innerHTML = `
    <div class="ap-bioform" id="apBioForm">
      ${META_FIELDS.map(([key, label, type]) => `
        <label class="${type === 'textarea' ? 'ap-full' : ''}">${esc(label)}
          ${type === 'textarea'
      ? `<textarea data-key="${key}">${esc(meta[key] || '')}</textarea>`
      : `<input data-key="${key}" value="${esc(meta[key] || '')}">`}
        </label>`).join('')}
    </div>
    <button id="apBioSave" class="ap-save">Guardar biografía</button>
    <span id="apBioStatus"></span>`;

  document.getElementById('apBioSave').onclick = async () => {
    const btn = document.getElementById('apBioSave');
    const status = document.getElementById('apBioStatus');
    btn.disabled = true; status.textContent = 'Guardando…';
    try {
      for (const inp of document.querySelectorAll('#apBioForm [data-key]')) await upsertMeta(inp.dataset.key, inp.value);
      status.textContent = 'Guardado ✓';
    } catch (err) { status.textContent = 'Error: ' + err.message; }
    btn.disabled = false;
  };
}

/* ═══════════ GATILLO ═══════════ */
function checkHash() {
  if (location.hash === '#admin') {
    if (authed) renderDashboard(); else renderGate();
  } else if (panelEl) {
    panelEl.classList.remove('open');
  }
}

export function initAdmin() {
  addEventListener('hashchange', checkHash);
  checkHash();
}

/* ═══════════════════════════════════════════════════════════════════════════
   supabase-client.js — datos remotos, en vivo.

   fetchSets/fetchGallery/fetchMeta   REST a pelo (fetch), como en tus otros
                                        proyectos.
   subscribeSets/Gallery/Meta          un canal Realtime por tabla — cuando
                                        editas desde el panel admin, los
                                        navegadores conectados se enteran
                                        solos, sin recargar.
   uploadFile/deleteFile               Storage: sube/borra el mp3 o la foto
                                        que se suelta en el panel admin.

   Si no hay red o Supabase no responde, todo falla con gracia: quien llama
   envuelve en try/catch y se queda con lo local — el mismo patrón que el
   audio real cayendo al loop sintético (ver CLAUDE.md).

   RealtimeClient viene de src/vendor/realtime.js (window.SupabaseRealtime),
   cargado como <script> aparte — no como import — para que esto siga
   funcionando en `npm run dev` sin bundler, igual que Motion.
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://iiqowugqipkskjzfwzrk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e-CvHITiLhC4UsJdUczYKA_Rxq9NE-U';

function headers(extra = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function req(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function getAll(table, queryStr = '') {
  return req(`${SUPABASE_URL}/rest/v1/${table}${queryStr}`, { headers: headers() });
}
async function insertRow(table, data) {
  return req(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(data),
  });
}
async function updateRow(table, id, data) {
  return req(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(data),
  });
}
async function deleteRow(table, id) {
  return req(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: headers() });
}
async function upsertRow(table, data, onConflict) {
  return req(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST', headers: headers({ Prefer: 'return=representation,resolution=merge-duplicates' }), body: JSON.stringify(data),
  });
}

/* ───────── Realtime: un cliente compartido, un canal por tabla ───────── */
let rt = null;
function getRealtime() {
  if (rt) return rt;
  if (!window.SupabaseRealtime) return null;
  const wsUrl = SUPABASE_URL.replace(/^https/, 'wss') + '/realtime/v1';
  rt = new window.SupabaseRealtime.RealtimeClient(wsUrl, { params: { apikey: SUPABASE_KEY } });
  rt.connect();
  return rt;
}
function subscribeTable(table, onChange) {
  const client = getRealtime();
  if (!client) { console.warn('Realtime no cargó, sin actualizaciones en vivo.'); return; }
  client.channel(`${table}-changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    .subscribe();
}

/* ───────── Sets ───────── */
function normalizeSet(row) {
  return {
    id: row.id,
    yt: row.yt || '',
    ytStart: row.yt_start || 0,
    audio: row.audio || '',
    title: row.title,
    venue: row.venue || '',
    date: row.date || '',
    bpm: row.bpm || '',
    key: row.key_camelot || '',
    desc: row.description || '',
    dur: row.dur || '',
    cover: row.cover_url || '',
  };
}

export async function fetchSets() {
  const rows = await getAll('sets', '?select=*&order=position.asc');
  return rows.map(normalizeSet);
}
export function subscribeSets(onChange) { subscribeTable('sets', onChange); }

// Sin normalizar — para el panel admin, que edita las columnas tal cual.
export async function fetchSetsRaw() { return getAll('sets', '?select=*&order=position.asc'); }
export async function insertSet(row) { return insertRow('sets', row); }
export async function updateSet(id, row) { return updateRow('sets', id, row); }
export async function deleteSet(id) { return deleteRow('sets', id); }

/* ───────── Galería ───────── */
export async function fetchGallery() {
  return getAll('gallery', '?select=*&order=position.asc');
}
export function subscribeGallery(onChange) { subscribeTable('gallery', onChange); }
export async function insertGalleryItem(row) { return insertRow('gallery', row); }
export async function updateGalleryItem(id, row) { return updateRow('gallery', id, row); }
export async function deleteGalleryItem(id) { return deleteRow('gallery', id); }

/* ───────── Bio / stats / redes (pares clave-valor) ───────── */
export async function fetchMeta() {
  const rows = await getAll('site_meta', '?select=*');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}
export function subscribeMeta(onChange) { subscribeTable('site_meta', onChange); }
export async function upsertMeta(key, value) { return upsertRow('site_meta', { key, value }, 'key'); }

/* ───────── Storage (mp3 del panel admin, fotos de la galería) ───────── */
export async function uploadFile(bucket, path, file) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'x-upsert': 'true' },
    body: file,
  });
  if (!res.ok) throw new Error(`Storage ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
export async function deleteFile(bucket, path) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   supabase-client.js — sets remotos, en vivo.

   fetchSets()     REST a pelo (fetch), como en el resto de tus proyectos.
   subscribeSets() canal Realtime — cuando editas la tabla "sets" en Supabase,
                    los navegadores conectados se enteran solos, sin recargar.

   Si no hay red o Supabase no responde, ambas fallan con gracia: main.js las
   envuelve en try/catch y se queda con los sets de config.js — el mismo
   patrón que el audio real cayendo al loop sintético (ver CLAUDE.md).

   RealtimeClient viene de src/vendor/realtime.js (window.SupabaseRealtime),
   cargado como <script> aparte — no como import — para que esto siga
   funcionando en `npm run dev` sin bundler, igual que Motion.
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://iiqowugqipkskjzfwzrk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e-CvHITiLhC4UsJdUczYKA_Rxq9NE-U';

function normalize(row) {
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
  };
}

export async function fetchSets() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sets?select=*&order=position.asc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const rows = await res.json();
  return rows.map(normalize);
}

let realtime = null;
export function subscribeSets(onChange) {
  if (!window.SupabaseRealtime) { console.warn('Realtime no cargó, sin actualizaciones en vivo.'); return; }
  const wsUrl = SUPABASE_URL.replace(/^https/, 'wss') + '/realtime/v1';
  realtime = new window.SupabaseRealtime.RealtimeClient(wsUrl, { params: { apikey: SUPABASE_KEY } });
  realtime.connect();
  realtime
    .channel('sets-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sets' }, onChange)
    .subscribe();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ▓▓▓  CONFIGURACIÓN — EDITA SOLO ESTE ARCHIVO  ▓▓▓
   ═══════════════════════════════════════════════════════════════════════════

   yt      ID del video de YouTube (lo que va después de v=).
           Sirve para la MINIATURA y para abrir el video en el popup.
           NO sirve para el plato: YouTube no se puede rayar (su API solo da
           seekTo y playbackRate en pasos, sin negativos).

   ytStart Segundo en el que arranca el video al abrir el popup (el "t=" del
           link de YouTube). Opcional.

   desc    Descripción corta del set. Aparece junto a la portada activa del
           carril, en escritorio.

   audio   URL de un mp3/wav. ESTO es lo que suena en el tornamesa y lo que
           puedes rayar. Si está vacío, el plato carga un loop de techno
           sintetizado como DEMO, para que puedas probarlo ya.
           También puedes arrastrar un mp3 directo al plato.

   Ejemplo:
     https://youtube.com/watch?v=dQw4w9WgXcQ&t=90s   →   yt:'dQw4w9WgXcQ', ytStart:90
   ═══════════════════════════════════════════════════════════════════════════ */

export const SETS = [
  // ▓ Los dos links que mandaste — asignados a los primeros dos sets. Si el
  // orden no es ese, solo hay que mover yt/ytStart entre entradas.
  { yt:'taJ5nlkZ_P4', ytStart:1032, audio:'assets/sets/tomo-1.mp3', title:'Warehouse Session', venue:'Sótano · CDMX', date:'2025', bpm:'152', key:'8A',
    desc:'Grabado en vivo en un sótano de la Ciudad de México. Groove subterráneo, cerrado, sin ventanas — se siente.',
    dur:'33:32' },
  { yt:'LGyUXcLpLKA', ytStart:1461, audio:'', title:'Home Set 002',      venue:'Cuarto · CDMX',     date:'2025', bpm:'128', key:'6A',
    desc:'La bocina prestada, la puerta abierta al pasillo. Sesión de cuarto chico grabada de una sola toma.',
    dur:'58:20'   },
  { yt:'', audio:'', title:'Breaks / Late',     venue:'Rooftop · Roma',    date:'2024', bpm:'140', key:'11B',
    desc:'De madrugada en una azotea de la Roma. Breaks quebrados, poco respiro, mucho ruido de ciudad abajo.',
    dur:'1:24:05' },
  { yt:'', audio:'', title:'Closing — 6AM',     venue:'Privado',           date:'2024', bpm:'126', key:'4A',
    desc:'El cierre de una fiesta privada, ya sin nadie pidiendo nada. El set que se pone cuando ya no queda gente que complacer.',
    dur:'2:02:11' },
];

export const DJ_NAME = 'HONN3Y';

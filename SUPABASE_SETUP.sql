-- ═══════════════════════════════════════════════════════════════════════════════
--  SUPABASE_SETUP.sql  –  Configuración de base de datos para HONN3Y
--  Corre esto UNA VEZ en Supabase → tu proyecto → SQL Editor → Run.
--  Con IF EXISTS/IF NOT EXISTS para que se pueda correr más de una vez sin error.
--  Si ya lo corriste antes (tabla "sets"), correrlo de nuevo es seguro: solo
--  agrega lo que falta (gallery, site_meta, buckets de Storage) sin duplicar
--  ni tocar los sets que ya tengas.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. TABLAS ────────────────────────────────────────────────────────────────
-- Van todas primero: los DROP de la sección 2 necesitan que la tabla ya
-- exista para resolver la referencia, aunque sea IF EXISTS (esa cláusula
-- perdona que falte la política/trigger, no que falte la tabla).

-- Espejo de SETS en src/config.js. "position" decide el orden en el carril y
-- el setlist (un array de Postgres no garantiza orden sin una columna para eso).
CREATE TABLE IF NOT EXISTS sets (
  id           BIGSERIAL     PRIMARY KEY,
  position     INT           NOT NULL DEFAULT 0,
  title        TEXT          NOT NULL,
  venue        TEXT          DEFAULT '',
  date         TEXT          DEFAULT '',
  bpm          TEXT          DEFAULT '',
  key_camelot  TEXT          DEFAULT '',
  description  TEXT          DEFAULT '',
  dur          TEXT          DEFAULT '',
  yt           TEXT          DEFAULT '',
  yt_start     INT           DEFAULT 0,
  audio        TEXT          DEFAULT '',
  cover_url    TEXT          DEFAULT '',
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);
-- Por si ya tenías la tabla de antes de que existiera esta columna.
ALTER TABLE sets ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '';

-- Álbum de fotos de la galería. image_url apunta al bucket de Storage "gallery".
CREATE TABLE IF NOT EXISTS gallery (
  id           BIGSERIAL     PRIMARY KEY,
  position     INT           NOT NULL DEFAULT 0,
  image_url    TEXT          NOT NULL,
  caption      TEXT          DEFAULT '',
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- Texto de biografía, stats y redes — pares clave/valor, igual que la tabla
-- "meta" de PIPRO. Una fila por dato editable desde el panel admin.
CREATE TABLE IF NOT EXISTS site_meta (
  key          TEXT          PRIMARY KEY,
  value        TEXT          DEFAULT '',
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);


-- ── 2. LIMPIAR POLÍTICAS Y TRIGGERS EXISTENTES ──────────────────────────────
-- (para poder correr este script más de una vez sin error "already exists")

DROP POLICY IF EXISTS "acceso_publico" ON sets;
DROP POLICY IF EXISTS "acceso_publico" ON gallery;
DROP POLICY IF EXISTS "acceso_publico" ON site_meta;
DROP TRIGGER IF EXISTS sets_updated_at ON sets;
DROP TRIGGER IF EXISTS gallery_updated_at ON gallery;
DROP TRIGGER IF EXISTS site_meta_updated_at ON site_meta;


-- ── 3. DATOS INICIALES ───────────────────────────────────────────────────────
-- Los 4 sets y el texto de bio/stats/redes que ya estaban hardcodeados en el
-- sitio, para que Supabase arranque con el mismo contenido que ya se veía.
-- Los WHERE NOT EXISTS / ON CONFLICT hacen que esto no duplique nada si ya
-- corriste el script antes.

INSERT INTO sets (position, title, venue, date, bpm, key_camelot, description, dur, yt, yt_start, audio)
SELECT * FROM (VALUES
  (0, 'Warehouse Session', 'Sótano · CDMX',    '2025', '152', '8A',
   'Grabado en vivo en un sótano de la Ciudad de México. Groove subterráneo, cerrado, sin ventanas — se siente.',
   '33:32', 'taJ5nlkZ_P4', 1032, 'assets/sets/tomo-1.mp3'),
  (1, 'Home Set 002',      'Cuarto · CDMX',    '2025', '128', '6A',
   'La bocina prestada, la puerta abierta al pasillo. Sesión de cuarto chico grabada de una sola toma.',
   '58:20', 'LGyUXcLpLKA', 1461, ''),
  (2, 'Breaks / Late',     'Rooftop · Roma',   '2024', '140', '11B',
   'De madrugada en una azotea de la Roma. Breaks quebrados, poco respiro, mucho ruido de ciudad abajo.',
   '1:24:05', '', 0, ''),
  (3, 'Closing — 6AM',     'Privado',          '2024', '126', '4A',
   'El cierre de una fiesta privada, ya sin nadie pidiendo nada. El set que se pone cuando ya no queda gente que complacer.',
   '2:02:11', '', 0, '')
) AS v(position, title, venue, date, bpm, key_camelot, description, dur, yt, yt_start, audio)
WHERE NOT EXISTS (SELECT 1 FROM sets);

INSERT INTO site_meta (key, value) VALUES
  ('bio_lead',         'Cuarto chico, bocina prestada, la puerta abierta. Así empezó y así sigue sonando.'),
  ('bio_p1',           'HONN3Y selecciona desde la CDMX: techno crudo, breaks y todo lo que aguante un sistema mal calibrado a las 4 de la mañana. Sin género fijo, sin complacencia — sesiones largas que se construyen de abajo hacia arriba.'),
  ('bio_p2',           'Toca en fiestas de casa, bodegas y espacios que no aparecen en el mapa. Si hay corriente, hay set.'),
  ('stat_years',       '04'),
  ('stat_dates',       '120+'),
  ('contact_email',    'booking@honey.dj'),
  ('social_instagram', ''),
  ('social_soundcloud','' ),
  ('social_youtube',   ''),
  ('social_ra',        '')
ON CONFLICT (key) DO NOTHING;

-- Nada en "gallery": arranca vacía. El sitio se queda con las fotos fijas de
-- assets/ hasta que subas la primera foto real desde el panel admin.


-- ── 4. SEGURIDAD (Row Level Security) ───────────────────────────────────────
-- Igual que en el resto de tus proyectos: acceso público de lectura/escritura
-- por la publishable key, sin auth de verdad detrás — el panel admin del
-- sitio solo pide una contraseña en el navegador (ver src/admin.js), no hay
-- backend que la valide. Suficiente para un sitio de un solo dueño.

ALTER TABLE sets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery   ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acceso_publico" ON sets      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico" ON gallery   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico" ON site_meta FOR ALL TO anon USING (true) WITH CHECK (true);


-- ── 5. STORAGE — buckets para el mp3 y las fotos que se suban desde el panel ──

INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('gallery', 'gallery', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "acceso_publico_audio"   ON storage.objects;
DROP POLICY IF EXISTS "acceso_publico_gallery" ON storage.objects;
DROP POLICY IF EXISTS "acceso_publico_covers"  ON storage.objects;

CREATE POLICY "acceso_publico_audio" ON storage.objects
  FOR ALL TO anon USING (bucket_id = 'audio') WITH CHECK (bucket_id = 'audio');
CREATE POLICY "acceso_publico_gallery" ON storage.objects
  FOR ALL TO anon USING (bucket_id = 'gallery') WITH CHECK (bucket_id = 'gallery');
CREATE POLICY "acceso_publico_covers" ON storage.objects
  FOR ALL TO anon USING (bucket_id = 'covers') WITH CHECK (bucket_id = 'covers');


-- ── 6. REALTIME ──────────────────────────────────────────────────────────────
-- Los cambios en estas tablas se transmiten por WebSocket a los navegadores
-- conectados (postgres_changes) — así el sitio se actualiza sin recargar.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gallery') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gallery;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'site_meta') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE site_meta;
  END IF;
END $$;


-- ── 7. FUNCIÓN Y TRIGGERS updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sets_updated_at
  BEFORE UPDATE ON sets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER gallery_updated_at
  BEFORE UPDATE ON gallery
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER site_meta_updated_at
  BEFORE UPDATE ON site_meta
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 8. VERIFICACIÓN ──────────────────────────────────────────────────────────
SELECT 'sets' AS tabla, count(*) AS registros FROM sets
UNION ALL SELECT 'gallery',   count(*) FROM gallery
UNION ALL SELECT 'site_meta', count(*) FROM site_meta;

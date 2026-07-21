-- ═══════════════════════════════════════════════════════════════════════════════
--  SUPABASE_SETUP.sql  –  Configuración de base de datos para HONN3Y
--  Corre esto UNA VEZ en Supabase → tu proyecto → SQL Editor → Run.
--  Con DROP IF EXISTS para que se pueda correr más de una vez sin error.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. LIMPIAR POLÍTICAS Y TRIGGERS EXISTENTES ──────────────────────────────

DROP POLICY IF EXISTS "acceso_publico" ON sets;
DROP TRIGGER IF EXISTS sets_updated_at ON sets;


-- ── 2. TABLA ─────────────────────────────────────────────────────────────────
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
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);


-- ── 3. DATOS INICIALES ───────────────────────────────────────────────────────
-- Los 4 sets que ya estaban hardcodeados en config.js, para que Supabase
-- arranque con el mismo contenido que el sitio ya mostraba.

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


-- ── 4. SEGURIDAD (Row Level Security) ───────────────────────────────────────
-- Igual que en el resto de tus proyectos: acceso público de lectura/escritura
-- por la publishable key, sin auth — el sitio no tiene login ni panel admin.

ALTER TABLE sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acceso_publico" ON sets FOR ALL TO anon USING (true) WITH CHECK (true);


-- ── 5. REALTIME ──────────────────────────────────────────────────────────────
-- Habilita que los cambios en "sets" se transmitan por WebSocket a los
-- navegadores conectados (postgres_changes).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sets;
  END IF;
END $$;


-- ── 6. FUNCIÓN Y TRIGGER updated_at ─────────────────────────────────────────

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


-- ── 7. VERIFICACIÓN ──────────────────────────────────────────────────────────
SELECT position, title, venue, bpm, key_camelot, dur FROM sets ORDER BY position;

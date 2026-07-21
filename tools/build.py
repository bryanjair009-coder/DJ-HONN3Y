#!/usr/bin/env python3
"""
build.py — ensambla dist/honey-dj.html: un único archivo autocontenido.

Mete dentro: CSS, fuentes woff2, imágenes webp, el bundle de Motion y el JS
(agrupado con esbuild). El resultado no pide nada a la red y funciona con
doble clic, incluso sin conexión.

    python3 tools/build.py

Requiere esbuild (viene con `npm install`).
"""
import base64, os, re, subprocess, sys, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
os.makedirs(DIST, exist_ok=True)

def rd(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()

def b64(path, mime):
    with open(os.path.join(ROOT, path), 'rb') as f:
        return f'data:{mime};base64,' + base64.b64encode(f.read()).decode()

# ── 1. JS: agrupar los módulos en un IIFE ────────────────────────────────────
esbuild = shutil.which('esbuild') or os.path.join(ROOT, 'node_modules', '.bin', 'esbuild')
if not os.path.exists(esbuild) and not shutil.which('esbuild'):
    sys.exit('esbuild no encontrado. Corre `npm install` primero.')
out_js = os.path.join(DIST, '_bundle.js')
subprocess.run([esbuild, os.path.join(ROOT, 'src', 'main.js'),
                '--bundle', '--format=iife', '--minify', f'--outfile={out_js}'],
               check=True, capture_output=True)
with open(out_js, encoding='utf-8') as f:
    bundle = f.read()
os.remove(out_js)

# ── 2. CSS: fuentes a data-URI ───────────────────────────────────────────────
css = rd('src', 'styles.css')
for name in ('archivo', 'mono-400', 'mono-700', 'nosifer'):
    css = css.replace(f'url(../assets/fonts/{name}.woff2)',
                      f"url({b64(f'assets/fonts/{name}.woff2', 'font/woff2')})")

# El mosaico de grano también va empotrado: sin esto, dist/ pide un archivo que
# no existe junto a él y la página se queda sin textura.
css = css.replace('url("assets/grain.png")', f'url("{b64("assets/grain.png", "image/png")}")')

# ── 3. HTML: index.html se COMPONE desde src/head.html + src/body.html ───────
# Antes index.html era un archivo suelto y editar body.html no llegaba al build.
# Ahora body.html es la única fuente del markup y index.html se regenera aquí.
def compose():
    return (
        '<!DOCTYPE html>\n<html lang="es">\n<head>\n'
        + rd('src', 'head.html')
        + '</head>\n<body>\n\n'
        + rd('src', 'body.html')
        + """

<!-- Rutas de los assets. build.py las sustituye por data-URI en dist/. -->
<script>
window.IMG = {
  deck:  'assets/deck.webp',
  dj:    'assets/dj.webp',
  bee:   'assets/bee.webp',
  steel: 'assets/bee_steel.webp',
};
document.querySelectorAll('[data-src]').forEach(el => el.src = window.IMG[el.dataset.src]);
{ const f = document.createElement('link'); f.rel = 'icon'; f.href = window.IMG.steel; document.head.appendChild(f); }
</script>

<!-- Motion: bundle propio (animate del build mini + inView/stagger/spring) -->
<script src="src/vendor/motion.js"></script>
<!-- Realtime: solo el canal de Supabase, no el supabase-js completo -->
<script src="src/vendor/realtime.js"></script>
<script type="module" src="src/main.js"></script>
</body>
</html>
"""
    )

html = compose()
with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html)      # index.html es un artefacto: se regenera en cada build
html = html.replace('<link rel="stylesheet" href="src/styles.css">',
                    '<style>\n' + css + '\n</style>')

# imágenes a data-URI
for path, mime in [('assets/deck.webp', 'image/webp'), ('assets/dj.webp', 'image/webp'),
                   ('assets/bee.webp', 'image/webp'), ('assets/bee_steel.webp', 'image/webp')]:
    html = html.replace(f"'{path}'", f"'{b64(path, mime)}'")

# scripts externos → inline
html = html.replace('<script src="src/vendor/motion.js"></script>',
                    '<script>' + rd('src', 'vendor', 'motion.js') + '</script>')
html = html.replace('<script src="src/vendor/realtime.js"></script>',
                    '<script>' + rd('src', 'vendor', 'realtime.js') + '</script>')
html = html.replace('<script type="module" src="src/main.js"></script>',
                    '<script>' + bundle + '</script>')

# ── 4. comprobaciones ────────────────────────────────────────────────────────
# El audio NO se empotra: un set real pesa decenas de MB, embeberlo en base64
# convertiría el "un solo archivo, 750 KB" en un monstruo de 80+ MB. Se sirve
# por red — funciona en un servidor real o con `npm run dev`. NO funciona
# abriendo honey-dj.html con doble clic (file://): fetch() de un archivo local
# falla ahí por CORS, sin excepción posible. Por eso 'assets/sets/' es la
# única ruta que se deja pasar aquí; todo lo demás sigue teniendo que estar
# empotrado o el build se detiene.
for leak in ('src/main.js', 'src/styles.css', 'src/vendor'):
    if leak in html:
        sys.exit(f'ERROR: quedó una referencia externa a "{leak}" — el archivo no es autocontenido')
if re.search(r'assets/(?!sets/)', html):
    sys.exit('ERROR: quedó una referencia a "assets/" sin empotrar (fuera de assets/sets/, que es audio)')

out = os.path.join(DIST, 'honey-dj.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)

# El audio se copia junto al HTML — no embebido, pero disponible si sirves
# dist/ completo desde un servidor real (no si abres el archivo suelto).
sets_src = os.path.join(ROOT, 'assets', 'sets')
if os.path.isdir(sets_src):
    sets_dst = os.path.join(DIST, 'assets', 'sets')
    os.makedirs(sets_dst, exist_ok=True)
    for name in os.listdir(sets_src):
        shutil.copy2(os.path.join(sets_src, name), os.path.join(sets_dst, name))

print(f'dist/honey-dj.html  {os.path.getsize(out)/1024:.1f} KB  — autocontenido, sin red')

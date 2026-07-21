from PIL import Image, ImageOps, ImageFilter, ImageEnhance
import numpy as np, os, json, base64

SRC = '/mnt/user-data/uploads/'
OUT = '/home/claude/build/assets/'
os.makedirs(OUT, exist_ok=True)


def curve(img_l, black=18, white=238, gamma=0.92):
    """Crush blacks, lift speculars — xerox/flyer contrast."""
    a = np.asarray(img_l).astype(np.float32) / 255.0
    b, w = black / 255.0, white / 255.0
    a = np.clip((a - b) / (w - b), 0, 1)
    a = a ** gamma
    return Image.fromarray((a * 255).astype(np.uint8), 'L')


# ---------- 1. DECK (tornamesa) ----------
deck = Image.open(SRC + 'honey_tornamesa.png').convert('RGB')
print('deck src', deck.size)
# Recortar el antebrazo: el jog wheel está en y=194 y la mano llega a y~340.
# Cortando en 450 el módulo deja de desbordar el viewport y la mano sigue
# entrando por abajo. El plato se reposiciona a 194/450 = 43.11% en el CSS.
deck = deck.crop((0, 0, 407, 450))
g = ImageOps.grayscale(deck)
g = ImageOps.autocontrast(g, cutoff=(0.5, 0.5))
g = curve(g, black=14, white=232, gamma=0.88)
g = ImageEnhance.Contrast(g).enhance(1.18)
# 2x for retina, then sharpen to fight the LANCZOS softness
g = g.resize((deck.width * 2, deck.height * 2), Image.LANCZOS)
g = g.filter(ImageFilter.UnsharpMask(radius=1.6, percent=110, threshold=2))
# fundido a negro en los últimos 130 px: el brazo se disuelve, el chasis flota
arr = np.asarray(g).astype(np.float32)
h = arr.shape[0]
fade = np.ones(h, np.float32)
y0 = int(h * 0.72)
fade[y0:] = np.linspace(1.0, 0.0, h - y0) ** 1.35
arr *= fade[:, None]
g = Image.fromarray(arr.astype(np.uint8), 'L')
g.convert('RGB').save(OUT + 'deck.webp', 'WEBP', quality=84, method=6)

# ---------- 2. DJ PHOTO ----------
dj = Image.open(SRC + 'honey_dj_.jpeg').convert('RGB')
g = ImageOps.grayscale(dj)
g = ImageOps.autocontrast(g, cutoff=(0.4, 0.4))
g = curve(g, black=16, white=240, gamma=0.95)
g = ImageEnhance.Contrast(g).enhance(1.12)
g = g.resize((900, int(900 * dj.height / dj.width)), Image.LANCZOS)
g = g.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=3))
g.convert('RGB').save(OUT + 'dj.webp', 'WEBP', quality=80, method=6)
print('dj out', g.size)

# ---------- 3. BEE LOGO (keeps alpha; bronze preserved) ----------
# OJO: se usa bee_clean.png (salida de unmatte.py), NO el original.
# El PNG subido es una captura del preview: el tablero son píxeles reales y el
# alfa está a 255 en todo el lienzo. unmatte.py reconstruye la transparencia.
bee = Image.open('/home/claude/build/bee_clean.png').convert('RGBA')
bee = bee.crop(bee.split()[3].getbbox())
print('bee (alfa reconstruido)', bee.size)
W = 640
bee = bee.resize((W, int(W * bee.height / bee.width)), Image.LANCZOS)
bee.save(OUT + 'bee.webp', 'WEBP', quality=78, method=6, exact=True)

# ---------- 4. BEE — steel/silhouette variant for UI chrome ----------
b2 = bee.copy()
rgb = ImageOps.grayscale(b2.convert('RGB'))
rgb = ImageOps.autocontrast(rgb, cutoff=(1, 1))
rgb = ImageEnhance.Contrast(rgb).enhance(1.25)
steel = Image.merge('RGBA', (rgb, rgb, rgb, b2.split()[3]))
steel = steel.resize((320, int(320 * steel.height / steel.width)), Image.LANCZOS)
steel.save(OUT + 'bee_steel.webp', 'WEBP', quality=88, method=6, exact=True)

for f in sorted(os.listdir(OUT)):
    print(f, round(os.path.getsize(OUT + f) / 1024, 1), 'KB')

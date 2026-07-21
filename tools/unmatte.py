"""
Recupera la transparencia real del logo de la abeja.

EL PROBLEMA
El PNG que llegó es una CAPTURA DEL PREVIEW, no el archivo original: el tablero
de ajedrez son píxeles RGB reales y el canal alfa está a 255 en TODO el lienzo
(verificado: alfa.min() == alfa.max() == 255). Por eso .getbbox() no recortaba
nada. Encima el tablero fue dibujado, no generado — el cuadro pasa de 26.5 px
arriba a 28 px abajo con jitter — así que sintetizar la rejilla y restarla
tampoco funciona.

LA SOLUCIÓN — segmentar por color + estructura + densidad, en dos pasadas:

  1. FONDO (estricto, conectado al borde del lienzo)
     El tablero limpio es claro y sin croma; la abeja es bronce/oro (saturado)
     o acero oscuro. Casi no se solapan. Estricto a propósito: no muerde metal.

  2. TABLERO RESIDUAL (permisivo, en cualquier parte)
     Dentro de las alas y en los huecos entre patas el tablero queda teñido y
     escapa al umbral estricto. Se rescata con dos tests:
       · estructura — tablero y acero cepillado tienen los dos desviación local
         alta, pero el tablero es PLANO dentro de cada cuadro y solo salta en
         los bordes; el metal tiene degradado continuo. (La ventana de sd debe
         superar el cuadro de ~27 px o el centro de cada cuadro no ve oscilar.)
       · densidad — se conserva solo lo que vive en un vecindario mayoritariamente
         tablero. Esto borra los brillos especulares finos del metal sin comerse
         las celdas del ala, cosa que una apertura morfológica no logra: venas y
         brillos tienen el mismo grosor, así que filtrar por forma falla y
         filtrar por densidad acierta.

Las alas quedan como venas doradas sobre negro: más limpio y más legible a 26 px
que un film translúcido, y coherente con el resto del sistema (negros duros).
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

o = np.asarray(Image.open('/mnt/user-data/uploads/honey_logo.png').convert('RGB')).astype(np.float64)
H, W, _ = o.shape
L, sat = o.mean(2), o.max(2) - o.min(2)
box = lambda a, k: ndi.uniform_filter(a, size=k, mode='reflect')

# ── 1. fondo estricto, conectado al borde ──
strict = ndi.binary_closing((sat < 16) & (L > 180), np.ones((9, 9)), border_value=1)
lab, _ = ndi.label(strict)
border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))

# ── 2. tablero residual: claro, sin croma, plano, oscilante y en zona densa ──
sd = np.sqrt(np.maximum(box(L**2, 61) - box(L, 61)**2, 0))     # ventana > cuadro (27 px)
gy, gx = np.gradient(L)
flatfrac = box((np.hypot(gx, gy) < 6.0).astype(float), 41)
base = (sat < 30) & (L > 120) & (flatfrac > 0.30) & (sd > 10) & ~bg
residual = base & (box(base.astype(float), 61) > 0.40)
residual = ndi.binary_closing(residual, np.ones((7, 7)))

kill = bg | residual
print(f'fondo {bg.mean()*100:.1f}%  +  tablero residual {residual.mean()*100:.2f}%  →  {kill.mean()*100:.1f}% eliminado')

# ── alfa ──
a = ndi.gaussian_filter((~kill).astype(float), 0.8)            # antialias del filo
a[a < 0.04] = 0.0
a[a > 0.97] = 1.0

F = o.copy()
F[a < 0.02] = 0
img = Image.fromarray(np.dstack([np.clip(F, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
img = img.crop(img.split()[3].getbbox())
img.save('bee_clean.png')
print(f'recorte {img.size}  (fuente 2016×2142)  ·  opaco {(a>.5).mean()*100:.1f}% del lienzo')

for c, name in [((6, 6, 6), 'bee_on_black.png'), ((234, 232, 227), 'bee_on_bone.png')]:
    z = Image.new('RGB', img.size, c); z.paste(img, (0, 0), img); z.save(name)

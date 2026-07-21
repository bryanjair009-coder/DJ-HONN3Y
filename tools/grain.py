#!/usr/bin/env python3
"""
Genera assets/grain.png — el mosaico de grano de película.

POR QUÉ EXISTE ESTE ARCHIVO
───────────────────────────
El grano estaba hecho con un <feTurbulence> SVG a pantalla completa. Medido:

    render de un loop de audio, app cargada y en reposo
      con #grain ........ 3794 ms
      sin #grain .........  568 ms      ← 6.7x

Un solo elemento decorativo multiplicaba por casi 7 el coste de TODO lo demás.
Tres cosas se multiplicaban entre sí:

  · inset:-150%          → el elemento medía 4x el viewport en cada eje = 16x
                           el área. A 1440x980 son 22.6 megapíxeles.
  · animation steps(6)   → esa mole se movía 6 veces por segundo...
  · mix-blend-mode       → ...y cada movimiento obliga a re-mezclar la página
                           entera contra un filtro SVG que hay que rasterizar.

Un PNG es un mapa de bits: se sube a la GPU una vez y se compone gratis. La
textura es idéntica; el coste, cero.

Se replica fractalNoise con baseFrequency='.82': a esa frecuencia el ruido de
feTurbulence está prácticamente a nivel de píxel y su distribución es
aproximadamente gaussiana centrada en el gris medio. Así que eso es lo que se
genera — no una aproximación, el mismo objeto.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'grain.png')
SIZE = 180          # el mismo tamaño de mosaico que tenía el SVG

rng = np.random.default_rng(7)

# fractalNoise ≈ gaussiana en torno al gris medio. sigma 52 reproduce el
# contraste del filtro original a opacity .9.
g = rng.normal(128, 52, (SIZE, SIZE))
g = np.clip(g, 0, 255).astype(np.uint8)

# Es tileable por construcción: cada píxel es independiente, así que no hay
# costura posible. (Con octavas de ruido de valor habría que envolver la
# interpolación; a esta frecuencia no hacen falta.)
img = Image.fromarray(g, mode='L')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, optimize=True)

print(f'assets/grain.png  {SIZE}x{SIZE}  {os.path.getsize(OUT)/1024:.1f} KB')

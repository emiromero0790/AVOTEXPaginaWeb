"""Parte AvotexNuevoLogo2.png en 6 letras exactas (partición de píxeles).
Cada píxel con alfa>0 se asigna a la letra opaca más cercana; los recortes
conservan sus coordenadas en el lienzo original 1600x599."""
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
src, outdir = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGBA'))
a = im[:, :, 3]
core = a > 8
lab, n = ndimage.label(core)
sizes = ndimage.sum(core, lab, range(1, n + 1))
keep = [i + 1 for i in range(n) if sizes[i] > 2000]
assert len(keep) == 6, keep
# ordenar de izquierda a derecha
objs = ndimage.find_objects(lab)
keep.sort(key=lambda k: objs[k - 1][1].start)
seed = np.zeros_like(lab)
for idx, k in enumerate(keep): seed[lab == k] = idx + 1
# píxel transparente/antialias -> letra más cercana
_, (iy, ix) = ndimage.distance_transform_edt(seed == 0, return_indices=True)
owner = seed[iy, ix]
owner[a == 0] = 0
# descarta ruido aislado (2 píxeles de alfa 2/255 en las esquinas del lienzo)
near = ndimage.binary_dilation(core, iterations=8)
owner[~near] = 0
names = list('AVOTEX'); meta = []
recon = np.zeros_like(im)
for idx, nm in enumerate(names):
    mask = owner == idx + 1
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    piece = np.zeros_like(im); piece[mask] = im[mask]
    recon[mask] = im[mask]
    crop = Image.fromarray(piece[y0:y1, x0:x1])
    fn = f'avotex-{idx+1}-{nm.lower()}.webp'
    crop.save(f'{outdir}/{fn}', 'WEBP', lossless=True, quality=100, method=6, exact=True)
    meta.append(dict(letter=nm, file=fn, x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0)))
assert np.array_equal(recon[near], im[near]), 'la recomposición no es idéntica'
# verificar que lo guardado también es idéntico
chk = np.zeros_like(im)
for m in meta:
    p = np.array(Image.open(f"{outdir}/{m['file']}").convert('RGBA'))
    sub = chk[m['y']:m['y']+m['h'], m['x']:m['x']+m['w']]
    sel = p[:, :, 3] > 0
    sub[sel] = p[sel]
print('recomposición desde archivos idéntica:', np.array_equal(chk[near & (a>0)], im[near & (a>0)]))
print(json.dumps(meta, indent=1))

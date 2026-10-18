# Builds the orthographic "globe pyramid" for the Avotex geographic journey.
#   Color: NASA Blue Marble Next Generation, topography + bathymetry (Dec 2004), public domain.
#   Relief: Mapzen/Tilezen Terrarium elevation tiles (AWS open data), hillshade computed here.
#   Borders: Natural Earth 1:10m admin-1 (Mexican states) + 1:50m admin-0 (countries), public domain.
# All layers share ONE orthographic projection (center LON0, LAT0). L1/L2 are the same projection
# at higher pixel density, so they register exactly over L0 in the browser.
import json, math, glob, os, sys
import numpy as np, cv2
from PIL import Image
from shapely.geometry import shape, mapping, Point, LineString, MultiLineString, Polygon, MultiPolygon, box
from shapely.ops import unary_union, linemerge
Image.MAX_IMAGE_PIXELS = None
RAW = './raw'; TIL = './tiles'; OUT = './out'
os.makedirs(OUT, exist_ok=True)

LON0, LAT0 = -96.0, 12.0
R0 = 1200.0           # L0 globe radius in "world px"; world is 2400 x 2400
C0 = 1200.0
phi0 = math.radians(LAT0); lam0 = math.radians(LON0)

def fwd(lon, lat):
    """lon/lat degrees (arrays) -> world px (L0), plus visibility."""
    lam = np.radians(lon); phi = np.radians(lat)
    cosc = math.sin(phi0) * np.sin(phi) + math.cos(phi0) * np.cos(phi) * np.cos(lam - lam0)
    x = R0 * np.cos(phi) * np.sin(lam - lam0)
    y = R0 * (math.cos(phi0) * np.sin(phi) - math.sin(phi0) * np.cos(phi) * np.cos(lam - lam0))
    return C0 + x, C0 - y, cosc

def inv(X, Y):
    """world px -> lon/lat degrees, mask of on-globe pixels."""
    x = (X - C0) / R0; y = (C0 - Y) / R0
    rho = np.sqrt(x * x + y * y)
    on = rho <= 1.0
    rho_c = np.clip(rho, 1e-12, 1.0)
    c = np.arcsin(rho_c)
    sinc, cosc = np.sin(c), np.cos(c)
    lat = np.arcsin(np.clip(cosc * math.sin(phi0) + y * sinc * math.cos(phi0) / rho_c, -1, 1))
    lon = lam0 + np.arctan2(x * sinc, rho_c * cosc * math.cos(phi0) - y * sinc * math.sin(phi0))
    lon = (np.degrees(lon) + 540) % 360 - 180
    return lon, np.degrees(lat), on, rho

# ---------- sources ----------
print('loading Blue Marble…', flush=True)
BMW = np.asarray(Image.open(f'{RAW}/bm5400.jpg').convert('RGB'))          # 15 px/deg, lon -180..180, lat 90..-90
def sample_bmw(lon, lat):
    mx = ((lon + 180) * 15 - 0.5).astype(np.float32); my = ((90 - lat) * 15 - 0.5).astype(np.float32)
    return cv2.remap(BMW, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)

HR_LON0, HR_LON1, HR_LAT1, HR_LAT0 = -123, -82, 37, 8                     # hi-res crop from 21600 tiles (240 px/deg)
def load_hr():
    a = Image.open(f'{RAW}/bmA1.jpg'); b = Image.open(f'{RAW}/bmB1.jpg')
    y0, y1 = (90 - HR_LAT1) * 240, (90 - HR_LAT0) * 240
    pa = a.crop(((180 + HR_LON0) * 240, y0, 21600, y1))
    pb = b.crop((0, y0, (HR_LON1 + 90) * 240, y1))
    im = Image.new('RGB', (pa.width + pb.width, pa.height)); im.paste(pa, (0, 0)); im.paste(pb, (pa.width, 0))
    return np.asarray(im)
BMH = None
def sample_bmh(lon, lat):
    global BMH
    if BMH is None: print('loading hi-res BM…', flush=True); BMH = load_hr()
    mx = ((lon - HR_LON0) * 240 - 0.5).astype(np.float32); my = ((HR_LAT1 - lat) * 240 - 0.5).astype(np.float32)
    return cv2.remap(BMH, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

def merc(lon, lat, z):
    n = 2 ** z * 256
    x = (lon + 180) / 360 * n
    lr = np.radians(np.clip(lat, -85, 85))
    y = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / np.pi) / 2 * n
    return x, y

MOS = {}
def mosaic(z):
    if z in MOS: return MOS[z]
    fs = glob.glob(f'{TIL}/{z}_*.png')
    xs = [int(f.split('_')[1]) for f in fs]; ys = [int(f.split('_')[2].split('.')[0]) for f in fs]
    x0, y0 = min(xs), min(ys)
    W, H = (max(xs) - x0 + 1) * 256, (max(ys) - y0 + 1) * 256
    m = np.zeros((H, W), np.float32)
    for f, x, y in zip(fs, xs, ys):
        t = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        m[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    MOS[z] = (m, x0, y0); return MOS[z]

def sample_dem(lon, lat, z):
    m, x0, y0 = mosaic(z)
    mx, my = merc(lon, lat, z)
    return cv2.remap(m, (mx - x0 * 256 - 0.5).astype(np.float32), (my - y0 * 256 - 0.5).astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def hillshade(dem, mpp, exag, az=315, alt=38):
    gy, gx = np.gradient(dem * exag, mpp)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    azr, altr = math.radians(360 - az + 90), math.radians(alt)
    hs = math.sin(altr) * np.cos(slope) + math.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(hs, 0, 1)

def srgb2lin(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255

def render(name, k, bx0, by0, bx1, by1, hr, z, exag, feather=0.0, mobile_div=None):
    """k = px per world px. Box in world px."""
    W, H = int(round((bx1 - bx0) * k)), int(round((by1 - by0) * k))
    print(name, W, H, flush=True)
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float64), np.arange(H, dtype=np.float64))
    X = bx0 + (gx + 0.5) / k; Y = by0 + (gy + 0.5) / k
    lon, lat, on, rho = inv(X, Y)
    col = (sample_bmh(lon, lat) if hr else sample_bmw(lon, lat)).astype(np.float32)
    dem = sample_dem(lon, lat, z)
    mpp = 6371000.0 / (R0 * k)                       # metres per output px near the centre
    hs = hillshade(dem, mpp, exag)
    land = (dem > 0.5).astype(np.float32)
    land = cv2.GaussianBlur(land, (0, 0), max(0.6, k * 0.15))
    lin = srgb2lin(col)
    # land: keep the satellite colour, lift a little, add hillshade (soft-light-ish multiply)
    lum = lin.mean(axis=2, keepdims=True)
    landc = lin * 1.08 + (lum - lin) * 0.12                          # slight desaturation
    shade = (0.42 + 1.05 * hs)[..., None]
    landc = landc * shade
    # warm/green brand grade
    landc = landc * np.array([1.0, 1.02, 0.86])
    # ocean: brand teal-forest, depth-tinted, bathymetry relief kept very subtle
    depth = np.clip(-dem / 5500.0, 0, 1)[..., None]
    shallow = srgb2lin(np.array([28, 74, 70], np.float32)); deep = srgb2lin(np.array([6, 22, 24], np.float32))
    oc = shallow * (1 - depth ** 0.55) + deep * depth ** 0.55
    oc = oc * (0.8 + 0.4 * hs[..., None]) + lin * 0.10
    out = landc * land[..., None] + oc * (1 - land[..., None])
    # limb darkening + atmosphere scattering toward the edge of the disc (L0 only matters)
    limb = np.clip(1 - rho, 0, 1)
    out = out * (0.55 + 0.45 * np.sqrt(limb))[..., None] + srgb2lin(np.array([120, 170, 150], np.float32)) * (0.10 * (1 - limb) ** 3)[..., None]
    rgb = lin2srgb(out).astype(np.uint8)
    a = on.astype(np.float32)
    # anti-aliased disc edge
    edge = np.clip((1 - rho) * R0 * k, 0, 1); a = a * edge
    if feather > 0:
        fx = np.minimum(gx, W - 1 - gx) / (W * feather); fy = np.minimum(gy, H - 1 - gy) / (H * feather)
        f = np.clip(np.minimum(fx, fy), 0, 1); f = f * f * (3 - 2 * f)
        a = a * f
    rgba = np.dstack([rgb, (a * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, 'RGBA')
    im.save(f'{OUT}/{name}.png')
    im.save(f'{OUT}/{name}.webp', quality=82, method=6)
    if mobile_div:
        im.resize((W // mobile_div, H // mobile_div), Image.LANCZOS).save(f'{OUT}/{name}-m.webp', quality=80, method=6)
    return dict(x=bx0, y=by0, w=bx1 - bx0, h=by1 - by0, k=k, W=W, H=H)

def bbox_of(lon0, lon1, lat0, lat1, pad):
    lo, la = np.meshgrid(np.linspace(lon0, lon1, 80), np.linspace(lat0, lat1, 80))
    x, y, _ = fwd(lo, la)
    return x.min() - pad, y.min() - pad, x.max() + pad, y.max() + pad

layers = {}
which = sys.argv[1:] or ['L0', 'L1', 'L2']
if 'L0' in which:
    layers['L0'] = render('geo-l0', 1.0, 0, 0, 2400, 2400, False, 5, 9.0, 0, mobile_div=None)
if 'L1' in which:
    b = bbox_of(-119.5, -84.5, 12.5, 34.5, 20)
    layers['L1'] = render('geo-l1', 4.0, *b, True, 7, 5.5, 0.06)
if 'L2' in which:
    b = bbox_of(-104.9, -99.0, 17.2, 21.3, 6)
    layers['L2'] = render('geo-l2', 16.0, *b, True, 9, 4.5, 0.07)
json.dump(layers, open(f'{OUT}/layers-{"-".join(which)}.json', 'w'), indent=1)
print(json.dumps(layers))

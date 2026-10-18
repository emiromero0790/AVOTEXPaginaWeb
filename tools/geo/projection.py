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


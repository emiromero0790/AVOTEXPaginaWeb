import json, math, numpy as np
from shapely.geometry import shape, Point, LineString, MultiLineString, GeometryCollection
from shapely.ops import unary_union, linemerge
import importlib.util
spec = importlib.util.spec_from_file_location('g', './projection.py'); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
RAW = './raw'
st = json.load(open(f'{RAW}/ne_states.geojson'))
mex = [shape(f['geometry']).buffer(0) for f in st['features'] if f['properties'].get('adm0_a3') == 'MEX']
mich = [shape(f['geometry']).buffer(0) for f in st['features'] if f['properties'].get('iso_3166_2') == 'MX-MIC'][0]
mexU = unary_union(mex)
outline = mexU.boundary
internal = linemerge(unary_union([s.boundary for s in mex]).difference(outline.buffer(0.002)))
co50 = json.load(open(f'{RAW}/ne_countries50.geojson'))
amer = [shape(f['geometry']).buffer(0) for f in co50['features'] if f['properties']['CONTINENT'] in ('North America', 'South America') and f['properties']['ADM0_A3'] != 'GRL']
landU = unary_union(amer)
intl = unary_union([c.boundary for c in amer]).difference(landU.boundary.buffer(0.01))
coast = landU.boundary

def lines(geom):
    if geom.is_empty: return []
    if isinstance(geom, LineString): return [geom]
    if hasattr(geom, 'geoms'):
        out = []
        for x in geom.geoms: out += lines(x)
        return out
    if geom.geom_type in ('Polygon',): return [geom.exterior] + list(geom.interiors)
    return []
def polys_rings(geom):
    out = []
    for p in (geom.geoms if hasattr(geom, 'geoms') else [geom]):
        out.append(p.exterior); out += list(p.interiors)
    return out

def to_path(ls_list, tol, closed=False, minlen=0, dec=1):
    parts = []
    for ls in ls_list:
        ls = ls.simplify(tol, preserve_topology=False)
        c = np.asarray(ls.coords)
        if len(c) < 2: continue
        x, y, vis = g.fwd(c[:, 0], c[:, 1])
        if (vis < 0.02).any(): continue
        if minlen and np.hypot(np.diff(x), np.diff(y)).sum() < minlen: continue
        s = 'M' + ' '.join(f'{a:.{dec}f} {b:.{dec}f}' for a, b in zip(x, y))
        parts.append(s + ('Z' if closed else ''))
    return ''.join(parts)

def ll(lon, lat):
    x, y, _ = g.fwd(np.array([lon]), np.array([lat])); return [round(float(x[0]), 3), round(float(y[0]), 3)]

mc = mich.representative_point()
b = mich.bounds
data = dict(
    proj=dict(lon0=g.LON0, lat0=g.LAT0, R=g.R0, C=g.C0),
    states=to_path(lines(internal), 0.006, dec=2),
    mexico=to_path(polys_rings(mexU), 0.006, True, minlen=1.0, dec=2),
    mich=to_path(polys_rings(mich), 0.0015, True, dec=2),
    borders=to_path(lines(intl), 0.03),

    pts=dict(
        uruapan=ll(-102.0565, 19.4119),
        mich=ll(mich.centroid.x, mich.centroid.y),
        michBox=[ll(b[0], b[3]), ll(b[2], b[1])],
        mexico=ll(-102.5, 23.6),
        mexBox=[ll(-117.2, 32.7), ll(-86.7, 14.5)],
        na=ll(-100, 37), ca=ll(-86, 14), am=ll(-80, 6),
    ))
s = json.dumps(data, separators=(',', ':'))
open('./out/geo-vectors.json', 'w').write(s)
print(len(s), {k: len(v) for k, v in data.items() if isinstance(v, str)}, data['pts'])

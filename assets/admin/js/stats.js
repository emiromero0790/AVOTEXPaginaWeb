/**
 * AVOTEX Admin — estadísticas (funciones puras: sin red ni DOM; se prueban en tests/admin-stats.test.mjs).
 *
 * UNIDAD DE CONTEO
 *   «Análisis» = un resultado de IA sobre una foto:
 *     · Foto individual  → una fila de public.scans.
 *     · Recorrido        → una fila de public.hallazgos (resultado de una foto o grupo de fotos del recorrido).
 *   Los recorridos (public.recorridos) son sesiones: aportan contexto (número de recorridos, fotos tomadas y
 *   fotos analizadas), pero NO suman diagnósticos. Ambas fuentes se leen por separado: no hay JOIN y nada se
 *   cuenta dos veces.
 *
 * CLASIFICACIÓN (misma regla que la app AVOTEX, services/escaneos.ts → categoria)
 *   1. No concluyente: el modelo dijo «no es fruto» (fruto o etiqueta nofruta) o no hay etiqueta.
 *      → fuera de todos los porcentajes; se informa aparte.
 *   2. Requiere revisión: confianza < 60 % (el modelo no está seguro de su etiqueta).
 *   3. Saludable: etiqueta saludable / healthy / sano / fresh / fresco (sin negación).
 *   4. Con problema: cualquier otra etiqueta con confianza ≥ 60 % (antracnosis, mancha negra, …).
 *   La confianza NO es un porcentaje de salud: un 95 % de confianza en «antracnosis» es un problema.
 *
 * TASA DE RESULTADOS SALUDABLES = saludables / (saludables + con problema) × 100.
 *   Los de «requiere revisión» no entran al denominador (no son concluyentes) y se muestran aparte.
 */

export const CONF_THRESHOLD = 0.6;
const HEALTHY = ['saludable', 'healthy', 'sano', 'fresh', 'fresco'];
const NOT_FRUIT = new Set(['nofruta', 'no fruta', 'no es fruto', 'not a fruit', 'notafruit', 'no_fruta']);

export const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export function isHealthyLabel(label) {
  const n = norm(label);
  if (/\b(no|not|sin)\s+(saludable|healthy|sano|fresh|fresco)\b/.test(n)) return false;
  return HEALTHY.some(h => n.includes(h));
}

/** Confianza 0–1 (acepta 0–100 por si algún registro antiguo la guardó en porcentaje). */
export function conf01(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return x > 1 ? Math.min(1, x / 100) : Math.max(0, x);
}

/** 'sano' | 'revisar' | 'problema' | 'inconcluso' */
export function classify({ fruto, label, conf }) {
  const f = norm(fruto), l = norm(label);
  if (!l || NOT_FRUIT.has(f) || NOT_FRUIT.has(l) || NOT_FRUIT.has(f.replace(/ /g, '')) || NOT_FRUIT.has(l.replace(/ /g, ''))) return 'inconcluso';
  const c = conf01(conf);
  if (c !== null && c < CONF_THRESHOLD) return 'revisar';
  return isHealthyLabel(label) ? 'sano' : 'problema';
}

const CROPS = {
  aguacate: 'Aguacate', avocado: 'Aguacate', palta: 'Aguacate',
  limon: 'Limón', lemon: 'Limón', lima: 'Limón', lime: 'Limón',
  cafe: 'Café', coffee: 'Café',
  mango: 'Mango', guayaba: 'Guayaba', guava: 'Guayaba',
  berries: 'Berries', berry: 'Berries', fresa: 'Berries', zarzamora: 'Berries', arandano: 'Berries', frambuesa: 'Berries',
  granada: 'Granada', pomegranate: 'Granada',
};
export function cropName(fruto) {
  const n = norm(fruto);
  if (!n) return 'Sin cultivo';
  if (CROPS[n]) return CROPS[n];
  return n.charAt(0).toUpperCase() + n.slice(1);
}
/** Nombre legible de una clase del modelo, tal cual (sin traducir a algo que no dijo). */
export function labelName(label) {
  const n = String(label ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return 'Sin etiqueta';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Une las dos fuentes en una sola lista de análisis (sin duplicar).
 * scans: {user_email, huerta_id, label, score, fruto, created_at}
 * hallazgos: {id, recorrido_id, user_email, huerta_id, fruto, estado, confianza, tomada_at, miniatura_path}
 */
export function buildAnalyses(scans = [], hallazgos = []) {
  const out = [];
  scans.forEach((s, i) => {
    out.push({
      key: 's' + (s.id ?? i), source: 'foto', user: s.user_email ?? null, huerta: s.huerta_id ?? null,
      crop: cropName(s.fruto), fruto: s.fruto ?? null, label: s.label ?? null, conf: conf01(s.score),
      date: Date.parse(s.created_at) || 0, cat: classify({ fruto: s.fruto, label: s.label, conf: s.score }),
      recorrido: null, thumb: null,
    });
  });
  hallazgos.forEach((h, i) => {
    out.push({
      key: 'h' + (h.id ?? i), source: 'recorrido', user: h.user_email ?? null, huerta: h.huerta_id ?? null,
      crop: cropName(h.fruto), fruto: h.fruto ?? null, label: h.estado ?? null, conf: conf01(h.confianza),
      date: Date.parse(h.tomada_at) || 0, cat: classify({ fruto: h.fruto, label: h.estado, conf: h.confianza }),
      recorrido: h.recorrido_id ?? null, thumb: h.miniatura_path || null,
    });
  });
  return out;
}

// ───────── periodos ─────────

export const PERIODS = { 7: '7 días', 30: '30 días', 90: '90 días', 180: '6 meses', 365: '12 meses', all: 'Todo el historial' };
export function rangeOf(period, now = Date.now()) {
  if (period === 'all') return { from: 0, to: now, prevFrom: null, prevTo: null };
  const ms = Number(period) * 86400000;
  return { from: now - ms, to: now, prevFrom: now - 2 * ms, prevTo: now - ms };
}
export const inRange = (t, from, to) => t >= from && t <= to;

/** Variación porcentual frente al periodo anterior; null si no hay base comparable (sin inventar). */
export function trend(cur, prev) {
  if (prev === null || prev === undefined || !Number.isFinite(prev) || prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

// ───────── distribución de resultados ─────────

export function distribution(analyses) {
  const d = { sano: 0, revisar: 0, problema: 0, inconcluso: 0 };
  for (const a of analyses) d[a.cat]++;
  const evaluated = d.sano + d.revisar + d.problema; // donut: los tres estados
  const conclusive = d.sano + d.problema;            // tasa saludable
  return {
    ...d, evaluated, conclusive,
    pct: {
      sano: evaluated ? (d.sano / evaluated) * 100 : null,
      revisar: evaluated ? (d.revisar / evaluated) * 100 : null,
      problema: evaluated ? (d.problema / evaluated) * 100 : null,
    },
    healthyRate: conclusive ? (d.sano / conclusive) * 100 : null,
  };
}

export function byCrop(analyses) {
  const m = new Map();
  for (const a of analyses) {
    if (a.cat === 'inconcluso') continue;
    const r = m.get(a.crop) ?? { crop: a.crop, n: 0, sano: 0, revisar: 0, problema: 0 };
    r.n++; r[a.cat]++;
    m.set(a.crop, r);
  }
  const total = [...m.values()].reduce((s, r) => s + r.n, 0);
  return [...m.values()].map(r => ({ ...r, pct: total ? (r.n / total) * 100 : 0 })).sort((a, b) => b.n - a.n || a.crop.localeCompare(b.crop));
}

/** Diagnósticos con problema (confianza suficiente) por clase y cultivo. */
export function topDiseases(analyses, limit = 8) {
  const m = new Map();
  let total = 0;
  for (const a of analyses) {
    if (a.cat !== 'problema') continue;
    total++;
    const k = norm(a.label) + '|' + a.crop;
    const r = m.get(k) ?? { label: labelName(a.label), crop: a.crop, n: 0 };
    r.n++;
    m.set(k, r);
  }
  return [...m.values()].map(r => ({ ...r, pct: total ? (r.n / total) * 100 : 0 })).sort((a, b) => b.n - a.n).slice(0, limit);
}

// ───────── series temporales ─────────

const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const weekStart = t => { const d = new Date(dayStart(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const monthStart = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const step = (t, g, k = 1) => { const d = new Date(t); if (g === 'day') d.setDate(d.getDate() + k); else if (g === 'week') d.setDate(d.getDate() + 7 * k); else d.setMonth(d.getMonth() + k); return d.getTime(); };
const ALIGN = { day: dayStart, week: weekStart, month: monthStart };

export function granularity(period) { return period === 7 || period === 30 ? 'day' : period === 90 ? 'week' : 'month'; }

/**
 * Cubos con 0 donde no hubo actividad. dates: lista de ms.
 * g opcional ('day' | 'week' | 'month'); si no, se elige según el periodo. Máximo 120 cubos: se conservan
 * los MÁS RECIENTES (nunca se recorta el final del rango).
 */
export function series(dates, period, now = Date.now(), firstDate = null, g = null) {
  g = g || granularity(period === 'all' ? 'all' : Number(period));
  const align = ALIGN[g];
  let from;
  if (period === 'all') {
    const min = firstDate ?? (dates.length ? Math.min(...dates) : null);
    if (min === null) return { g, buckets: [] };
    from = align(min);
  } else from = align(now - Number(period) * 86400000);
  const buckets = [];
  for (let t = align(now); t >= from && buckets.length < 120; t = step(t, g, -1)) buckets.push({ start: t, end: step(t, g), n: 0 });
  buckets.reverse();
  for (const d of dates) {
    let lo = 0, hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, b = buckets[mid];
      if (d < b.start) hi = mid - 1; else if (d >= b.end) lo = mid + 1; else { b.n++; break; }
    }
  }
  return { g, buckets };
}

/** Suma de un valor por cubo (p. ej. fotos analizadas por recorrido). items: [{t, v}] */
export function seriesSum(items, buckets) {
  const out = buckets.map(b => ({ ...b, n: 0 }));
  for (const it of items) {
    const b = out.find(x => it.t >= x.start && it.t < x.end);
    if (b) b.n += Number(it.v) || 0;
  }
  return out;
}

// ───────── huertas ─────────

/** Estadísticas por huerta (relación directa por huerta_id). */
export function huertaStats(huerta, analyses, recorridos, reportes) {
  const own = analyses.filter(a => a.huerta === huerta.id);
  const walks = recorridos.filter(r => r.huerta_id === huerta.id);
  const reps = reportes.filter(r => r.huerta_id === huerta.id);
  const dist = distribution(own);
  const lastAnalysis = own.reduce((m, a) => Math.max(m, a.date), 0);
  const lastWalk = walks.reduce((m, w) => Math.max(m, Date.parse(w.iniciado_at) || 0), 0);
  return {
    fotos: own.filter(a => a.source === 'foto').length,
    resultadosRecorrido: own.filter(a => a.source === 'recorrido').length,
    recorridos: walks.length,
    fotosAnalizadas: walks.reduce((s, w) => s + (Number(w.fotos_analizadas) || 0), 0),
    fotosTomadas: walks.reduce((s, w) => s + (Number(w.fotos_total) || 0), 0),
    hallazgosProblema: dist.problema,
    dist,
    crops: byCrop(own),
    diseases: topDiseases(own, 5),
    lastInspection: Math.max(lastAnalysis, lastWalk) || null,
    reportes: reps,
    sample: dist.conclusive,
  };
}

/** Superficie en hectáreas (area_m2). */
export const hectares = m2 => (Number(m2) || 0) / 10000;

/** Polígono normalizado (0–100) a partir de coordinates [{latitude, longitude}] o [[lng, lat]]. */
export function polygonPoints(coordinates, w = 100, h = 70, padding = 8) {
  if (!Array.isArray(coordinates)) return null;
  const pts = coordinates.map(c => Array.isArray(c) ? { lat: Number(c[1]), lng: Number(c[0]) } : { lat: Number(c?.latitude ?? c?.lat), lng: Number(c?.longitude ?? c?.lng) })
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 3) return null;
  const minLat = Math.min(...pts.map(p => p.lat)), maxLat = Math.max(...pts.map(p => p.lat));
  const minLng = Math.min(...pts.map(p => p.lng)), maxLng = Math.max(...pts.map(p => p.lng));
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const sw = Math.max(1e-9, (maxLng - minLng) * k), sh = Math.max(1e-9, maxLat - minLat);
  const s = Math.min((w - 2 * padding) / sw, (h - 2 * padding) / sh);
  const ox = (w - sw * s) / 2, oy = (h - sh * s) / 2;
  return pts.map(p => `${(ox + (p.lng - minLng) * k * s).toFixed(1)},${(oy + (maxLat - p.lat) * s).toFixed(1)}`).join(' ');
}

/** Bounding box (para la imagen satelital de Esri) con margen y proporción. */
export function bboxOf(coordinates, ratio = 1.5) {
  if (!Array.isArray(coordinates)) return null;
  const pts = coordinates.map(c => Array.isArray(c) ? [Number(c[0]), Number(c[1])] : [Number(c?.longitude ?? c?.lng), Number(c?.latitude ?? c?.lat)])
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 3) return null;
  let minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
  let minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const k = Math.cos(cy * Math.PI / 180);
  let w = Math.max(maxX - minX, 0.0004) * 1.35 * k, h = Math.max(maxY - minY, 0.0004) * 1.35;
  if (w / h < ratio) w = h * ratio; else h = w / ratio;
  return { minX: cx - w / k / 2, maxX: cx + w / k / 2, minY: cy - h / 2, maxY: cy + h / 2, pts };
}

// ───────── tokens ─────────

export const PLAN_TOKENS = { free: 2500, basic: 45000, pro: 250000 };
export function planKey(raw) {
  const v = norm(raw);
  if (v.includes('pro') || v.includes('satel')) return 'pro';
  if (v.includes('basic') || v.includes('basico')) return 'basic';
  return 'free';
}
export const PLAN_LABEL = { free: 'Free', basic: 'Básico', pro: 'Plan Pro' };
/** Tokens visibles al usuario (la app muestra users.tokens × 100). */
export const visibleTokens = t => (Number(t) || 0) * 100;
/** Saldo bajo: menos del 10 % de los tokens mensuales de su plan. */
export function lowBalance(user) {
  return visibleTokens(user.tokens) < PLAN_TOKENS[planKey(user.plan_suscripcion)] * 0.1;
}

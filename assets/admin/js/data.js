/**
 * AVOTEX Admin — acceso a datos.
 *
 * Modo seguro (preferido): /api/admin (Vercel) verifica el token de Firebase y usa la service role en el servidor.
 * Modo directo (respaldo): si /api/admin aún no está configurado (503) o no existe (sitio estático), se consulta
 * Supabase con la clave anon, exactamente como hacía el panel anterior. El panel lo indica con un aviso, porque
 * en este modo la autorización depende de que RLS esté configurado (ver docs/admin-seguridad.md).
 */
const SB_URL = 'https://rnlnomhgtscmdqqyyyyz.supabase.co';
// Clave pública «anon» (la misma que ya usaba esta página y la app). No es la service role.
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubG5vbWhndHNjbWRxcXl5eXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5MDMwMTYsImV4cCI6MjA3MzQ3OTAxNn0.iEdqe3gmo4ANUcJDZttbNOna7llWyrHrlCl3k0rfXSc';

const SELECTS = {
  users: ['user_email,tokens,plan_suscripcion', 'user_email.asc'],
  huertas: ['id,user_email,nombre,coordinates,center_lat,center_lng,area_m2,created_at', 'created_at.asc'],
  reportes: ['id,created_at,user_email,huerta_id,ndvi,ndre,msavi,reci,ndmi,precipitacion,humedad,cobertura_nubes,viento,temp_max,temp_min', 'created_at.desc'],
  scans: ['user_email,huerta_id,label,score,fruto,created_at', 'created_at.desc'],
  recorridos: ['id,user_email,huerta_id,estado,iniciado_at,terminado_at,fotos_total,fotos_analizadas,hallazgos_total', 'iniciado_at.desc'],
  hallazgos: ['id,recorrido_id,user_email,huerta_id,fruto,estado,confianza,tomada_at,miniatura_path', 'tomada_at.desc'],
};
// Columnas mínimas si alguna reciente no existe todavía (p. ej. plan_suscripcion o scans.huerta_id).
const FALLBACK_SELECTS = {
  users: 'user_email,tokens',
  scans: 'user_email,label,score,fruto,created_at',
  reportes: 'id,created_at,user_email,ndvi,ndre,msavi,reci,ndmi,precipitacion,humedad,cobertura_nubes,viento,temp_max,temp_min',
};

export class ApiError extends Error {
  constructor(message, status, details) { super(message); this.status = status; this.details = details; }
}

let mode = null; // 'api' | 'direct'
export const getMode = () => mode;

async function callApi(getToken, payload) {
  const token = await getToken();
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw new ApiError(body?.error || `HTTP ${r.status}`, r.status, body);
  return body;
}

async function directAll(table, select, order) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${order ? `&order=${order}` : ''}`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, Accept: 'application/json', Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new ApiError(`${table}: ${r.status}`, r.status, await r.json().catch(() => null));
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function directSnapshot() {
  const entries = await Promise.all(Object.entries(SELECTS).map(async ([t, [sel, ord]]) => {
    try { return [t, await directAll(t, sel, ord)]; }
    catch (e) {
      // Columna inexistente (400): se reintenta con lo mínimo para no dejar el panel vacío.
      if (e.status === 400 && FALLBACK_SELECTS[t]) return [t, await directAll(t, FALLBACK_SELECTS[t], ord)];
      throw e;
    }
  }));
  return Object.fromEntries(entries);
}

/** Carga todo lo que usa el panel (una sola vez; los filtros se aplican en memoria). */
export async function loadSnapshot(getToken) {
  if (mode !== 'direct') {
    try {
      const res = await callApi(getToken, { action: 'snapshot' });
      mode = 'api';
      return res.data;
    } catch (e) {
      // 401/403: el servidor dice que NO es administrador → no se cae al modo directo.
      if (e.status === 401 || e.status === 403) throw e;
      // 404 (sin funciones), 503 (sin configurar) o red: modo directo como el panel anterior.
      if (e.status !== 404 && e.status !== 503 && e.status !== 405 && e.status !== undefined && e.status !== 500) throw e;
      mode = 'direct';
    }
  }
  return directSnapshot();
}

/** Inserta un reporte. En modo seguro valida y comprueba la pertenencia de la huerta en el servidor. */
export async function createReport(getToken, report, huertas) {
  if (mode === 'api') {
    const res = await callApi(getToken, { action: 'createReport', report });
    return res.report;
  }
  // Modo directo: validación en el navegador + (si se ejecutó docs/sql) el trigger de la base rechaza
  // huertas de otro usuario.
  const v = window.AvxReportRules.validate(report);
  if (!v.ok) throw new ApiError('validation', 400, { errors: v.errors });
  const h = huertas.find(x => x.id === v.row.huerta_id);
  if (!h || String(h.user_email).toLowerCase() !== v.row.user_email.toLowerCase()) {
    throw new ApiError('validation', 400, { errors: { huerta_id: 'La huerta no pertenece a este cliente.' } });
  }
  const r = await fetch(`${SB_URL}/rest/v1/reportes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, Prefer: 'return=representation' },
    body: JSON.stringify(v.row),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError('insert_failed', r.status, { message: body?.message || body?.hint || 'No se pudo guardar.' });
  return Array.isArray(body) ? body[0] : body;
}

/** URLs firmadas de miniaturas de hallazgos (solo en modo seguro; en directo no se muestran). */
export async function signedUrls(getToken, paths) {
  if (mode !== 'api' || !paths.length) return {};
  try { return (await callApi(getToken, { action: 'signedUrls', paths })).urls || {}; } catch { return {}; }
}

/** Imagen satelital (Esri World Imagery) del recuadro de una huerta. */
export function satelliteUrl(b, w = 360, h = 240) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${b.minX},${b.minY},${b.maxX},${b.maxY}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=jpg&f=image`;
}

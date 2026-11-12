/*
 * Vercel Serverless Function — API del panel AVOTEX Admin (avotex-admin.html).
 *
 * Por qué existe: antes el panel leía y escribía TODO con la clave anon pública y solo comparaba el correo en
 * JavaScript. Eso no protege nada: cualquiera con la clave anon puede consultar o insertar directamente.
 * Aquí la autorización se hace en el servidor:
 *   1. El navegador envía el ID token de Firebase (Authorization: Bearer <token>).
 *   2. Se verifica con Google (Identity Toolkit accounts:lookup): token vigente y firmado para este proyecto.
 *   3. Es administrador solo si tiene el claim personalizado admin=true o su correo está en ADMIN_EMAILS.
 *   4. Solo entonces se consulta Supabase con la service role key, que NUNCA sale del servidor.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL                 https://<proyecto>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    service role (secreta)
 *   FIREBASE_WEB_API_KEY         la apiKey pública del proyecto Firebase (la misma del navegador)
 *   ADMIN_EMAILS                 correos administradores separados por comas (p. ej. vexmxoficial@gmail.com)
 * Sin ellas responde 503 {error:'not_configured'} y el panel trabaja en «modo directo» (como antes).
 *
 * Acciones (POST JSON {action, ...}):
 *   snapshot       → usuarios, huertas, reportes, scans, recorridos, hallazgos (solo columnas necesarias).
 *   createReport   → valida (assets/admin/js/report-rules.js), comprueba que el cliente exista y que la huerta
 *                    exista y sea SUYA, e inserta en public.reportes (UUID y created_at los pone PostgreSQL).
 *   signedUrls     → URLs firmadas (10 min) de miniaturas de hallazgos (bucket privado «recorridos»).
 */
const rules = require('../assets/admin/js/report-rules.js');

const PAGE = 1000;
const MAX_ROWS = 50000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function config() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const fb = process.env.FIREBASE_WEB_API_KEY || '';
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!url || !key || !fb || !admins.length) return null;
  return { url, key, fb, admins };
}

async function verifyAdmin(req, cfg) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token || token.length > 4096) return { ok: false, status: 401, error: 'missing_token' };
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.fb)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return { ok: false, status: 401, error: 'invalid_token' };
  const data = await r.json().catch(() => null);
  const u = data && Array.isArray(data.users) ? data.users[0] : null;
  if (!u || u.disabled) return { ok: false, status: 401, error: 'invalid_token' };
  let claims = {};
  try { claims = u.customAttributes ? JSON.parse(u.customAttributes) : {}; } catch (_) { claims = {}; }
  const email = String(u.email || '').toLowerCase();
  const isAdmin = claims.admin === true || (email && cfg.admins.includes(email));
  if (!isAdmin) return { ok: false, status: 403, error: 'forbidden' };
  return { ok: true, email };
}

function sbHeaders(cfg, extra) {
  return Object.assign({ apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: 'application/json' }, extra || {});
}

/** Lee una tabla completa por páginas (Range), con las columnas pedidas. */
async function readAll(cfg, table, select, order) {
  const out = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const r = await fetch(`${cfg.url}/rest/v1/${table}?select=${encodeURIComponent(select)}${order ? `&order=${order}` : ''}`, {
      headers: sbHeaders(cfg, { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' }),
    });
    if (!r.ok) {
      const body = await r.text();
      const err = new Error(`${table}: ${r.status} ${body.slice(0, 200)}`);
      err.status = r.status;
      throw err;
    }
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const SELECTS = {
  users: ['user_email,tokens,plan_suscripcion', 'user_email.asc'],
  huertas: ['id,user_email,nombre,coordinates,center_lat,center_lng,area_m2,created_at', 'created_at.asc'],
  reportes: ['id,created_at,user_email,huerta_id,ndvi,ndre,msavi,reci,ndmi,precipitacion,humedad,cobertura_nubes,viento,temp_max,temp_min', 'created_at.desc'],
  scans: ['user_email,huerta_id,label,score,fruto,created_at', 'created_at.desc'],
  recorridos: ['id,user_email,huerta_id,estado,iniciado_at,terminado_at,fotos_total,fotos_analizadas,hallazgos_total', 'iniciado_at.desc'],
  hallazgos: ['id,recorrido_id,user_email,huerta_id,fruto,estado,confianza,tomada_at,miniatura_path', 'tomada_at.desc'],
};

async function snapshot(cfg) {
  const entries = await Promise.all(Object.entries(SELECTS).map(async ([t, [sel, ord]]) => [t, await readAll(cfg, t, sel, ord)]));
  return Object.fromEntries(entries);
}

async function createReport(cfg, input) {
  const v = rules.validate(input);
  if (!v.ok) return { status: 400, body: { error: 'validation', errors: v.errors } };
  const row = v.row;
  // El cliente existe.
  const u = await fetch(`${cfg.url}/rest/v1/users?select=user_email&user_email=eq.${encodeURIComponent(row.user_email)}`, { headers: sbHeaders(cfg) });
  const users = u.ok ? await u.json() : [];
  if (!users.length) return { status: 400, body: { error: 'validation', errors: { user_email: 'El cliente no existe.' } } };
  // La huerta existe y pertenece a ese cliente.
  const h = await fetch(`${cfg.url}/rest/v1/huertas?select=id,user_email&id=eq.${encodeURIComponent(row.huerta_id)}`, { headers: sbHeaders(cfg) });
  const hs = h.ok ? await h.json() : [];
  if (!hs.length) return { status: 400, body: { error: 'validation', errors: { huerta_id: 'La huerta no existe.' } } };
  if (String(hs[0].user_email).toLowerCase() !== row.user_email.toLowerCase()) {
    return { status: 400, body: { error: 'validation', errors: { huerta_id: 'La huerta no pertenece a este cliente.' } } };
  }
  const ins = await fetch(`${cfg.url}/rest/v1/reportes`, {
    method: 'POST',
    headers: sbHeaders(cfg, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  const body = await ins.json().catch(() => null);
  if (!ins.ok) return { status: 502, body: { error: 'insert_failed', message: (body && (body.message || body.hint)) || 'No se pudo guardar.' } };
  return { status: 201, body: { report: Array.isArray(body) ? body[0] : body } };
}

async function signedUrls(cfg, paths) {
  const list = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && p && !p.includes('..')).slice(0, 50);
  if (!list.length) return {};
  const r = await fetch(`${cfg.url}/storage/v1/object/sign/recorridos`, {
    method: 'POST', headers: sbHeaders(cfg, { 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 600, paths: list }),
  });
  if (!r.ok) return {};
  const data = await r.json().catch(() => []);
  const out = {};
  for (const it of Array.isArray(data) ? data : []) if (it && it.path && it.signedURL) out[it.path] = `${cfg.url}/storage/v1${it.signedURL}`;
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const cfg = config();
  if (!cfg) return send(res, 503, { error: 'not_configured' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'bad_request' });
  try {
    const auth = await verifyAdmin(req, cfg);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    if (body.action === 'snapshot') return send(res, 200, { admin: auth.email, data: await snapshot(cfg) });
    if (body.action === 'createReport') { const r = await createReport(cfg, body.report || {}); return send(res, r.status, r.body); }
    if (body.action === 'signedUrls') return send(res, 200, { urls: await signedUrls(cfg, body.paths) });
    return send(res, 400, { error: 'unknown_action' });
  } catch (e) {
    console.error('[api/admin]', e && e.message);
    return send(res, 500, { error: 'server_error' });
  }
};

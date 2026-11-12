/* Pruebas del panel AVOTEX Admin (cálculos y validación de reportes). Ejecutar con: node --test tests/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as S from '../assets/admin/js/stats.js';

const require = createRequire(import.meta.url);
const R = require('../assets/admin/js/report-rules.js');
const handler = require('../api/admin.js');

test('classify: misma regla que la app', () => {
  assert.equal(S.classify({ fruto: 'aguacate', label: 'saludable', conf: 0.9 }), 'sano');
  assert.equal(S.classify({ fruto: 'aguacate', label: 'Healthy', conf: 92 }), 'sano'); // 0–100 tolerado
  assert.equal(S.classify({ fruto: 'aguacate', label: 'no saludable', conf: 0.9 }), 'problema');
  assert.equal(S.classify({ fruto: 'aguacate', label: 'antracnosis', conf: 0.95 }), 'problema');
  assert.equal(S.classify({ fruto: 'aguacate', label: 'antracnosis', conf: 0.4 }), 'revisar');
  assert.equal(S.classify({ fruto: 'nofruta', label: 'saludable', conf: 0.99 }), 'inconcluso');
  assert.equal(S.classify({ fruto: 'limon', label: '', conf: 0.9 }), 'inconcluso');
});

test('buildAnalyses: scans + hallazgos sin duplicar y con fuente', () => {
  const a = S.buildAnalyses(
    [{ user_email: 'a@x.com', huerta_id: 'h1', label: 'saludable', score: 0.9, fruto: 'aguacate', created_at: '2026-11-01T10:00:00Z' }],
    [{ id: 7, recorrido_id: 'r1', user_email: 'a@x.com', huerta_id: 'h1', fruto: 'aguacate', estado: 'roña', confianza: 0.8, tomada_at: '2026-11-02T10:00:00Z', miniatura_path: 'u/r1/7.jpg' }],
  );
  assert.equal(a.length, 2);
  assert.deepEqual(a.map(x => x.source), ['foto', 'recorrido']);
  assert.equal(a[1].cat, 'problema');
  assert.equal(a[1].thumb, 'u/r1/7.jpg');
});

test('distribution y tasa saludable: revisión e inconclusos fuera del denominador', () => {
  const list = ['sano', 'sano', 'sano', 'problema', 'revisar', 'inconcluso'].map(cat => ({ cat }));
  const d = S.distribution(list);
  assert.equal(d.evaluated, 5);
  assert.equal(d.conclusive, 4);
  assert.equal(d.healthyRate, 75);
  assert.equal(S.distribution([]).healthyRate, null);
});

test('trend: null sin base comparable', () => {
  assert.equal(S.trend(10, 0), null);
  assert.equal(S.trend(10, null), null);
  assert.equal(S.trend(15, 10), 50);
});

test('series: cubos con cero y conserva los más recientes', () => {
  const now = new Date(2026, 10, 12, 12).getTime();
  const s = S.series([now - 86400000, now - 86400000, now], 7, now);
  assert.equal(s.g, 'day');
  assert.equal(s.buckets.length, 8);
  assert.equal(s.buckets.at(-1).n, 1);
  assert.equal(s.buckets.at(-2).n, 2);
  assert.equal(s.buckets.reduce((x, b) => x + b.n, 0), 3);
  // 'all' por día con historial de 3 años: máximo 120 cubos, el último es hoy
  const old = new Date(2023, 0, 1).getTime();
  const all = S.series([old, now], 'all', now, null, 'day');
  assert.equal(all.buckets.length, 120);
  assert.equal(all.buckets.at(-1).n, 1);
});

test('byCrop y topDiseases solo cuentan lo real', () => {
  const a = [
    { crop: 'Aguacate', cat: 'sano', label: 'saludable' },
    { crop: 'Aguacate', cat: 'problema', label: 'antracnosis' },
    { crop: 'Limón', cat: 'problema', label: 'antracnosis' },
    { crop: 'Limón', cat: 'inconcluso', label: '' },
  ];
  const c = S.byCrop(a);
  assert.deepEqual(c.map(x => [x.crop, x.n]), [['Aguacate', 2], ['Limón', 1]]);
  const d = S.topDiseases(a);
  assert.equal(d.length, 2);
  assert.ok(d.every(x => x.label === 'Antracnosis'));
});

test('huertaStats relaciona por huerta_id', () => {
  const h = { id: 'h1', area_m2: 25000 };
  const a = [{ huerta: 'h1', source: 'foto', cat: 'sano', date: 1, crop: 'Aguacate' }, { huerta: 'h2', source: 'foto', cat: 'problema', date: 2, crop: 'Aguacate' }];
  const s = S.huertaStats(h, a, [{ huerta_id: 'h1', iniciado_at: '2026-11-01', fotos_total: 10, fotos_analizadas: 8 }], []);
  assert.equal(s.fotos, 1);
  assert.equal(s.recorridos, 1);
  assert.equal(s.fotosAnalizadas, 8);
  assert.equal(s.dist.healthyRate, 100);
  assert.equal(S.hectares(h.area_m2), 2.5);
});

test('polygonPoints / bboxOf aceptan ambos formatos de coordenadas', () => {
  const objs = [{ latitude: 19.4, longitude: -102.0 }, { latitude: 19.41, longitude: -102.0 }, { latitude: 19.41, longitude: -101.99 }];
  const arrs = objs.map(p => [p.longitude, p.latitude]);
  assert.equal(S.polygonPoints(objs), S.polygonPoints(arrs));
  assert.equal(S.polygonPoints([{ latitude: 1, longitude: 1 }]), null);
  const b = S.bboxOf(objs);
  assert.ok(b.minX < -102.0 && b.maxX > -101.99 && b.minY < 19.4 && b.maxY > 19.41);
});

test('tokens: visibles ×100 y saldo bajo < 10 % del plan', () => {
  assert.equal(S.visibleTokens(4.5), 450);
  assert.equal(S.lowBalance({ tokens: 2, plan_suscripcion: 'free' }), true); // 200 < 250
  assert.equal(S.lowBalance({ tokens: 3, plan_suscripcion: 'free' }), false);
  assert.equal(S.planKey('Plan Pro'), 'pro');
  assert.equal(S.planKey('básico'), 'basic');
});

const H = '0b6f7d6e-1c2a-4b1e-9a51-2f1c3d4e5f60';
test('reporte: huerta obligatoria, vacío ≠ 0, rangos y tmin ≤ tmax', () => {
  assert.equal(R.validate({ user_email: 'a@x.com', ndvi: 0.5 }).errors.huerta_id !== undefined, true);
  const ok = R.validate({ user_email: 'a@x.com', huerta_id: H, ndvi: '0', ndre: '', viento: '12,5', humedad: '60' });
  assert.equal(ok.ok, true);
  assert.equal(ok.row.ndvi, 0);         // 0 medido
  assert.equal(ok.row.ndre, null);      // vacío = sin dato
  assert.equal(ok.row.viento, 12.5);    // km/h, sin conversión
  assert.equal(R.validate({ user_email: 'a@x.com', huerta_id: H, ndvi: 1.4 }).errors.ndvi !== undefined, true);
  assert.equal(R.validate({ user_email: 'a@x.com', huerta_id: H, reci: 6 }).ok, true); // RECI no se limita a 0–1
  assert.equal(R.validate({ user_email: 'a@x.com', huerta_id: H, ndvi: 0.5, humedad: 50.5 }).errors.humedad !== undefined, true);
  assert.equal(R.validate({ user_email: 'a@x.com', huerta_id: H, ndvi: 0.5, temp_max: 10, temp_min: 20 }).errors.temp_min !== undefined, true);
  assert.equal(R.validate({ user_email: 'a@x.com', huerta_id: H, viento: 10 }).errors.veg !== undefined, true);
  assert.equal(R.validate({ user_email: 'a@x.com', huerta_id: H, ndvi: 'abc' }).errors.ndvi, 'Escribe un número.');
  assert.deepEqual(Object.keys(ok.row).sort(), ['cobertura_nubes', 'humedad', 'huerta_id', 'msavi', 'ndmi', 'ndre', 'ndvi', 'precipitacion', 'reci', 'temp_max', 'temp_min', 'user_email', 'viento'].sort());
});

// ───────── api/admin.js con fetch simulado ─────────
function mockRes() {
  return { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}
async function call(body, { token = 'tok', claims = null, email = 'admin@x.com', db = {} } = {}) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('identitytoolkit')) {
      if (JSON.parse(opts.body).idToken !== 'tok') return new Response('{}', { status: 400 });
      return Response.json({ users: [{ email, customAttributes: claims ? JSON.stringify(claims) : undefined }] });
    }
    if (url.includes('/rest/v1/users?')) return Response.json(db.users || []);
    if (url.includes('/rest/v1/huertas?')) return Response.json(db.huertas || []);
    if (url.includes('/rest/v1/reportes') && opts.method === 'POST') return Response.json([{ id: 'new', ...JSON.parse(opts.body) }], { status: 201 });
    return Response.json([]);
  };
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: token ? `Bearer ${token}` : '' }, body }, res);
  return { status: res.statusCode, body: JSON.parse(res.body), calls };
}

test('api: sin configuración responde 503 y nunca consulta Supabase', async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FIREBASE_WEB_API_KEY', 'ADMIN_EMAILS']) delete process.env[k];
  const r = await call({ action: 'snapshot' });
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 0);
});

test('api: autorización verificada en el servidor', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'service', FIREBASE_WEB_API_KEY: 'fb', ADMIN_EMAILS: 'admin@x.com' });
  assert.equal((await call({ action: 'snapshot' }, { token: '' })).status, 401);
  assert.equal((await call({ action: 'snapshot' }, { token: 'falso' })).status, 401);
  const noAdmin = await call({ action: 'snapshot' }, { email: 'otro@x.com' });
  assert.equal(noAdmin.status, 403);
  assert.ok(!noAdmin.calls.some(c => c.url.includes('sb.test')), 'no debe tocar Supabase si no es admin');
  assert.equal((await call({ action: 'snapshot' }, { email: 'otro@x.com', claims: { admin: true } })).status, 200);
  const ok = await call({ action: 'snapshot' });
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.body.data).sort(), ['hallazgos', 'huertas', 'recorridos', 'reportes', 'scans', 'users']);
});

test('api: createReport rechaza huerta de otro cliente e inserta solo columnas reales', async () => {
  const report = { user_email: 'cli@x.com', huerta_id: H, ndvi: '0.71', viento: '' };
  const ajena = await call({ action: 'createReport', report }, { db: { users: [{ user_email: 'cli@x.com' }], huertas: [{ id: H, user_email: 'otro@x.com' }] } });
  assert.equal(ajena.status, 400);
  assert.ok(ajena.body.errors.huerta_id);
  assert.ok(!ajena.calls.some(c => c.opts.method === 'POST' && c.url.includes('/rest/v1/reportes')));
  const sinCliente = await call({ action: 'createReport', report }, { db: { users: [], huertas: [{ id: H, user_email: 'cli@x.com' }] } });
  assert.equal(sinCliente.status, 400);
  const ok = await call({ action: 'createReport', report }, { db: { users: [{ user_email: 'cli@x.com' }], huertas: [{ id: H, user_email: 'CLI@x.com' }] } });
  assert.equal(ok.status, 201);
  const ins = ok.calls.find(c => c.opts.method === 'POST' && c.url.includes('/rest/v1/reportes'));
  const row = JSON.parse(ins.opts.body);
  assert.equal(row.huerta_id, H);
  assert.equal(row.ndvi, 0.71);
  assert.equal(row.viento, null);
  assert.ok(!('id' in row) && !('created_at' in row), 'id y created_at los genera PostgreSQL');
});

/*
 * Prueba de navegador de la experiencia inmersiva y ScreenX (admin.html).
 *
 * Usa Playwright con Chromium y reemplaza los servicios externos por dobles controlados:
 *  - Firebase Auth (sesión compartida entre ventanas, como la persistencia real de Firebase).
 *  - Supabase REST (filtra por user_email igual que las consultas reales).
 *  - Google Maps JavaScript API (StreetViewService / StreetViewPanorama), para no consumir cuota.
 *
 * Ejecutar desde la raíz del repositorio:  node --test tests/e2e/screenx.e2e.mjs
 * Requiere el paquete "playwright" (global o local) y un Chromium disponible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
    playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMAIL = 'agricultor@example.com';
const OTHER_EMAIL = 'otro@example.com';

// ───────── datos de prueba ─────────
const HUERTAS = [
    { id: 'h-tec', user_email: EMAIL, nombre: 'Tec', center_lat: 19.722, center_lng: -101.1849, area_m2: 126706,
        coordinates: [{ latitude: 19.7215, longitude: -101.1855 }, { latitude: 19.7215, longitude: -101.1843 }, { latitude: 19.7225, longitude: -101.1843 }, { latitude: 19.7225, longitude: -101.1855 }],
        detalles: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
    { id: 'h-uno', user_email: EMAIL, nombre: 'Huerta 1', center_lat: 19.8225, center_lng: -101.1222, area_m2: 72802,
        coordinates: [{ latitude: 19.822, longitude: -101.123 }, { latitude: 19.822, longitude: -101.121 }, { latitude: 19.823, longitude: -101.121 }],
        detalles: 'Ladera norte', created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' },
    { id: 'h-sin-sv', user_email: EMAIL, nombre: 'Sin Street View', center_lat: 19.9, center_lng: -101.3, area_m2: 1000,
        coordinates: [{ latitude: 19.899, longitude: -101.301 }, { latitude: 19.899, longitude: -101.299 }, { latitude: 19.901, longitude: -101.299 }],
        detalles: null, created_at: '2026-01-04T00:00:00Z', updated_at: '2026-01-04T00:00:00Z' },
    { id: 'h-sin-coord', user_email: EMAIL, nombre: 'Sin ubicación', center_lat: null, center_lng: null, area_m2: 0, coordinates: [],
        detalles: null, created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
    { id: 'h-ajena', user_email: OTHER_EMAIL, nombre: 'Huerta ajena', center_lat: 20.1, center_lng: -101.0, area_m2: 1000,
        coordinates: [], detalles: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
];
const SCANS = [
    { user_email: EMAIL, label: 'Saludable', score: 0.93, fruto: 'Aguacate', created_at: '2026-10-01T10:00:00Z' },
    { user_email: EMAIL, label: 'Antracnosis', score: 0.88, fruto: 'Aguacate', created_at: '2026-10-02T10:00:00Z' },
    { user_email: EMAIL, label: 'Saludable', score: 0.81, fruto: 'Mango', created_at: '2026-10-03T10:00:00Z' },
    { user_email: OTHER_EMAIL, label: 'Costra', score: 0.7, fruto: 'Aguacate', created_at: '2026-10-03T10:00:00Z' }
];
const REPORTES = [
    { id: 1, user_email: EMAIL, created_at: '2026-09-01T00:00:00Z', ndvi: 0.71, ndre: 0.33, msavi: 0.5, reci: 1.2, ndmi: 0.2, precipitacion: 45, humedad: 75, cobertura_nubes: 25, viento: 12, temp_max: 30, temp_min: 20 }
];
// Historial largo para la paginación: 30 de aguacate y 10 de mango, del más reciente al más antiguo.
const MANY_SCANS = Array.from({ length: 40 }, (_, i) => ({
    user_email: EMAIL,
    label: ['Saludable', 'Antracnosis', 'Costra', 'Saludable'][i % 4],
    score: 0.7 + (i % 30) / 100,
    fruto: i % 4 === 3 ? 'Mango' : 'Aguacate',
    created_at: new Date(Date.UTC(2026, 9, 30) - i * 3600e3 * 7).toISOString()
}));
// Panoramas falsos: Tec tiene uno dentro; Huerta 1 uno a ~400 m; "Sin Street View" ninguno.
const PANOS = [
    { near: [19.722, -101.1849], pano: 'pano-tec', lat: 19.72198, lng: -101.18476, imageDate: '2021-11', copyright: '© Usuario Ejemplo' },
    { near: [19.8225, -101.1222], pano: 'pano-uno', lat: 19.8235, lng: -101.1250, imageDate: '2024-10', copyright: '© 2026 Google' },
    { near: [19.8235, -101.1250], pano: 'pano-uno-b', lat: 19.8237, lng: -101.1252, imageDate: '2024-10', copyright: '© 2026 Google' }
];

// Enlaces entre panoramas (lo que Google devuelve en getLinks): un camino este-oeste.
const LINKS = {
    'pano-uno': [{ pano: 'pano-uno-b', heading: 90, description: 'Camino a Tarímbaro' }, { pano: 'pano-uno-o', heading: 270, description: '' }],
    'pano-uno-b': [{ pano: 'pano-uno', heading: 270, description: '' }],
    'pano-uno-o': [{ pano: 'pano-uno', heading: 90, description: '' }]
};

// ───────── dobles de servicios externos ─────────
const FAKE_FIREBASE_APP = `export function initializeApp(cfg) { return { cfg }; }`;
const FAKE_FIREBASE_AUTH = `
const KEY = 'fake_firebase_user';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const auth = { currentUser: read() };
export function getAuth() { return auth; }
export function onAuthStateChanged(a, cb) {
  setTimeout(() => { auth.currentUser = read(); cb(auth.currentUser); }, 30);
  // Igual que Firebase con persistencia local: un cierre de sesión en otra ventana llega aquí.
  window.addEventListener('storage', e => { if (e.key === KEY) { auth.currentUser = read(); cb(auth.currentUser); } });
  return () => {};
}
export async function signOut() { localStorage.removeItem(KEY); auth.currentUser = null; }
export async function signInWithEmailAndPassword() { throw new Error('no usado'); }
`;
const FAKE_MAPS = `
(function(){
  const params = new URL(document.currentScript.src).searchParams;
  window.__mapsLoads = (window.__mapsLoads || 0) + 1;
  window.__mapsParams = Object.fromEntries(params.entries());
  if (window.__fakeMapsAuthFail) { setTimeout(() => window.gm_authFailure && window.gm_authFailure(), 10); }
  const fixtures = window.__svFixtures || [];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 111000;
  class LatLng { constructor(lat, lng) { this._lat = lat; this._lng = lng; } lat() { return this._lat; } lng() { return this._lng; } }
  window.__svInstances = 0;
  window.__svSearches = 0;
  class StreetViewService {
    async getPanorama(req) {
      window.__svSearches++;
      const loc = [req.location.lat, req.location.lng];
      const hit = fixtures.filter(f => dist(f.near, loc) <= req.radius).sort((x, y) => dist(x.near, loc) - dist(y.near, loc))[0];
      if (!hit) { const e = new Error('ZERO_RESULTS'); e.code = 'ZERO_RESULTS'; throw e; }
      return { data: { location: { pano: hit.pano, latLng: new LatLng(hit.lat, hit.lng), description: 'Ejemplo' }, imageDate: hit.imageDate, copyright: hit.copyright, links: [] } };
    }
  }
  class StreetViewPanorama {
    constructor(el, opts) {
      window.__svInstances++;
      window.__svPanorama = this;
      this.el = el; this.opts = Object.assign({}, opts);
      this.pano = opts.pano; this.pov = Object.assign({ heading: 0, pitch: 0 }, opts.pov); this.zoom = opts.zoom ?? 1;
      this.listeners = {};
      el.setAttribute('data-fake-pano', this.pano);
      setTimeout(() => { this.fire('status_changed'); this.fire('links_changed'); }, 5);
    }
    getLinks() { return ((window.__svLinks || {})[this.pano] || []).map(l => Object.assign({}, l)); }
    fire(n) { (this.listeners[n] || []).forEach(f => f()); }
    addListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); return { remove: () => { this.listeners[n] = this.listeners[n].filter(x => x !== f); } }; }
    getPov() { return Object.assign({}, this.pov); }
    setPov(p) { this.pov = { heading: p.heading, pitch: p.pitch }; setTimeout(() => this.fire('pov_changed'), 0); }
    getZoom() { return this.zoom; }
    setZoom(z) { this.zoom = z; setTimeout(() => this.fire('zoom_changed'), 0); }
    getPano() { return this.pano; }
    setPano(id) { this.pano = id; this.el.setAttribute('data-fake-pano', id); setTimeout(() => { this.fire('pano_changed'); this.fire('status_changed'); this.fire('links_changed'); }, 0); }
    setVisible(v) { this.visible = v; }
    setOptions(o) { Object.assign(this.opts, o); }
    getStatus() { return 'OK'; }
    // Simula que la persona arrastra la vista (solo en pruebas).
    __userDrag(heading, pitch, zoom) { this.pov = { heading, pitch: pitch || 0 }; if (zoom != null) this.zoom = zoom; this.fire('pov_changed'); if (zoom != null) this.fire('zoom_changed'); }
  }
  const libs = {
    streetView: { StreetViewService, StreetViewPanorama, StreetViewPreference: { NEAREST: 'nearest', BEST: 'best' }, StreetViewSource: { DEFAULT: 'default', OUTDOOR: 'outdoor', GOOGLE: 'google' } },
    core: { ControlPosition: { RIGHT_BOTTOM: 9, RIGHT_CENTER: 8, TOP_CENTER: 2 }, event: {} }
  };
  google.maps.importLibrary = async (name) => libs[name];
  google.maps.version = 'fake';
  google.maps.__ib__();
})();
`;

function startServer(opts) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/maps-config') {
            res.setHeader('content-type', 'application/json');
            if (opts.noKey) { res.statusCode = 503; res.end('{"error":"not_configured"}'); return; }
            res.end(JSON.stringify({ apiKey: 'clave-de-prueba', version: 'quarterly' }));
            return;
        }
        let file = path.join(ROOT, decodeURIComponent(url.pathname));
        if (!file.startsWith(ROOT)) { res.statusCode = 403; res.end(); return; }
        if (url.pathname === '/') file = path.join(ROOT, 'index.html');
        if (path.basename(file) === 'avotex-maps.local.js') { res.statusCode = 404; res.end(); return; } // nunca usar la clave local en pruebas
        fs.readFile(file, (err, data) => {
            if (err) { res.statusCode = 404; res.end('no'); return; }
            const ext = path.extname(file);
            res.setHeader('content-type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp' }[ext] || 'application/octet-stream');
            res.end(data);
        });
    });
    return new Promise(r => server.listen(0, () => r(server)));
}

function supabaseHandler(opts) {
    return async route => {
        const url = new URL(route.request().url());
        if (opts.unauthorized) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"JWT expired"}' });
        const table = url.pathname.split('/').pop();
        const emailFilter = (url.searchParams.get('user_email') || '').replace(/^eq\./, '');
        const data = { huertas: HUERTAS, scans: opts.manyScans ? MANY_SCANS : SCANS, reportes: REPORTES }[table] || [];
        const rows = data.filter(r => r.user_email === emailFilter);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    };
}

async function setup(opts = {}) {
    const server = await startServer(opts);
    const base = `http://localhost:${server.address().port}`;
    const browser = await playwright.chromium.launch({ args: opts.launchArgs || [] });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await context.addInitScript(({ fixtures, authFail, links }) => {
        window.__svFixtures = fixtures;
        window.__svLinks = links;
        window.__fakeMapsAuthFail = authFail;
    }, { fixtures: PANOS, authFail: !!opts.mapsAuthFail, links: LINKS });
    await context.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FIREBASE_APP }));
    await context.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FIREBASE_AUTH }));
    await context.route('https://maps.googleapis.com/maps/api/js**', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_MAPS }));
    await context.route('https://rnlnomhgtscmdqqyyyyz.supabase.co/rest/v1/**', supabaseHandler(opts));
    // Recursos de terceros que no participan en la prueba.
    await context.route(/elevenlabs|convai-widget/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await context.route(/arcgisonline\.com/, r => r.fulfill({ status: 204, body: '' }));
    await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    // Sin acceso a las CDN (CI o contenedores aislados): AVOTEX_CDN_MIRROR=<carpeta node_modules>
    // con chart.js, leaflet y maplibre-gl instalados sirve las mismas versiones desde disco.
    const mirror = process.env.AVOTEX_CDN_MIRROR;
    if (mirror) {
        await context.route(/^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(@?[^/]+?)@[^/]+\/(.+)$/, r => {
            const m = /^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(@?[^/]+?)@[^/]+\/(.+)$/.exec(r.request().url());
            const file = m && path.join(mirror, m[1], m[2]);
            if (!file || !fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
            const type = file.endsWith('.css') ? 'text/css' : 'text/javascript';
            return r.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
        });
    }
    const errors = [];
    const newPage = async () => {
        const p = await context.newPage();
        p.on('pageerror', e => errors.push(e.message));
        return p;
    };
    const login = async (page, email = EMAIL) => {
        await page.goto(base + '/dashboard.html');
        await page.evaluate(e => localStorage.setItem('fake_firebase_user', JSON.stringify({ uid: 'uid-' + e, email: e })), email);
    };
    const close = async () => { await browser.close(); server.close(); };
    return { base, browser, context, newPage, login, close, errors };
}

const dbg = page => page.evaluate(() => window.AvotexInmersiva._debug());

// ───────── pruebas ─────────

test('sin sesión: redirige al login existente', async () => {
    const env = await setup();
    try {
        const page = await env.newPage();
        await page.goto(env.base + '/admin.html');
        await page.waitForURL(/dashboard\.html/, { timeout: 5000 });
        assert.match(page.url(), /dashboard\.html/);
    } finally { await env.close(); }
});

test('Vista normal: selector, Street View, huertas reales, paneles y errores de cobertura', async () => {
    const env = await setup();
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');

        // A. Selector de modalidad tras autenticar
        await page.waitForSelector('#modeSelector:not([hidden])');
        assert.equal(await page.textContent('#modeSelectorTitle'), '¿Cómo quieres explorar tu huerta?');
        assert.ok(await page.isVisible('text=Configurar ScreenX'));
        assert.ok(await page.isVisible('text=Entrar a mi huerta'));

        await page.click('text=Entrar a mi huerta');
        await page.waitForSelector('#hud:not([hidden])');

        // C. Selector con huertas del agricultor autenticado (no la ajena)
        await page.waitForFunction(() => document.querySelectorAll('#huertaSelect option').length === 4);
        const options = await page.$$eval('#huertaSelect option', o => o.map(x => x.textContent));
        assert.deepEqual(options, ['Tec', 'Huerta 1', 'Sin Street View', 'Sin ubicación']);
        assert.ok(!options.includes('Huerta ajena'));

        // Street View a pantalla completa con el panorama de la primera huerta
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        const box = await page.$eval('#svPano', el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
        assert.deepEqual(box, [1600, 900], 'el paisaje ocupa toda la ventana');
        const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
        assert.ok(scroll[0] <= 1600 && scroll[1] <= 900, 'sin barras de desplazamiento');
        assert.match(await page.textContent('#hudLocation'), /dentro de la huerta/);
        assert.match(await page.textContent('#hudLocation'), /usuario/);

        // Cambio de huerta → cambia el panorama, sin crear otra instancia (costo)
        await page.selectOption('#huertaSelect', 'h-uno');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
        assert.match(await page.textContent('#hudLocation'), /a \d+ m del centro/);
        assert.equal(await page.evaluate(() => window.__svInstances), 1, 'una sola instancia de StreetViewPanorama');
        assert.equal(await page.evaluate(() => window.__mapsLoads), 1, 'Google Maps se carga una vez');
        assert.equal((await page.evaluate(() => window.__mapsParams)).key, 'clave-de-prueba');

        // Sin cobertura → vista satelital y mensaje
        await page.selectOption('#huertaSelect', 'h-sin-sv');
        await page.waitForSelector('#svFallbackMap:not([hidden])');
        assert.match(await page.textContent('#svStatus'), /no tiene imágenes de Street View/);
        assert.ok(await page.isHidden('#svPano'));

        // Sin coordenadas → mensaje y contexto conservado
        await page.selectOption('#huertaSelect', 'h-sin-coord');
        await page.waitForFunction(() => /no tiene una ubicación válida/.test(document.getElementById('svStatus').textContent));
        assert.equal((await dbg(page)).activeHuertaId, 'h-sin-coord');

        // Volver a una huerta con cobertura reutiliza la búsqueda guardada (sin repetir solicitudes)
        const searches = await page.evaluate(() => window.__svSearches);
        await page.selectOption('#huertaSelect', 'h-tec');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        assert.equal(await page.evaluate(() => window.__svSearches), searches, 'la cobertura se guarda en memoria');

        // E. Rediseño: los cuatro módulos muestran datos al entrar, sin abrir ningún menú.
        for (const m of ['resumen', 'huerta', 'reportes', 'analisis']) {
            assert.ok(await page.isVisible(`.xcard[data-module="${m}"]`), `tarjeta ${m} visible al entrar`);
        }
        await page.waitForFunction(() => /33|3\s*escaneos/.test(document.getElementById('xcResumenBody').innerText));
        assert.match(await page.innerText('#xcResumenBody'), /12\.67\s*ha/, 'superficie de la huerta activa');
        assert.match(await page.innerText('#xcResumenBody'), /3\s*escaneos/);
        assert.match(await page.innerText('#xcHuertaBody'), /Tec/);
        assert.match(await page.innerText('#xcReportesBody'), /NDVI[\s\S]*0\.710/);
        assert.match(await page.innerText('#xcAnalisisBody'), /Saludable/);
        // Resumen y Mi huerta a la izquierda; Reportes y Análisis IA a la derecha; el centro libre.
        const geo = await page.evaluate(() => {
            const r = sel => document.querySelector(sel).getBoundingClientRect();
            return { l: r('#colLeft').toJSON(), rgt: r('#colRight').toJSON(), w: innerWidth };
        });
        assert.ok(geo.l.right < geo.w * 0.32 && geo.rgt.left > geo.w * 0.68, 'las columnas dejan libre el camino central');
        // Sin barras de desplazamiento internas en las tarjetas.
        const scrollers = () => page.evaluate(() => [...document.querySelectorAll('#hud *')].filter(e => e.offsetParent && e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).map(e => e.id || e.className));
        assert.deepEqual(await scrollers(), []);
        // Cambiar de huerta actualiza la tarjeta sin mezclar datos.
        await page.selectOption('#huertaSelect', 'h-uno');
        await page.waitForFunction(() => /Huerta 1/.test(document.getElementById('xcHuertaBody').innerText));
        assert.match(await page.innerText('#xcResumenBody'), /7\.28\s*ha/);
        await page.selectOption('#huertaSelect', 'h-tec');
        await page.waitForFunction(() => /Tec/.test(document.getElementById('xcHuertaBody').innerText));

        // Detalle dentro de su lateral, con «Volver al resumen».
        await page.click('.xcard[data-module="resumen"] .xcard-action');
        await page.waitForSelector('#fpanelResumen:not([hidden])');
        await page.waitForFunction(() => /Total análisis\s*3/.test(document.getElementById('statsRow').innerText));
        assert.equal((await dbg(page)).details.left, 'resumen');
        await page.click('.xcard[data-module="reportes"] .xcard-action');
        await page.waitForSelector('#fpanelReportes:not([hidden]) .report-card');
        assert.ok(await page.isVisible('#fpanelResumen'), 'cada lateral tiene su propio detalle');
        assert.deepEqual(await scrollers(), [], 'los detalles no tienen desplazamiento interno');
        await page.click('#fpanelReportes .fpanel-back');
        assert.ok(await page.isHidden('#fpanelReportes'));
        assert.ok(await page.isVisible('.xcard[data-module="reportes"]'));
        await page.click('#fpanelResumen .fpanel-back');
        await page.click('.xcard[data-module="analisis"] .xcard-action');
        await page.waitForSelector('#fpanelAnalisis:not([hidden]) .fruit-section');
        await page.waitForSelector('.xpager[data-pager="analisis"]:not([hidden])');
        assert.match(await page.innerText('.xpager[data-pager="analisis"]'), /1–3 de 3/);
        await page.keyboard.press('Escape');
        assert.ok(await page.isHidden('#fpanelAnalisis'));
        await page.click('.xcard[data-module="huerta"] .xcard-action');
        await page.waitForSelector('#fpanelHuerta:not([hidden]) .huerta-card.is-active');
        const firstCard = await page.$eval('#huertaList .huerta-card', el => el.dataset.huertaId);
        assert.equal(firstCard, 'h-tec', 'la huerta activa aparece primero');
        assert.equal(await page.$$eval('#huertaList .huerta-card', c => c.length), 4, 'siguen todas las huertas');
        assert.match(await page.innerText('.xpager[data-pager="huerta"]'), /1 de 4/, 'una huerta por página');
        await page.click('.xpager[data-pager="huerta"] [data-pg="next"]');
        assert.match(await page.innerText('.xpager[data-pager="huerta"]'), /2 de 4/);
        assert.equal(await page.$$eval('#huertaList .huerta-card:not(.pg-out)', c => c.length), 1);
        // El panel no se sale de la pantalla
        const pr = await page.$eval('#fpanelHuerta', el => el.getBoundingClientRect().toJSON());
        assert.ok(pr.left >= 0 && pr.top >= 0 && pr.right <= 1600 && pr.bottom <= 900);

        // Cambiar modalidad vuelve al selector
        await page.click('[data-action="change-mode"]');
        await page.waitForSelector('#modeSelector:not([hidden])');
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('ScreenX: asignación manual, roles duplicados, sincronización de huerta y cámara, desconexión y recarga', async () => {
    const env = await setup();
    try {
        const center = await env.newPage();
        await env.login(center);
        await center.goto(env.base + '/admin.html');
        await center.click('text=Configurar ScreenX');
        await center.waitForSelector('#sxWizard:not([hidden])');
        assert.match(await center.textContent('#sxWizardBody'), /Conecta los monitores al equipo/);
        assert.match(await center.textContent('#sxWizardBody'), /extender las pantallas/);
        await center.click('[data-action="wizard-next"]');
        await center.click('[data-action="claim-role"][data-role="center"]');
        await center.waitForSelector('text=Esta ventana es la pantalla central');

        // Segunda ventana: llega directo a la asignación de rol, sin volver a pedir login
        const left = await env.newPage();
        await left.goto(env.base + '/admin.html#screenx');
        await left.waitForSelector('#sxWizard:not([hidden]) .role-cards');
        await left.waitForSelector('.role-card[data-role="center"].is-taken');
        await left.click('[data-action="claim-role"][data-role="center"]');
        await left.waitForSelector('text=ya está asignada a otra ventana');
        await left.click('[data-action="claim-role"][data-role="left"]');
        await left.waitForSelector('text=Esta ventana es la pantalla izquierda');

        // Validación parcial en la central
        await center.click('[data-action="wizard-next"]');
        await center.waitForSelector('text=Continuar en modo parcial');
        assert.match(await center.textContent('#sxWizardBody'), /Falta: Derecha/);

        const right = await env.newPage();
        await right.goto(env.base + '/admin.html#screenx');
        await right.waitForSelector('.role-cards');
        await right.click('[data-action="claim-role"][data-role="right"]');
        await center.waitForSelector('text=Las tres pantallas están asignadas y conectadas');

        // Entrar desde la central arrastra a las demás ventanas
        await center.click('[data-action="sx-enter"]');
        for (const p of [center, left, right]) await p.waitForSelector('#hud:not([hidden])');
        await center.waitForSelector('#sxStatusChip.is-ok');
        assert.equal(await center.textContent('#sxStatusChip'), 'ScreenX · 3 de 3 pantallas');
        // Controles nativos: todas las pantallas navegan; dirección y fecha solo en la central
        await left.waitForFunction(() => window.__svPanorama);
        const lo = await left.evaluate(() => window.__svPanorama.opts);
        const co = await center.evaluate(() => window.__svPanorama && window.__svPanorama.opts);
        assert.equal(lo.linksControl, true); assert.equal(lo.clickToGo, true); assert.equal(lo.panControl, true); assert.equal(lo.zoomControl, true);
        assert.equal(lo.addressControl, false); assert.equal(lo.imageDateControl, false);
        assert.equal(co.addressControl, true); assert.equal(co.imageDateControl, true); assert.equal(co.fullscreenControl, false);
        // Distribución: Resumen y Mi Huerta a la izquierda, Reportes y Análisis IA a la derecha, centro despejado.
        await left.waitForSelector('.xcard[data-module="resumen"]', { state: 'visible' });
        assert.ok(await left.isVisible('.xcard[data-module="huerta"]'));
        assert.ok(await left.isHidden('#colRight'), 'la izquierda no repite la columna derecha');
        await right.waitForSelector('.xcard[data-module="analisis"]', { state: 'visible' });
        assert.ok(await right.isVisible('.xcard[data-module="reportes"]'));
        assert.ok(await right.isHidden('#colLeft'));
        await center.waitForFunction(() => document.body.dataset.colLeft === 'off' && document.body.dataset.colRight === 'off');
        assert.ok(await center.isHidden('#colLeft') && await center.isHidden('#colRight'), 'la central queda despejada');

        // Cámara: la central es la referencia; las laterales se desplazan un campo de visión
        await center.waitForFunction(() => window.__svPanorama && document.getElementById('svPano').getAttribute('data-fake-pano'));
        await left.waitForFunction(() => window.__svPanorama);
        await right.waitForFunction(() => window.__svPanorama);
        await center.evaluate(() => window.__svPanorama.__userDrag(30, 4));
        await left.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 300) < 0.01);
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 120) < 0.01);
        assert.equal(await left.evaluate(() => window.__svPanorama.getPov().pitch), 4);
        // Zoom 2 → campo de 45°
        await center.evaluate(() => window.__svPanorama.__userDrag(30, 0, 2));
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 75) < 0.01 && window.__svPanorama.getZoom() === 2);
        // Una lateral nunca emite cámara (sin bucles)
        await left.evaluate(() => window.__svPanorama.__userDrag(200, 0));
        await center.waitForTimeout(300);
        assert.equal((await center.evaluate(() => window.__svPanorama.getPov())).heading, 30);

        // Calibración en la central se propaga
        await center.click('[data-action="toggle-calibration"]');
        await center.fill('#sxCalFine', '5');
        await center.dispatchEvent('#sxCalFine', 'input');
        await center.evaluate(() => window.__svPanorama.__userDrag(30, 0, 1));
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 125) < 0.01);

        // Huerta: el cambio en la central llega a todas
        await center.selectOption('#huertaSelect', 'h-uno');
        for (const p of [left, right]) {
            await p.waitForFunction(() => window.AvotexInmersiva._debug().activeHuertaId === 'h-uno');
            await p.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
        }
        // La persona avanza por la calle en la central → las laterales siguen el mismo panorama
        await center.evaluate(() => { window.__svPanorama.setPano('pano-uno-b'); });
        await left.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno-b');

        // Abrir un detalle o cambiar de página es solo interfaz: no mueve la cámara ni la huerta.
        const camBefore = await center.evaluate(() => window.__svPanorama.getPov());
        await right.click('.xcard[data-module="analisis"] .xcard-action');
        await right.waitForSelector('#fpanelAnalisis:not([hidden])');
        await right.waitForTimeout(250);
        assert.deepEqual(await center.evaluate(() => window.__svPanorama.getPov()), camBefore);
        assert.equal((await dbg(right)).activeHuertaId, 'h-uno');
        await right.click('#fpanelAnalisis .fpanel-back');
        // La central pide un detalle: se abre en la pantalla dueña de esa columna.
        await center.evaluate(() => window.AvotexInmersiva.openModule('reportes'));
        await right.waitForSelector('#fpanelReportes:not([hidden])');
        assert.ok(await center.isHidden('#fpanelReportes'));

        // Recarga de la izquierda: conserva su rol y la huerta, sin volver al selector
        await left.reload();
        await left.waitForSelector('#hud:not([hidden])');
        const ld = await dbg(left);
        assert.equal(ld.role, 'left');
        assert.equal(ld.activeHuertaId, 'h-uno');
        await center.evaluate(() => window.__svPanorama.__userDrag(10, 0, 1));
        await left.waitForFunction(() => window.__svPanorama && Math.abs(window.__svPanorama.getPov().heading - 275) < 0.01);

        // Cierre de la derecha → la central pasa a modo parcial y sigue usable
        await right.close({ runBeforeUnload: true });
        await center.waitForFunction(() => /falta derecha/.test(document.getElementById('sxStatusChip').textContent));
        // Modo parcial: la central muestra los módulos de la pantalla que falta.
        await center.waitForSelector('#colRight .xcard[data-module="reportes"]', { state: 'visible', timeout: 3000 });
        assert.ok(await center.isHidden('#colLeft'), 'la izquierda sigue conectada y conserva su columna');
        await center.click('.xcard[data-module="analisis"] .xcard-action');
        await center.waitForSelector('#fpanelAnalisis:not([hidden])', { timeout: 3000 });

        // Una ventana que deja de responder (sin despedirse) se marca desconectada por tiempo
        await left.evaluate(() => { BroadcastChannel.prototype.postMessage = function () {}; });
        await center.waitForFunction(() => /falta izquierda, derecha/.test(document.getElementById('sxStatusChip').textContent), null, { timeout: 9000 });
        assert.match(await center.textContent('#hudToasts'), /Se perdió la conexión con la pantalla izquierda/);

        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('ScreenX: cerrar sesión en una ventana termina la sesión en las demás', async () => {
    const env = await setup();
    try {
        const a = await env.newPage();
        await env.login(a);
        await a.goto(env.base + '/admin.html');
        await a.click('text=Configurar ScreenX');
        await a.click('[data-action="wizard-next"]');
        await a.click('[data-action="claim-role"][data-role="center"]');
        const b = await env.newPage();
        await b.goto(env.base + '/admin.html#screenx');
        await b.click('[data-action="claim-role"][data-role="left"]');
        await a.click('[data-action="wizard-next"]');
        await a.click('[data-action="sx-enter"]');
        await b.waitForSelector('#hud:not([hidden])');
        await a.click('[data-action="toggle-user-menu"]');
        await a.click('#hudUserMenu [data-action="logout"]');
        await a.waitForURL(/dashboard\.html/);
        await b.waitForURL(/dashboard\.html/, { timeout: 5000 });
        assert.equal(await b.evaluate(() => localStorage.getItem('fake_firebase_user')), null);
    } finally { await env.close(); }
});

test('sesión que vence mientras se usa: se ocultan los datos y se pide iniciar sesión', async () => {
    const env = await setup();
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForSelector('#hud:not([hidden])');
        // Otra pestaña (por ejemplo, el login) cierra la sesión de Firebase.
        const other = await env.newPage();
        await other.goto(env.base + '/dashboard.html');
        await other.evaluate(() => localStorage.removeItem('fake_firebase_user'));
        await page.waitForSelector('#sessionEnded:not([hidden])');
        assert.ok(await page.isHidden('#hud'));
    } finally { await env.close(); }
});

test('acceso no autorizado en Supabase: mensajes claros, sin pantallas en blanco', async () => {
    const env = await setup({ unauthorized: true });
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => /autorización/.test(document.getElementById('svStatus').textContent));
        await page.waitForFunction(() => /Acceso no autorizado/.test(document.getElementById('xcResumenBody').textContent));
        assert.match(await page.textContent('#xcAnalisisBody'), /Acceso no autorizado/);
        await page.click('.xcard[data-module="resumen"] .xcard-action');
        await page.waitForSelector('#statsRow .data-error');
        assert.match(await page.textContent('#statsRow'), /Acceso no autorizado/);
        assert.equal(await page.textContent('#huertaSelect'), 'Sin autorización');
    } finally { await env.close(); }
});

test('Street View sin clave configurada: aviso y módulos disponibles', async () => {
    const env = await setup({ noKey: true });
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => /no está configurado/.test(document.getElementById('svStatus').textContent));
        await page.waitForSelector('#svFallbackMap:not([hidden])');
        await page.click('.xcard[data-module="reportes"] .xcard-action');
        await page.waitForSelector('#fpanelReportes:not([hidden]) .report-card');
    } finally { await env.close(); }
});

test('Google rechaza la clave: se informa y no se reintenta solo', async () => {
    const env = await setup({ mapsAuthFail: true });
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => /rechazó la clave/.test(document.getElementById('svStatus').textContent));
        await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => window.__mapsLoads), 1, 'sin reintentos automáticos');
    } finally { await env.close(); }
});

test('ScreenX: la huerta elegida en la primera ventana se conserva al abrir las demás', async () => {
    const env = await setup();
    try {
        const first = await env.newPage();
        await env.login(first);
        await first.goto(env.base + '/admin.html');
        await first.click('text=Entrar a mi huerta');
        await first.waitForFunction(() => document.querySelectorAll('#huertaSelect option').length === 4);
        await first.selectOption('#huertaSelect', 'h-uno');
        await first.click('[data-action="change-mode"]');
        await first.click('text=Configurar ScreenX');
        await first.click('[data-action="wizard-next"]');
        await first.click('[data-action="claim-role"][data-role="center"]');
        await first.waitForTimeout(2800); // la primera ventana fija la huerta compartida

        // Ventanas nuevas: por defecto cargarían la primera huerta ("Tec"), pero deben adoptar la elegida.
        const second = await env.newPage();
        await second.goto(env.base + '/admin.html#screenx');
        await second.click('[data-action="claim-role"][data-role="right"]');
        await second.waitForFunction(() => window.AvotexInmersiva._debug().activeHuertaId === 'h-uno');
        assert.equal((await dbg(first)).activeHuertaId, 'h-uno');

        // Modo parcial con dos ventanas: se puede entrar y la falta queda indicada
        await first.click('[data-action="wizard-next"]');
        await first.waitForSelector('text=Continuar en modo parcial');
        await first.click('[data-action="sx-enter"]');
        await second.waitForSelector('#hud:not([hidden])');
        await first.waitForFunction(() => document.getElementById('sxStatusChip').textContent === 'Modo parcial · falta izquierda');
        assert.ok(await second.isHidden('#hudLocation'), 'la ficha de ubicación solo va en la central');
        // Una sola ventana en ScreenX: sigue usable y sin confirmación falsa
        await second.click('[data-action="change-mode"]');
        await first.waitForFunction(() => /falta izquierda, derecha/.test(document.getElementById('sxStatusChip').textContent));
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});


test('Botonera de Street View: avanza y retrocede solo por enlaces reales y gira', async () => {
    const env = await setup();
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('[data-action="choose-normal"]');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        await page.waitForSelector('#svNav:not([hidden])');
        // Foto 360° sin enlaces: no se puede avanzar ni retroceder, pero sí girar
        assert.ok(await page.isDisabled('#svNav [data-nav="forward"]'));
        assert.ok(await page.isDisabled('#svNav [data-nav="back"]'));
        assert.ok(await page.isEnabled('#svNav [data-nav="left"]'));

        await page.selectOption('#huertaSelect', 'h-uno');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
        // Mirando al este (90°): adelante hay camino (pano-uno-b) y atrás también (pano-uno-o)
        await page.evaluate(() => window.__svPanorama.__userDrag(80, 0));
        await page.waitForFunction(() => !document.querySelector('#svNav [data-nav="forward"]').disabled);
        assert.match(await page.getAttribute('#svNav [data-nav="forward"]', 'aria-label'), /Camino a Tarímbaro/);
        await page.click('#svNav [data-nav="forward"]');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno-b');
        assert.equal((await page.evaluate(() => window.__svPanorama.getPov())).heading, 80, 'avanzar conserva la orientación');
        // Desde pano-uno-b solo hay camino hacia atrás
        await page.waitForFunction(() => document.querySelector('#svNav [data-nav="forward"]').disabled);
        await page.click('#svNav [data-nav="back"]');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
        // Girar a la derecha 45°
        await page.click('#svNav [data-nav="right"]');
        await page.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 125) < 0.5);
        await page.waitForTimeout(450); // termina la animación del giro
        // Mirando al norte no hay enlace en ±67.5°
        await page.evaluate(() => window.__svPanorama.__userDrag(0, 0));
        await page.waitForFunction(() => document.querySelector('#svNav [data-nav="forward"]').disabled && document.querySelector('#svNav [data-nav="back"]').disabled);
        // Sin cobertura, la botonera se oculta
        await page.selectOption('#huertaSelect', 'h-sin-sv');
        await page.waitForSelector('#svNav', { state: 'hidden' });
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('ScreenX: navegar desde una pantalla lateral mueve a las tres sin ciclos', async () => {
    const env = await setup();
    try {
        const center = await env.newPage();
        await env.login(center);
        await center.goto(env.base + '/admin.html');
        await center.click('[data-action="choose-normal"]');
        await center.waitForFunction(() => document.querySelectorAll('#huertaSelect option').length === 4);
        await center.selectOption('#huertaSelect', 'h-uno');
        await center.click('[data-action="change-mode"]');
        await center.click('text=Configurar ScreenX');
        await center.click('[data-action="wizard-next"]');
        await center.click('[data-action="claim-role"][data-role="center"]');
        await center.waitForTimeout(2800);
        const left = await env.newPage();
        await left.goto(env.base + '/admin.html#screenx');
        await left.click('[data-action="claim-role"][data-role="left"]');
        const right = await env.newPage();
        await right.goto(env.base + '/admin.html#screenx');
        await right.click('[data-action="claim-role"][data-role="right"]');
        await center.click('[data-action="wizard-next"]');
        await center.waitForSelector('text=Las tres pantallas');
        await center.click('[data-action="sx-enter"]');
        for (const p of [center, left, right]) {
            await p.waitForFunction(() => window.__svPanorama && document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
            await p.waitForSelector('#svNav:not([hidden])');
        }
        // Central mirando al norte (0°): la izquierda mira al oeste (270°) y la derecha al este (90°)
        await center.evaluate(() => window.__svPanorama.__userDrag(0, 0));
        await left.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 270) < 0.01);
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 90) < 0.01);
        // En la central no hay camino al frente; en la derecha (mirando al este) sí
        await center.waitForFunction(() => document.querySelector('#svNav [data-nav="forward"]').disabled);
        await right.waitForFunction(() => !document.querySelector('#svNav [data-nav="forward"]').disabled);

        // Avanzar desde la DERECHA: las tres pasan a pano-uno-b y conservan sus desplazamientos
        await right.click('#svNav [data-nav="forward"]');
        for (const p of [center, left, right]) await p.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno-b');
        await center.waitForTimeout(700);
        assert.equal((await center.evaluate(() => window.__svPanorama.getPov())).heading, 0);
        assert.equal((await left.evaluate(() => window.__svPanorama.getPov())).heading, 270);
        assert.equal((await right.evaluate(() => window.__svPanorama.getPov())).heading, 90);

        // Girar desde la IZQUIERDA: la central gira lo mismo y la derecha la sigue
        await left.click('#svNav [data-nav="left"]');
        await center.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 315) < 0.5);
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 45) < 0.5);
        await left.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 225) < 0.5);

        // Arrastre real (gesto) en la izquierda → se propaga; cambio programático → no (sin ciclos)
        await left.dispatchEvent('#svPano', 'pointerdown');
        await left.evaluate(() => window.__svPanorama.__userDrag(200, 0));
        await center.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 290) < 0.01);
        await left.waitForTimeout(1700); // pasa la ventana de "gesto de la persona"
        await left.evaluate(() => window.__svPanorama.__userDrag(10, 0));
        await center.waitForTimeout(400);
        assert.equal((await center.evaluate(() => window.__svPanorama.getPov())).heading, 290, 'un cambio que no viene de la persona no mueve a la central');

        // Clic en una flecha de Google en la lateral (clickToGo/linksControl) también se sincroniza
        await right.dispatchEvent('#svPano', 'pointerdown');
        await right.evaluate(() => { window.__svPanorama.setPano('pano-uno'); });
        for (const p of [center, left]) await p.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('Historial de Análisis IA: páginas sin desplazamiento, todos los registros accesibles y filtro que reinicia la página', async () => {
    const env = await setup({ manyScans: true });
    try {
        const page = await env.newPage();
        await page.setViewportSize({ width: 1366, height: 768 });
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => /40/.test(document.getElementById('xcAnalisisBody').innerText));
        await page.click('.xcard[data-module="analisis"] .xcard-action');
        await page.waitForSelector('.xpager[data-pager="analisis"]:not([hidden])');
        await page.waitForTimeout(400);
        const label = () => page.innerText('.xpager[data-pager="analisis"] .xpager-label');
        const first = await label();
        assert.match(first, /^1–\d+ de 40$/);
        const perPage = Number(/–(\d+)/.exec(first)[1]);
        assert.ok(perPage >= 4 && perPage < 40, 'las filas por página dependen del alto disponible');
        // Ninguna fila visible queda cortada por el borde del panel.
        const cut = await page.evaluate(() => {
            const vp = document.getElementById('historyViewport').getBoundingClientRect();
            return [...document.querySelectorAll('#historyViewport tbody tr:not(.pg-out)')].some(tr => tr.getBoundingClientRect().bottom > vp.bottom + 0.5);
        });
        assert.equal(cut, false);
        // Recorrer todas las páginas muestra los 40 registros una sola vez.
        const seen = new Set();
        for (let guard = 0; guard < 40; guard++) {
            const rowsNow = await page.$$eval("#historyViewport tbody tr:not(.pg-out) td:first-child", tds => tds.map(t => t.textContent.trim()));
            rowsNow.forEach(n => seen.add(n));
            const next = await page.$('.xpager[data-pager="analisis"] [data-pg="next"]:not(:disabled)');
            if (!next) break;
            await next.click();
        }
        assert.equal(seen.size, 40);
        assert.match(await label(), /de 40$/);
        // Cambiar el filtro de fruto vuelve a la primera página del conjunto nuevo.
        await page.click('#fruitTabsAnalisis .fruit-tab[data-fruit="Mango"]');
        await page.waitForFunction(() => /^1–\d+ de 10$|^1 de 10$/.test(document.querySelector('.xpager[data-pager="analisis"] .xpager-label').textContent));
        assert.match(await page.textContent('#xcAnalisisTag'), /Mango/, 'las tarjetas muestran el filtro activo');
        const scrollers = await page.evaluate(() => [...document.querySelectorAll('#hud *')].filter(e => e.offsetParent && e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).length);
        assert.equal(scrollers, 0);
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('Sin WebGL: la capa 3D no aparece y el mapa, los datos y los controles siguen funcionando', async () => {
    const env = await setup();
    try {
        await env.context.addInitScript(() => {
            const orig = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
                if (/webgl/i.test(type)) return null;
                return orig.call(this, type, ...rest);
            };
        });
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.waitForSelector('#modeSelector:not([hidden])');
        await page.waitForFunction(() => document.getElementById('selFx').dataset.fx === 'unavailable');
        assert.equal(await page.$('#selFx canvas'), null);
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        await page.waitForFunction(() => document.getElementById('hudFx').dataset.fx === 'unavailable');
        assert.equal(await page.$('#hudFx canvas'), null);
        await page.waitForFunction(() => /escaneos/.test(document.getElementById('xcResumenBody').innerText));
        for (const m of ['resumen', 'huerta', 'reportes', 'analisis']) assert.ok(await page.isVisible(`.xcard[data-module="${m}"]`));
        assert.ok(await page.isVisible('#svNav'));
        await page.click('.xcard[data-module="reportes"] .xcard-action');
        await page.waitForSelector('#fpanelReportes:not([hidden]) .report-card');
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('Movimiento reducido: tarjetas visibles sin animación, capa 3D estática y fondo del selector quieto', async () => {
    const env = await setup();
    try {
        const page = await env.newPage();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.waitForSelector('#modeSelector:not([hidden])');
        assert.equal(await page.$eval('.sel-bg-photo', el => getComputedStyle(el).animationName), 'none');
        assert.equal(await page.$eval('#selBgVideo', el => el.paused !== false), true);
        await page.click('text=Entrar a mi huerta');
        await page.waitForSelector('#hud.is-revealed');
        const anim = await page.$$eval('.xcard', els => els.filter(e => e.offsetParent).map(e => [getComputedStyle(e).animationName, getComputedStyle(e).opacity]));
        assert.ok(anim.length >= 4);
        anim.forEach(([name, op]) => { assert.equal(name, 'none'); assert.equal(op, '1'); });
        await page.waitForFunction(() => ['ready', 'unavailable'].includes(document.getElementById('hudFx').dataset.fx));
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});


// ───────── control por gestos ─────────

const FAKE_CAMERA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

test('Gestos con MediaPipe real: carga diferida, WASM y modelo locales, una sola cámara y apagado completo', async () => {
    const env = await setup({ launchArgs: FAKE_CAMERA });
    try {
        const page = await env.newPage();
        const mp = [];
        page.on('response', r => { if (/\/assets\/vendor\/mediapipe\//.test(r.url())) mp.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] || '' }); });
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        await page.waitForSelector('#gestureBar:not([hidden])');
        assert.equal(mp.length, 0, 'nada de MediaPipe se descarga antes de activar');
        assert.equal(await page.evaluate(() => typeof window.Vision), 'undefined');

        await page.click('#gestureToggle');
        await page.waitForFunction(() => window.AvotexGestos._debug().active, null, { timeout: 60000 });
        await page.waitForFunction(() => window.AvotexGestos._debug().inferCount > 5, null, { timeout: 30000 });
        const d = await page.evaluate(() => window.AvotexGestos._debug());
        assert.equal(d.modelLoaded, true);
        assert.deepEqual(d.tracks, ['live'], 'una sola pista de video');
        assert.match(await page.textContent('#gestureStatus'), /Buscando mano/, 'la cámara falsa no tiene manos');
        assert.equal(await page.textContent('#gestureToggleLabel'), 'Desactivar gestos');
        // Recursos servidos como archivos (no HTML), desde el propio sitio.
        const kinds = mp.map(r => [r.url.split('/').pop(), r.status, r.type]);
        assert.ok(mp.every(r => r.status === 200 && !/text\/html/.test(r.type)), JSON.stringify(kinds));
        assert.ok(mp.some(r => /vision_bundle\.js$/.test(r.url)));
        assert.ok(mp.some(r => /vision_wasm_internal\.wasm$/.test(r.url) && /application\/wasm/.test(r.type)));
        assert.ok(mp.some(r => /hand_landmarker-float16-v1\.task$/.test(r.url)));
        // La vista previa abre y cierra sin detener la detección.
        await page.click('#gesturePreviewBtn');
        await page.waitForSelector('#gesturePreview:not([hidden]) video');
        const before = (await page.evaluate(() => window.AvotexGestos._debug())).inferCount;
        await page.waitForTimeout(600);
        assert.ok((await page.evaluate(() => window.AvotexGestos._debug())).inferCount > before);
        await page.click('[data-gesture="close-preview"]');
        assert.ok(await page.isHidden('#gesturePreview'));
        // Desactivar detiene la cámara y el bucle.
        await page.click('#gestureToggle');
        const off = await page.evaluate(() => window.AvotexGestos._debug());
        assert.equal(off.active, false);
        assert.deepEqual(off.tracks, []);
        const n = off.inferCount;
        await page.waitForTimeout(400);
        assert.equal((await page.evaluate(() => window.AvotexGestos._debug())).inferCount, n, 'el bucle se detuvo');
        assert.ok(await page.isVisible('#svNav'), 'la navegación manual sigue disponible');
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

/*
 * Mano guionizada: sustituye la webcam y MediaPipe por una mano sintética que la prueba mueve
 * (window.__hand). La lógica de gestos, el giro, el avance y la sincronización son los reales.
 */
function installGestureFakes() {
    const ASPECT = 16 / 9;
    window.__hand = { present: false, cx: 0.5, cy: 0.55, s: 0.2, pose: 'open' };
    function makeHand({ cx, cy, s, pose }) {
        const U = { 0: [0, 0.6] };
        const mcp = { 5: [-0.25, -0.1], 9: [-0.05, -0.15], 13: [0.13, -0.12], 17: [0.3, -0.05] };
        Object.assign(U, mcp);
        const ext = (m, pip, tip, dx = 0) => { U[pip] = [mcp[m][0] + dx * 0.45, mcp[m][1] - 0.3]; U[tip] = [mcp[m][0] + dx, mcp[m][1] - 0.65]; };
        const fold = (m, pip, tip) => { U[pip] = [mcp[m][0], mcp[m][1] - 0.2]; U[tip] = [mcp[m][0], mcp[m][1] + 0.05]; };
        if (pose === 'v') { ext(5, 6, 8, -0.2); ext(9, 10, 12, 0.08); fold(13, 14, 16); fold(17, 18, 20); }
        else if (pose === 'pinch') { ext(5, 6, 8, -0.1); ext(9, 10, 12); ext(13, 14, 16); ext(17, 18, 20); }
        else if (pose === 'thumb') { fold(5, 6, 8); fold(9, 10, 12); fold(13, 14, 16); fold(17, 18, 20); }
        else { ext(5, 6, 8); ext(9, 10, 12); ext(13, 14, 16); ext(17, 18, 20); }
        U[4] = pose === 'pinch' ? [U[8][0] + 0.06, U[8][1] + 0.05] : [-0.65, 0.05];
        U[1] = [-0.3, 0.45]; U[2] = [-0.45, 0.3]; U[3] = [-0.55, 0.15];
        if (pose === 'thumb') { U[3] = [-0.47, -0.05]; U[4] = [-0.48, -0.42]; }
        for (const [a, b, c] of [[7, 6, 8], [11, 10, 12], [15, 14, 16], [19, 18, 20]]) U[a] = [(U[b][0] + U[c][0]) / 2, (U[b][1] + U[c][1]) / 2];
        return Array.from({ length: 21 }, (_, i) => ({ x: cx + U[i][0] * s / ASPECT, y: cy + U[i][1] * s, z: 0 }));
    }
    window.__installFakeGestures = () => {
        window.__gestureGum = 0;
        window.AvotexGestos._setDeps({
            getUserMedia: async () => {
                window.__gestureGum++;
                const c = document.createElement('canvas'); c.width = 640; c.height = 360;
                const ctx = c.getContext('2d');
                let k = 0;
                setInterval(() => { ctx.fillStyle = k++ % 2 ? '#123' : '#234'; ctx.fillRect(0, 0, 640, 360); }, 33);
                return c.captureStream(30);
            },
            createLandmarker: async () => ({
                delegate: 'FAKE',
                landmarker: {
                    detectForVideo: () => window.__hand.present
                        ? { landmarks: [makeHand(window.__hand)], handedness: [[{ categoryName: 'Right' }]] }
                        : { landmarks: [], handedness: [] },
                    close() {}
                }
            })
        });
    };
}

// Cuenta solicitudes de cámara reales en cada ventana (las laterales deben quedar en 0).
function countRealCamera() {
    window.__realGum = 0;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = c => { window.__realGum++; return orig(c); };
    }
}

const heading = p => p.evaluate(() => window.__svPanorama.getPov().heading);
const hand = (p, h) => p.evaluate(h => Object.assign(window.__hand, h), h);
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

test('Gestos en ScreenX: solo la central usa la cámara; la pinza gira las tres pantallas, soltar las detiene y la V avanza una vez', async () => {
    const env = await setup();
    try {
        await env.context.addInitScript(installGestureFakes);
        await env.context.addInitScript(countRealCamera);
        const mpRequests = { left: 0, right: 0 };
        const center = await env.newPage();
        await env.login(center);
        await center.goto(env.base + '/admin.html');
        await center.click('text=Configurar ScreenX');
        await center.click('[data-action="wizard-next"]');
        await center.click('[data-action="claim-role"][data-role="center"]');
        const left = await env.newPage();
        left.on('request', r => { if (/mediapipe/.test(r.url())) mpRequests.left++; });
        await left.goto(env.base + '/admin.html#screenx');
        await left.waitForSelector('#sxWizard:not([hidden]) .role-cards');
        await left.click('[data-action="claim-role"][data-role="left"]');
        const right = await env.newPage();
        right.on('request', r => { if (/mediapipe/.test(r.url())) mpRequests.right++; });
        await right.goto(env.base + '/admin.html#screenx');
        await right.waitForSelector('#sxWizard:not([hidden]) .role-cards');
        await right.click('[data-action="claim-role"][data-role="right"]');
        await center.click('[data-action="wizard-next"]');
        await center.waitForSelector('text=Las tres pantallas están asignadas');
        await center.click('[data-action="sx-enter"]');
        for (const p of [center, left, right]) await p.waitForSelector('#hud:not([hidden])');

        // El control solo aparece en la central.
        await center.waitForSelector('#gestureBar:not([hidden])');
        assert.ok(await left.isHidden('#gestureBar') && await right.isHidden('#gestureBar'));

        await center.selectOption('#huertaSelect', 'h-uno');
        for (const p of [center, left, right]) await p.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno');
        await center.evaluate(() => window.__svPanorama.__userDrag(0, 0, 1));
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 90) < 0.01);

        await center.evaluate(() => window.__installFakeGestures());
        await center.click('#gestureToggle');
        await center.waitForFunction(() => window.AvotexGestos._debug().active);
        assert.match(await center.textContent('#gestureStatus'), /Buscando mano/);

        // Pinza en el punto neutro: quieto.
        await hand(center, { present: true, pose: 'pinch', cx: 0.5, cy: 0.55 });
        await center.waitForFunction(() => /pinza/.test(document.getElementById('gestureStatus').textContent));
        await center.waitForTimeout(400);
        assert.ok(Math.abs(angDiff(await heading(center), 0)) < 0.01, 'la pinza quieta no mueve la vista');

        // Mano a la derecha del presentador (x menor en la imagen sin espejo): gira a la derecha.
        await hand(center, { cx: 0.28 });
        await center.waitForFunction(() => /Girando/.test(document.getElementById('gestureStatus').textContent));
        await center.waitForFunction(() => window.__svPanorama.getPov().heading > 15 && window.__svPanorama.getPov().heading < 180);
        // Las laterales siguen a la central con sus ángulos (±90° con zoom 1).
        const c1 = await heading(center);
        await left.waitForFunction(c => Math.abs((((window.__svPanorama.getPov().heading - (c - 90)) % 360) + 540) % 360 - 180) < 25, c1);
        await right.waitForFunction(c => Math.abs((((window.__svPanorama.getPov().heading - (c + 90)) % 360) + 540) % 360 - 180) < 25, c1);

        // Soltar la pinza: las tres se detienen.
        await hand(center, { pose: 'open' });
        await center.waitForFunction(() => !window.AvotexGestos._debug().controller.pinching);
        await center.waitForTimeout(300);
        const stopped = await Promise.all([center, left, right].map(heading));
        await center.waitForTimeout(700);
        const later = await Promise.all([center, left, right].map(heading));
        later.forEach((h, i) => assert.ok(Math.abs(angDiff(h, stopped[i])) < 0.01, 'quieta tras soltar: ' + i));
        assert.ok(Math.abs(angDiff(later[2], later[1]) - 180) < 0.5 || Math.abs(angDiff(later[2], later[1]) + 180) < 0.5, 'izquierda y derecha conservan su separación');

        // Mano a la izquierda del presentador: gira a la izquierda.
        await hand(center, { pose: 'pinch', cx: 0.5 });
        await center.waitForFunction(() => window.AvotexGestos._debug().controller.pinching);
        const h0 = await heading(center);
        await hand(center, { cx: 0.72 });
        await center.waitForFunction(h0 => ((window.__svPanorama.getPov().heading - h0 + 540) % 360) - 180 < -10, h0);
        // Arriba: inclina hacia arriba sin pasar del límite.
        await hand(center, { cx: 0.5, cy: 0.25 });
        await center.waitForFunction(() => window.__svPanorama.getPov().pitch > 5);
        await center.waitForTimeout(2500);
        assert.ok((await center.evaluate(() => window.__svPanorama.getPov().pitch)) <= 30.001, 'inclinación limitada');
        await left.waitForFunction(() => window.__svPanorama.getPov().pitch > 5);

        // El mouse sobre la panorámica cancela la pinza aunque la mano siga desplazada.
        await hand(center, { cx: 0.25, cy: 0.55 });
        await center.waitForFunction(() => /Girando/.test(document.getElementById('gestureStatus').textContent));
        await center.dispatchEvent('#svPano', 'pointerdown');
        await center.waitForTimeout(250);
        const m1 = await heading(center);
        await center.waitForTimeout(600);
        assert.ok(Math.abs(angDiff(await heading(center), m1)) < 0.01, 'la entrada manual detiene el giro');
        assert.match(await center.textContent('#gestureStatus'), /Suelta la pinza/);

        // V hacia el camino (enlace a 90°): un solo avance, aunque la V se sostenga.
        await hand(center, { pose: 'open', cx: 0.5, cy: 0.55 });
        await center.evaluate(() => window.__svPanorama.__userDrag(85, 0, 1));
        await center.waitForTimeout(300);
        const panoCalls = await center.evaluate(() => { window.__setPanoCount = 0; const p = window.__svPanorama; const o = p.setPano.bind(p); p.setPano = id => { window.__setPanoCount++; return o(id); }; return 0; });
        await hand(center, { pose: 'v' });
        await center.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno-b');
        await center.waitForTimeout(2000);
        assert.equal(await center.evaluate(() => window.__setPanoCount), panoCalls + 1, 'un solo cambio de panorama');
        for (const p of [left, right]) await p.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-uno-b');
        const ch = await heading(center);
        await right.waitForFunction(c => Math.abs((((window.__svPanorama.getPov().heading - (c + 90)) % 360) + 540) % 360 - 180) < 1, ch);

        // Desde pano-uno-b no hay camino hacia 85°: la V informa y no se mueve.
        await hand(center, { pose: 'open' });
        await center.waitForTimeout(300);
        await hand(center, { pose: 'v' });
        await center.waitForFunction(() => /Sin camino hacia adelante/.test(document.getElementById('gestureStatus').textContent));
        assert.equal(await center.getAttribute('#svPano', 'data-fake-pano'), 'pano-uno-b');

        // Perder la mano detiene todo.
        await hand(center, { present: false });
        await center.waitForFunction(() => /Buscando mano/.test(document.getElementById('gestureStatus').textContent));

        // Las laterales nunca pidieron la cámara ni descargaron MediaPipe.
        assert.equal(await left.evaluate(() => window.__realGum), 0);
        assert.equal(await right.evaluate(() => window.__realGum), 0);
        assert.deepEqual(mpRequests, { left: 0, right: 0 });
        assert.equal(await left.evaluate(() => window.AvotexGestos._debug().active), false);

        // Volver a Vista normal en la central apaga la cámara de ScreenX y el control sigue disponible allí.
        await center.click('[data-action="change-mode"]');
        await center.waitForSelector('#modeSelector:not([hidden])');
        assert.deepEqual((await center.evaluate(() => window.AvotexGestos._debug())).tracks, []);
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

/*
 * Webcams simuladas: la integrada al inicio y una USB que se conecta con la página abierta y que,
 * como algunas webcams reales, rechaza el límite de fps (OverconstrainedError).
 */
function installFakeCameras() {
    window.__cams = [{ deviceId: 'int', label: 'Integrated Camera' }];
    window.__gumLog = [];
    window.__camInUse = null;
    if (navigator.mediaDevices) {
        navigator.mediaDevices.enumerateDevices = async () =>
            window.__cams.map(c => ({ kind: 'videoinput', deviceId: c.deviceId, label: c.label, groupId: c.deviceId }));
    }
    window.__plugCam = (id, label) => {
        if (id) window.__cams.push({ deviceId: id, label });
        navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    };
    window.__unplugCam = id => {
        window.__cams = window.__cams.filter(c => c.deviceId !== id);
        navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    };
    window.__installFakeCamDeps = () => window.AvotexGestos._setDeps({
        getUserMedia: async c => {
            const want = c.video.deviceId && c.video.deviceId.exact;
            window.__gumLog.push({ want: want || null, limits: !!c.video.frameRate });
            const err = name => { const e = new Error(name); e.name = name; return e; };
            if (want && !window.__cams.some(x => x.deviceId === want)) throw err('OverconstrainedError');
            if (want === 'usb' && c.video.frameRate) throw err('OverconstrainedError');
            const id = want || 'int';
            const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
            cv.getContext('2d').fillRect(0, 0, 320, 180);
            const stream = cv.captureStream(15);
            const tr = stream.getVideoTracks()[0];
            tr.getSettings = () => ({ deviceId: id });
            window.__camInUse = id;
            return stream;
        },
        createLandmarker: async () => ({ landmarker: { detectForVideo: () => ({ landmarks: [] }), close() {} }, delegate: 'FAKE' })
    });
}

test('Gestos: una webcam USB conectada con la página abierta aparece en la lista y se puede usar', async () => {
    const env = await setup();
    try {
        await env.context.addInitScript(installFakeCameras);
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        await page.evaluate(() => { localStorage.removeItem('avotex_gestos_ajustes'); window.__installFakeCamDeps(); });
        const options = () => page.$$eval('#gestureCamera option', os => os.map(o => o.textContent));

        // Solo la integrada: la lista lo dice y orienta a revisar Windows.
        await page.click('#gestureToggle');
        await page.waitForFunction(() => window.AvotexGestos._debug().active);
        assert.equal(await page.evaluate(() => window.__camInUse), 'int');
        await page.click('#gesturePreviewBtn');
        await page.waitForFunction(() => document.querySelectorAll('#gestureCamera option').length === 1);
        assert.match(await page.textContent('#gestureCameraNote'), /Solo se ve una webcam/);

        // Se conecta la USB: la lista se actualiza sola, sin recargar ni desactivar.
        await page.evaluate(() => window.__plugCam('usb', 'USB Webcam'));
        await page.waitForFunction(() => document.querySelectorAll('#gestureCamera option').length === 2);
        assert.deepEqual(await options(), ['Integrated Camera', 'USB Webcam']);
        assert.ok(await page.isHidden('#gestureCameraNote'));

        // Elegirla abre la USB aunque rechace el límite de fps (se reintenta sin límites, no se cae a la integrada).
        await page.selectOption('#gestureCamera', 'usb');
        await page.waitForFunction(() => window.__camInUse === 'usb' && window.AvotexGestos._debug().active);
        const log = await page.evaluate(() => window.__gumLog.filter(g => g.want === 'usb'));
        assert.deepEqual(log, [{ want: 'usb', limits: true }, { want: 'usb', limits: false }]);
        assert.equal(await page.inputValue('#gestureCamera'), 'usb');
        assert.ok(await page.isVisible('#gesturePreview'), 'la vista previa sigue abierta');

        // Sin la USB, al reactivar se usa la integrada y se avisa (antes era en silencio).
        await page.click('#gestureToggle');
        await page.evaluate(() => window.__unplugCam('usb'));
        await page.click('#gestureToggle');
        await page.waitForFunction(() => window.AvotexGestos._debug().active);
        assert.equal(await page.evaluate(() => window.__camInUse), 'int');
        assert.match(await page.textContent('#gestureStatus'), /webcam elegida no está disponible/);

        // Al volver a conectarla, se cambia sola a la USB elegida.
        await page.evaluate(() => window.__plugCam('usb', 'USB Webcam'));
        await page.waitForFunction(() => window.__camInUse === 'usb' && window.AvotexGestos._debug().active);
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

// Imágenes de escaneo simuladas: un PNG de color distinto por pantalla (sin tocar los archivos reales).
const PNG = {
    izquierda: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGM4oaFxQkODAUIBACEuBGGeECA5AAAAAElFTkSuQmCC',
    central: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPQ2GKjscWGAUIBAB5eBGFEp9shAAAAAElFTkSuQmCC',
    derecha: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPQCDihEXCCAUIBACCOBQEyq3EUAAAAAElFTkSuQmCC'
};
async function routeScans(context, { missing = [] } = {}) {
    await context.route('**/assets/escaneos/**', route => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
        if (name === 'escaneos.json') {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
                izquierda: { imagen: 'scan izquierda.png', titulo: 'Hoja' },
                central: 'scan-central.png',
                derecha: { imagen: 'scan-derecha.png' }
            }) });
        }
        const key = Object.keys(PNG).find(k => name.includes(k));
        if (!key || missing.includes(key)) return route.fulfill({ status: 404, body: 'no' });
        return route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG[key], 'base64') });
    });
}
const scanState = p => p.evaluate(() => {
    const g = document.getElementById('scanGallery');
    const imgs = [...g.querySelectorAll('.scan-slot img')].filter(i => !i.hidden);
    return {
        visible: !g.hidden && getComputedStyle(g).display !== 'none',
        srcs: imgs.map(i => decodeURIComponent(i.src.split('/').pop())),
        loaded: imgs.every(i => i.complete && i.naturalWidth > 0),
        missing: [...g.querySelectorAll('.scan-slot.is-missing')].map(f => f.dataset.slot)
    };
});

test('Escaneos en ScreenX: el pulgar arriba muestra una imagen distinta en cada pantalla y el mismo gesto regresa a la huerta', async () => {
    const env = await setup();
    try {
        await env.context.addInitScript(installGestureFakes);
        await routeScans(env.context);
        const center = await env.newPage();
        await env.login(center);
        await center.goto(env.base + '/admin.html');
        await center.click('text=Configurar ScreenX');
        await center.click('[data-action="wizard-next"]');
        await center.click('[data-action="claim-role"][data-role="center"]');
        const left = await env.newPage();
        await left.goto(env.base + '/admin.html#screenx');
        await left.waitForSelector('#sxWizard:not([hidden]) .role-cards');
        await left.click('[data-action="claim-role"][data-role="left"]');
        const right = await env.newPage();
        await right.goto(env.base + '/admin.html#screenx');
        await right.waitForSelector('#sxWizard:not([hidden]) .role-cards');
        await right.click('[data-action="claim-role"][data-role="right"]');
        await center.click('[data-action="wizard-next"]');
        await center.waitForSelector('text=Las tres pantallas están asignadas');
        await center.click('[data-action="sx-enter"]');
        const all = [left, center, right];
        for (const p of all) await p.waitForSelector('#hud:not([hidden])');
        for (const p of all) await p.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano'));
        await center.evaluate(() => window.__svPanorama.__userDrag(0, 0, 1));
        await right.waitForFunction(() => Math.abs(window.__svPanorama.getPov().heading - 90) < 0.01);
        const before = await Promise.all(all.map(heading));
        for (const p of all) assert.equal((await scanState(p)).visible, false);

        await center.evaluate(() => window.__installFakeGestures());
        await center.click('#gestureToggle');
        await center.waitForFunction(() => window.AvotexGestos._debug().active);

        // Pulgar arriba sostenido: las tres pantallas muestran su imagen.
        await hand(center, { present: true, pose: 'thumb', cx: 0.5, cy: 0.55 });
        await center.waitForFunction(() => /Mostrando escaneos/.test(document.getElementById('gestureStatus').textContent));
        const expected = ['scan izquierda.png', 'scan-central.png', 'scan-derecha.png'];
        for (let i = 0; i < 3; i++) {
            await all[i].waitForFunction(() => window.AvotexInmersiva._debug().scans.on);
            await all[i].waitForFunction(() => [...document.querySelectorAll('#scanGallery .scan-slot img')].every(im => im.complete && im.naturalWidth > 0));
            const st = await scanState(all[i]);
            assert.equal(st.visible, true);
            assert.deepEqual(st.srcs, [expected[i]], 'cada pantalla muestra su propia imagen');
            assert.equal(st.loaded, true);
        }
        assert.equal(await left.textContent('#scanGallery figcaption'), 'Hoja');
        assert.ok(await left.isHidden('#svNav'), 'la botonera no estorba sobre las imágenes');
        assert.ok(await center.isVisible('#gestureBar'), 'el estado de los gestos sigue a la vista');

        // Sostener el pulgar no alterna de nuevo; la V no avanza mientras se ven los escaneos.
        await center.waitForTimeout(1800);
        for (const p of all) assert.equal((await scanState(p)).visible, true);
        await hand(center, { pose: 'v' });
        await center.waitForFunction(() => /Escaneos abiertos/.test(document.getElementById('gestureStatus').textContent));
        assert.equal(await center.evaluate(() => document.getElementById('svPano').getAttribute('data-fake-pano')), await right.evaluate(() => document.getElementById('svPano').getAttribute('data-fake-pano')));

        // Bajar la mano y repetir el pulgar arriba: vuelve la huerta en las tres, como estaba.
        await hand(center, { present: false });
        await center.waitForTimeout(400);
        await hand(center, { present: true, pose: 'thumb' });
        await center.waitForFunction(() => /Volviendo a la huerta/.test(document.getElementById('gestureStatus').textContent));
        for (const p of all) await p.waitForFunction(() => !window.AvotexInmersiva._debug().scans.on && document.getElementById('scanGallery').hidden);
        const after = await Promise.all(all.map(heading));
        after.forEach((h, i) => assert.ok(Math.abs(angDiff(h, before[i])) < 0.01, 'la vista no se movió: ' + i));
        assert.ok(await left.isVisible('#svNav'));

        // Una lateral recargada respeta el estado compartido.
        await hand(center, { present: false });
        await center.waitForTimeout(400);
        await hand(center, { present: true, pose: 'thumb' });
        await right.waitForFunction(() => window.AvotexInmersiva._debug().scans.on);
        await right.reload();
        await right.waitForFunction(() => window.AvotexInmersiva && window.AvotexInmersiva._debug().scans.on, null, { timeout: 15000 });
        assert.deepEqual((await scanState(right)).srcs, ['scan-derecha.png']);

        // Escape en cualquier pantalla también regresa a la huerta en las tres.
        await left.keyboard.press('Escape');
        for (const p of all) await p.waitForFunction(() => !window.AvotexInmersiva._debug().scans.on);
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('Escaneos en Vista normal: la tecla E muestra las tres juntas y avisa si falta una imagen', async () => {
    const env = await setup();
    try {
        await routeScans(env.context, { missing: ['derecha'] });
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        await page.keyboard.press('e');
        await page.waitForFunction(() => document.querySelectorAll('#scanGallery .scan-slot').length === 3);
        await page.waitForFunction(() => document.querySelectorAll('#scanGallery .scan-slot.is-missing').length === 1);
        const st = await scanState(page);
        assert.equal(st.visible, true);
        assert.deepEqual(st.srcs, ['scan izquierda.png', 'scan-central.png']);
        assert.deepEqual(st.missing, ['right']);
        assert.match(await page.textContent('#scanGallery .is-missing'), /Falta la imagen scan-derecha\.png/);
        // La E dentro de un campo de texto no hace nada; el botón regresa a la huerta.
        await page.click('[data-action="close-scans"]');
        await page.waitForFunction(() => document.getElementById('scanGallery').hidden);
        assert.ok(await page.isVisible('#svNav'));
        // Al volver al selector los escaneos no se quedan abiertos.
        await page.keyboard.press('E');
        await page.waitForFunction(() => !document.getElementById('scanGallery').hidden);
        await page.click('[data-action="close-scans"]');
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

test('Gestos: permiso denegado o sin webcam deja la navegación manual intacta', async () => {
    const env = await setup();
    try {
        const page = await env.newPage();
        await env.login(page);
        await page.goto(env.base + '/admin.html');
        await page.click('text=Entrar a mi huerta');
        await page.waitForFunction(() => document.getElementById('svPano').getAttribute('data-fake-pano') === 'pano-tec');
        await page.evaluate(() => window.AvotexGestos._setDeps({
            getUserMedia: async () => { const e = new Error('denegado'); e.name = 'NotAllowedError'; throw e; },
            createLandmarker: async () => ({ landmarker: { detectForVideo: () => ({ landmarks: [] }), close() {} }, delegate: 'FAKE' })
        }));
        await page.click('#gestureToggle');
        await page.waitForFunction(() => /Permiso de cámara denegado/.test(document.getElementById('gestureStatus').textContent));
        assert.equal(await page.textContent('#gestureToggleLabel'), 'Activar gestos');
        await page.evaluate(() => window.AvotexGestos._setDeps({
            getUserMedia: async () => { const e = new Error('sin cámara'); e.name = 'NotFoundError'; throw e; },
            createLandmarker: async () => ({ landmarker: { detectForVideo: () => ({ landmarks: [] }), close() {} }, delegate: 'FAKE' })
        }));
        await page.click('#gestureToggle');
        await page.waitForFunction(() => /No se encontró una webcam/.test(document.getElementById('gestureStatus').textContent));
        // La botonera sigue funcionando.
        const h = await page.evaluate(() => window.__svPanorama.getPov().heading);
        await page.click('#svNav [data-nav="right"]');
        await page.waitForFunction(h => Math.abs(((window.__svPanorama.getPov().heading - h + 540) % 360) - 180 - 45) < 1, h);
        assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
});

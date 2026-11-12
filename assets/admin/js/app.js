/**
 * AVOTEX Admin Intelligence — vistas del panel.
 * Todos los números salen de las tablas reales (users, huertas, scans, recorridos, hallazgos, reportes).
 * Reglas de cálculo: stats.js. Acceso a datos y autorización: data.js + api/admin.js.
 */
import * as S from './stats.js?v=20261112b';
import * as C from './charts.js?v=20261112b';
import * as D from './data.js?v=20261112b';

const { esc, fmt, fmtInt } = C;

// ───────── iconos (trazo, 24×24) ─────────
const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4.2 4 1.8 4.6 4.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4-6.5 8-6.5s7 2.3 8 6.5"/>',
  file: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  camera: '<path d="M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.8"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  bars: '<path d="M4 20h16"/><path d="M6 16v-4M10 16V8M14 16v-6M18 16V5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 13 11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M4 20h16"/><path d="M6 16v-4M10 16V8M14 16v-6M18 16V5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
};
const icon = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

// ───────── estado ─────────
const st = {
  getToken: null, admin: '', data: null,
  users: [], huertas: [], reportes: [], recorridos: [], analyses: [],
  huertaById: new Map(), by: {},
  period: 30, view: 'dashboard', sel: null, tab: 'resumen',
  uq: '', uchips: new Set(), showFilters: false,
  scansF: { q: '', user: '', huerta: '', crop: '', cat: '', src: '', from: '', to: '', page: 0 },
  repF: { q: '', user: '', huerta: '', from: '', to: '', page: 0 },
  hueF: { q: '', user: '', sort: 'recent', page: 0 },
  tokF: { q: '', plan: '', low: false, page: 0 },
  usrF: { q: '', page: 0 },
  evoG: null, urls: new Map(),
};
const lc = s => String(s ?? '').trim().toLowerCase();
const $ = (sel, root = document) => root.querySelector(sel);

function group(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}

/** Índices una sola vez por carga (no hay consultas por tarjeta). */
function indexData(data) {
  st.data = data;
  st.users = (data.users || []).map(u => ({ ...u, email: lc(u.user_email), plan: S.planKey(u.plan_suscripcion) }))
    .filter(u => u.email).sort((a, b) => a.email.localeCompare(b.email));
  st.huertas = data.huertas || [];
  st.reportes = (data.reportes || []).map(r => ({ ...r, t: Date.parse(r.created_at) || 0, email: lc(r.user_email) }));
  st.recorridos = (data.recorridos || []).map(r => ({ ...r, t: Date.parse(r.iniciado_at) || 0, email: lc(r.user_email) }));
  st.analyses = S.buildAnalyses(data.scans || [], data.hallazgos || []).map(a => ({ ...a, email: lc(a.user) }));
  st.huertaById = new Map(st.huertas.map(h => [h.id, h]));
  st.by = {
    huertas: group(st.huertas, h => lc(h.user_email)),
    reportes: group(st.reportes, r => r.email),
    recorridos: group(st.recorridos, r => r.email),
    analyses: group(st.analyses, a => a.email),
  };
  st.firstDate = Math.min(...[...st.analyses.map(a => a.date), ...st.reportes.map(r => r.t), ...st.recorridos.map(r => r.t)].filter(Boolean), Date.now());
}

const range = () => S.rangeOf(st.period === 'all' ? 'all' : st.period);
const inP = (t, r = range()) => S.inRange(t, r.from, r.to);
const inPrev = (t, r = range()) => r.prevFrom !== null && S.inRange(t, r.prevFrom, r.prevTo - 1);
const per = list => { const r = range(); return list.filter(x => inP(x.date ?? x.t, r)); };
const prevOf = list => { const r = range(); return r.prevFrom === null ? null : list.filter(x => inPrev(x.date ?? x.t, r)); };

// ───────── formato ─────────
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dfmt = t => { if (!t) return '—'; const d = new Date(t); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`; };
const dtfmt = t => { if (!t) return '—'; const d = new Date(t); return `${dfmt(t)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const bucketLabel = (t, g) => { const d = new Date(t); return g === 'month' ? `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${MES[d.getMonth()]}`; };
function initials(email) {
  const local = String(email || '').split('@')[0];
  const parts = local.split(/[._\-+]+/).filter(p => /[a-z]/i.test(p));
  const letters = parts.map(p => (p.match(/[a-z]/i) || [''])[0]);
  return ((letters[0] || '?') + (parts.length > 1 ? letters[1] : '')).toUpperCase();
}
const huertaName = id => { if (!id) return null; const h = st.huertaById.get(id); return h ? (h.nombre || 'Huerta sin nombre') : 'Huerta eliminada'; };
const CAT = { sano: 'Saludable', revisar: 'Requiere revisión', problema: 'Con problema', inconcluso: 'No concluyente' };
const pill = cat => `<span class="pill ${cat}">${CAT[cat]}</span>`;
const pct = v => v === null || v === undefined ? '—' : `${fmt(v, 1)} %`;
function trendHtml(v, { pp = false } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const cls = Math.abs(v) < 0.05 ? 'flat' : v > 0 ? 'up' : 'down';
  const arrow = cls === 'up' ? '↗' : cls === 'down' ? '↘' : '→';
  return `<span class="trend ${cls}" data-tip="Frente al periodo anterior de la misma duración">${v > 0 ? '+' : ''}${fmt(v, 1)}${pp ? ' pp' : ' %'} ${arrow}</span>`;
}
function kpi(ic, title, value, { sub = '', trend = '', tip = '', cls = '' } = {}) {
  return `<div class="kpi glass ${cls}" ${tip ? `data-tip="${esc(tip)}"` : ''}><div class="bub">${icon(ic)}</div><div><div class="t">${esc(title)}</div><div class="v"><b>${value}</b>${trend}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`;
}
const emptyBox = (title, text, ic = 'chart') => C.empty(title, text).replace('<div class="empty-ic" data-ic="chart"></div>', `<div class="empty-ic">${icon(ic)}</div>`);

// ───────── satelital ─────────
function sat(h, W = 360) {
  const b = h && S.bboxOf(h.coordinates);
  if (!b) return `<div class="sat nogeo" data-tip="Esta huerta no tiene polígono guardado">${icon('map')}</div>`;
  const dw = b.maxX - b.minX, dh = b.maxY - b.minY;
  const H = Math.max(40, Math.round(W * dh / dw));
  const pts = b.pts.map(([x, y]) => `${(((x - b.minX) / dw) * 300).toFixed(1)},${(((b.maxY - y) / dh) * 200).toFixed(1)}`).join(' ');
  return `<div class="sat"><img loading="lazy" decoding="async" alt="" src="${esc(D.satelliteUrl(b, W, H))}" onerror="this.remove()"><svg viewBox="0 0 300 200" preserveAspectRatio="none"><polygon points="${pts}"/></svg></div>`;
}

// ───────── shell ─────────
const VIEWS = {
  dashboard: ['Dashboard', 'Resumen general de la plataforma AVOTEX', 'home'],
  usuarios: ['Usuarios', 'Clientes registrados y su actividad', 'users'],
  reportes: ['Reportes', 'Reportes satelitales por cliente y huerta', 'file'],
  escaneos: ['Escaneos', 'Fotos individuales y resultados de recorridos', 'camera'],
  huertas: ['Huertas', 'Huertas registradas y su salud observada', 'map'],
  tokens: ['Tokens', 'Saldo actual de cada cliente', 'coins'],
  analiticas: ['Analíticas', 'Tendencias de uso y de salud de cultivos', 'bars'],
  config: ['Configuración', 'Seguridad, conexión y reglas de cálculo', 'gear'],
};

function shell() {
  $('#nav').innerHTML = Object.entries(VIEWS).map(([k, [t, , ic]]) => `<button data-act="nav" data-view="${k}" class="${st.view === k ? 'on' : ''}">${icon(ic)}<span>${t}</span></button>`).join('');
  $('#sbEmail').textContent = st.admin;
  const m = D.getMode();
  $('#sbMode').className = `mode ${m}`;
  $('#sbMode').textContent = m === 'api' ? 'Modo seguro (servidor)' : 'Modo directo (sin servidor)';
  $('#period').innerHTML = Object.entries(S.PERIODS).map(([k, v]) => `<option value="${k}" ${String(st.period) === k ? 'selected' : ''}>${k === 'all' ? v : 'Últimos ' + v}</option>`).join('');
}

function setView(v) {
  st.view = v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  const [t, sub] = VIEWS[v];
  $('#title').textContent = t;
  $('#subtitle').textContent = sub;
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.id === 'v-' + v));
  document.body.classList.remove('nav-open');
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  const fn = { dashboard: renderDashboard, usuarios: renderUsuarios, reportes: renderReportes, escaneos: renderEscaneos, huertas: renderHuertas, tokens: renderTokens, analiticas: renderAnaliticas, config: renderConfig }[st.view];
  fn();
}

// ───────── DASHBOARD ─────────
function globalKpis() {
  const r = range();
  const cur = per(st.analyses), prev = prevOf(st.analyses);
  const fotos = cur.filter(a => a.source === 'foto').length;
  const dCur = S.distribution(cur), dPrev = prev ? S.distribution(prev) : null;
  const reps = per(st.reportes), repsPrev = prevOf(st.reportes);
  const activos = new Set(cur.map(a => a.email)).size;
  const walks = per(st.recorridos).length;
  const hrTrend = dPrev && dPrev.healthyRate !== null && dCur.healthyRate !== null ? dCur.healthyRate - dPrev.healthyRate : null;
  const totalTxt = st.period === 'all' ? '' : ' en el periodo';
  return `<div class="kpis">
    ${kpi('users', 'Usuarios registrados', fmtInt(st.users.length), { sub: `${fmtInt(activos)} con análisis${totalTxt}`, tip: 'Total actual de la tabla users (no depende del periodo).' })}
    ${kpi('camera', 'Análisis realizados', fmtInt(cur.length), { sub: `${fmtInt(fotos)} fotos · ${fmtInt(cur.length - fotos)} de recorrido · ${fmtInt(walks)} recorridos`, trend: trendHtml(prev ? S.trend(cur.length, prev.length) : null), tip: 'Análisis = fotos individuales (scans) + resultados de recorrido (hallazgos). Los recorridos son sesiones y no se suman.' })}
    ${kpi('leaf', 'Resultados saludables', dCur.healthyRate === null ? '—' : pct(dCur.healthyRate), { sub: dCur.conclusive ? `${fmtInt(dCur.sano)} de ${fmtInt(dCur.conclusive)} concluyentes` : 'Sin resultados concluyentes', trend: trendHtml(hrTrend, { pp: true }), tip: 'Saludables ÷ (saludables + con problema). No incluye «requiere revisión» (confianza < 60 %) ni «no es fruto».' })}
    ${kpi('file', 'Reportes generados', fmtInt(reps.length), { sub: `${fmtInt(st.reportes.length)} en total`, trend: trendHtml(repsPrev ? S.trend(reps.length, repsPrev.length) : null) })}
  </div>`;
}

function filteredUsers() {
  const q = lc(st.uq);
  const cur = per(st.analyses);
  const counts = new Map();
  for (const a of cur) counts.set(a.email, (counts.get(a.email) || 0) + 1);
  return st.users.filter(u => {
    if (q && !u.email.includes(q)) return false;
    for (const c of st.uchips) {
      if (c === 'pro' || c === 'basic' || c === 'free') { if (![...st.uchips].filter(x => ['pro', 'basic', 'free'].includes(x)).includes(u.plan)) return false; }
      if (c === 'low' && !S.lowBalance(u)) return false;
      if (c === 'active' && !counts.get(u.email)) return false;
      if (c === 'nohuerta' && (st.by.huertas.get(u.email) || []).length) return false;
    }
    return true;
  }).map(u => ({ u, n: counts.get(u.email) || 0 })).sort((a, b) => b.n - a.n || a.u.email.localeCompare(b.u.email));
}

function userRows() {
  const list = filteredUsers();
  if (!list.length) return emptyBox('Sin coincidencias', st.users.length ? 'Ningún usuario coincide con la búsqueda o los filtros.' : 'Aún no hay usuarios registrados.', 'users');
  return list.slice(0, 300).map(({ u, n }) => {
    const low = S.lowBalance(u);
    return `<button class="urow ${st.sel === u.email ? 'on' : ''}" data-act="user" data-email="${esc(u.email)}">
      <span class="av">${esc(initials(u.email))}</span>
      <span class="m"><b>${esc(u.email)}</b><small>${S.PLAN_LABEL[u.plan]} · ${fmtInt(n)} análisis</small></span>
      <span class="tok ${low ? 'low' : ''}" data-tip="${low ? 'Saldo bajo (< 10 % de su plan)' : 'Tokens restantes'}">${icon('coins')}${fmtInt(S.visibleTokens(u.tokens))}</span>${icon('chev', 'ic chev')}</button>`;
  }).join('') + (list.length > 300 ? `<p class="note">Mostrando 300 de ${fmtInt(list.length)}. Usa la búsqueda.</p>` : '');
}

const CHIPS = [['pro', 'Plan Pro'], ['basic', 'Básico'], ['free', 'Free'], ['low', 'Saldo bajo'], ['active', 'Con actividad'], ['nohuerta', 'Sin huertas']];

function renderDashboard() {
  const el = $('#v-dashboard');
  if (!st.sel || !st.users.find(u => u.email === st.sel)) st.sel = filteredUsers()[0]?.u.email || st.users[0]?.email || null;
  el.innerHTML = `${globalKpis()}
  <div class="dash">
    <section class="card glass users-panel">
      <div class="hd"><h2>Usuarios</h2><p>Gestiona y analiza la actividad de cada cliente</p></div>
      <div class="searchrow"><label class="search">${icon('search')}<span class="sr">Buscar usuario</span><input class="input" data-f="uq" placeholder="Buscar usuario…" value="${esc(st.uq)}"></label>
        <button class="icon-btn" data-act="toggleFilters" aria-label="Filtros">${icon('filter')}${st.uchips.size ? '<i class="dotn"></i>' : ''}</button></div>
      <div class="filters-pop ${st.showFilters ? 'on' : ''}">${CHIPS.map(([k, t]) => `<button class="chip ${st.uchips.has(k) ? 'on' : ''}" data-act="chip" data-k="${k}">${t}</button>`).join('')}</div>
      <div class="ulist" id="ulist">${userRows()}</div>
    </section>
    <section class="card glass udetail" id="udetail">${userDetail()}</section>
  </div>`;
}

// ───────── detalle de usuario ─────────
function userCtx(email) {
  const u = st.users.find(x => x.email === email);
  const all = st.by.analyses.get(email) || [];
  const huertas = st.by.huertas.get(email) || [];
  const reps = st.by.reportes.get(email) || [];
  const walks = st.by.recorridos.get(email) || [];
  return { u, all, cur: per(all), prev: prevOf(all), huertas, reps, repsP: per(reps), walks, walksP: per(walks) };
}

function userDetail() {
  if (!st.sel) return emptyBox('Sin usuarios', 'Cuando se registren clientes aparecerán aquí.', 'users');
  const c = userCtx(st.sel);
  if (!c.u) return emptyBox('Usuario no encontrado', 'Selecciona otro usuario de la lista.', 'user');
  const TABS = [['resumen', 'Resumen', 'activity'], ['escaneos', 'Escaneos', 'camera'], ['huertas', 'Huertas', 'map'], ['reportes', 'Reportes', 'file'], ['actividad', 'Actividad', 'route']];
  const body = { resumen: tabResumen, escaneos: tabEscaneos, huertas: tabHuertas, reportes: tabReportes, actividad: tabActividad }[st.tab](c);
  return `<div class="uhead"><div class="uhead-r">
      <span class="av lg">${esc(initials(c.u.email))}</span>
      <div class="who"><h2>${esc(c.u.email)}</h2><div class="meta"><span class="plan ${c.u.plan}">${c.u.plan === 'pro' ? icon('crown') : ''}${S.PLAN_LABEL[c.u.plan]}</span><span>${fmtInt(c.huertas.length)} huertas · ${fmtInt(c.all.length)} análisis en total</span></div></div>
      <button class="btn primary" data-act="genreport" data-email="${esc(c.u.email)}">${icon('file')}Generar reporte</button>
      <div class="menu"><button class="icon-btn" data-act="umenu" aria-label="Más opciones">${icon('dots')}</button>
        <div class="menu-pop" id="umenu">
          <button data-act="copy" data-text="${esc(c.u.email)}">${icon('copy')}Copiar correo</button>
          <button data-act="goScans" data-email="${esc(c.u.email)}">${icon('camera')}Ver sus escaneos</button>
          <button data-act="goHuertas" data-email="${esc(c.u.email)}">${icon('map')}Ver sus huertas</button>
          <button data-act="goReports" data-email="${esc(c.u.email)}">${icon('file')}Ver sus reportes</button>
          <button data-act="goTokens" data-email="${esc(c.u.email)}">${icon('coins')}Ver en Tokens</button>
        </div></div>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([k, t, ic]) => `<button role="tab" aria-selected="${st.tab === k}" class="${st.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${icon(ic)}${t}</button>`).join('')}</div>
  </div><div class="ubody">${body}</div>`;
}

function healthDonut(list, { label = 'análisis' } = {}) {
  const d = S.distribution(list);
  const segs = [
    { key: 'sano', label: 'Saludable', value: d.sano, color: C.COLORS.sano, dark: C.COLORS.sanoDark },
    { key: 'revisar', label: 'Requiere revisión', value: d.revisar, color: C.COLORS.revisar, dark: C.COLORS.revisarDark },
    { key: 'problema', label: 'Con problema', value: d.problema, color: C.COLORS.problema, dark: C.COLORS.problemaDark },
  ];
  const lg = C.legend(segs.map(s => ({ label: s.label, color: s.color, value: d.evaluated ? pct(d.pct[s.key]) : '—', tip: `${s.label}: ${fmtInt(s.value)}` })));
  return `<div class="donut-row">${C.donut(segs, { center: fmtInt(d.evaluated), sub: label })}${lg}</div>
    <p class="note">${d.inconcluso ? `${fmtInt(d.inconcluso)} fotos sin fruto reconocible no se cuentan. ` : ''}${d.conclusive ? `Tasa saludable: <b>${pct(d.healthyRate)}</b> (${fmtInt(d.conclusive)} concluyentes).` : ''} «Requiere revisión» = confianza del modelo menor a 60 %.</p>`;
}

function activityLine(list, { split = true } = {}) {
  const s = S.series(list.map(a => a.date), st.period, Date.now(), st.period === 'all' ? st.firstDate : null);
  if (!s.buckets.length || !list.length) return emptyBox('Sin actividad en el periodo', 'No hay análisis registrados en este rango de fechas.', 'activity');
  const labels = s.buckets.map(b => bucketLabel(b.start, s.g));
  if (!split) return C.line([{ name: 'Análisis', color: C.COLORS.sano, values: s.buckets.map(b => b.n) }], labels, { w: 460, h: 240 });
  const f = S.series(list.filter(a => a.source === 'foto').map(a => a.date), st.period, Date.now(), st.period === 'all' ? st.firstDate : null);
  const rr = S.series(list.filter(a => a.source === 'recorrido').map(a => a.date), st.period, Date.now(), st.period === 'all' ? st.firstDate : null);
  return C.line([
    { name: 'Total', color: C.COLORS.sano, values: s.buckets.map(b => b.n) },
    { name: 'Fotos', color: C.COLORS.sky, values: f.buckets.map(b => b.n) },
    { name: 'Recorrido', color: '#7FC31C', values: rr.buckets.map(b => b.n) },
  ], labels, { w: 460, h: 240 });
}

function huertaRow(h, c) {
  const hs = S.huertaStats(h, c.cur, c.walksP, c.repsP);
  const rate = hs.dist.healthyRate;
  return `<button class="hrow" data-act="huerta" data-id="${esc(h.id)}">${sat(h, 220)}
    <span class="hmid"><span><b>${esc(h.nombre || 'Huerta sin nombre')}</b><small>${fmt(S.hectares(h.area_m2), 2)} ha · ${fmtInt(hs.fotos + hs.resultadosRecorrido)} análisis · ${fmtInt(hs.recorridos)} recorridos</small></span>
    <span class="health" data-tip="Salud observada en escaneos: saludables ÷ concluyentes del periodo">${rate === null
      ? '<span class="lbl"><span>Salud observada en escaneos</span><b>Sin datos</b></span><span class="bar"></span>'
      : `<span class="lbl"><span>Salud observada en escaneos · n=${fmtInt(hs.sample)}</span><b>${fmt(rate, 0)} %</b></span><span class="bar"><i style="width:${rate.toFixed(1)}%"></i></span>`}</span></span>${icon('chev', 'ic chev')}</button>`;
}

function reportRow(r) {
  const h = r.huerta_id ? st.huertaById.get(r.huerta_id) : null;
  const idx = ['ndvi', 'ndre', 'msavi', 'reci', 'ndmi'].filter(k => r[k] !== null && r[k] !== undefined).map(k => k.toUpperCase());
  return `<button class="rrow" data-act="report" data-id="${esc(r.id)}">${h ? sat(h, 160) : `<div class="sat nogeo">${icon('file')}</div>`}
    <span><b class="${r.huerta_id ? '' : 'nohuerta'}">${r.huerta_id ? 'Reporte satelital — ' + esc(huertaName(r.huerta_id)) : 'Reporte satelital — Sin huerta asignada'}</b><small>${esc(idx.join(' · ') || 'Sin índices')}</small></span>
    <span class="date">${dfmt(r.t)}</span></button>`;
}

function tabResumen(c) {
  const fotos = c.cur.filter(a => a.source === 'foto').length;
  const ha = c.huertas.reduce((s, h) => s + S.hectares(h.area_m2), 0);
  const low = S.lowBalance(c.u);
  return `<div class="kpis4">
      ${kpi('camera', 'Escaneos', fmtInt(c.cur.length), { cls: 'small sub-card', sub: `${fmtInt(fotos)} fotos · ${fmtInt(c.cur.length - fotos)} de recorrido`, trend: trendHtml(c.prev ? S.trend(c.cur.length, c.prev.length) : null) })}
      ${kpi('map', 'Huertas', fmtInt(c.huertas.length), { cls: 'small sub-card', sub: `${fmt(ha, 2)} ha registradas` })}
      ${kpi('coins', 'Tokens restantes', fmtInt(S.visibleTokens(c.u.tokens)), { cls: 'small sub-card', sub: low ? '<span class="tok low">Saldo bajo</span>' : `${S.PLAN_LABEL[c.u.plan]} · saldo actual`, tip: 'Saldo actual (no depende del periodo). La app muestra users.tokens × 100.' })}
      ${kpi('file', 'Reportes generados', fmtInt(c.repsP.length), { cls: 'small sub-card', sub: `${fmtInt(c.reps.length)} en total` })}
    </div>
    <div class="grid2">
      <div class="sub-card"><h3>Resultados de escaneos</h3>${healthDonut(c.cur)}</div>
      <div class="sub-card"><h3>Actividad reciente <small>Total · Fotos · Recorrido</small></h3>${activityLine(c.cur)}</div>
    </div>
    <div class="grid2">
      <div class="sub-card"><h3>Estado de sus huertas ${c.huertas.length > 4 ? '<button class="link" data-act="tab" data-tab="huertas">Ver todas →</button>' : ''}</h3>
        ${c.huertas.length ? `<div class="hlist">${c.huertas.slice(0, 4).map(h => huertaRow(h, c)).join('')}</div>` : emptyBox('Sin huertas', 'Este cliente aún no ha registrado huertas en la app.', 'map')}</div>
      <div class="sub-card"><h3>Últimos reportes ${c.reps.length ? '<button class="link" data-act="tab" data-tab="reportes">Ver todos →</button>' : ''}</h3>
        ${c.reps.length ? `<div class="rlist">${c.reps.slice(0, 3).map(reportRow).join('')}</div>` : emptyBox('Sin reportes', 'Genera el primer reporte satelital de este cliente.', 'file')}</div>
    </div>`;
}

function tabEscaneos(c) {
  const list = [...c.cur].sort((a, b) => b.date - a.date);
  return `<div class="sub-card"><h3>Escaneos del periodo <button class="link" data-act="goScans" data-email="${esc(c.u.email)}">Abrir con filtros →</button></h3>
    ${list.length ? scanTable(list.slice(0, 30), false) + (list.length > 30 ? `<p class="note">Mostrando 30 de ${fmtInt(list.length)}.</p>` : '') : emptyBox('Sin escaneos en el periodo', 'Cambia el periodo o revisa otro cliente.', 'camera')}</div>`;
}

function tabHuertas(c) {
  return c.huertas.length ? `<div class="hlist">${c.huertas.map(h => huertaRow(h, c)).join('')}</div>` : emptyBox('Sin huertas', 'Este cliente aún no ha registrado huertas en la app.', 'map');
}

function tabReportes(c) {
  return `<div class="sub-card"><h3>Reportes <button class="btn primary sm" data-act="genreport" data-email="${esc(c.u.email)}">${icon('plus')}Nuevo</button></h3>
    ${c.reps.length ? `<div class="rlist">${c.reps.map(reportRow).join('')}</div>` : emptyBox('Sin reportes', 'Este cliente todavía no tiene reportes.', 'file')}</div>`;
}

function tabActividad(c) {
  const ev = [];
  const fotosByDay = group(c.cur.filter(a => a.source === 'foto'), a => new Date(a.date).toDateString());
  for (const [, l] of fotosByDay) ev.push({ t: Math.max(...l.map(a => a.date)), ic: 'camera', txt: `${l.length} ${l.length === 1 ? 'foto analizada' : 'fotos analizadas'}`, sub: summaryCats(l) });
  for (const w of c.walksP) ev.push({ t: w.t, ic: 'route', txt: `Recorrido ${w.estado ? '(' + w.estado + ')' : ''} — ${huertaName(w.huerta_id) || 'sin huerta'}`, sub: `${fmtInt(w.fotos_total)} fotos · ${fmtInt(w.fotos_analizadas)} analizadas · ${fmtInt(w.hallazgos_total)} hallazgos` });
  for (const r of c.repsP) ev.push({ t: r.t, ic: 'file', txt: 'Reporte satelital generado', sub: huertaName(r.huerta_id) || 'Sin huerta asignada' });
  ev.sort((a, b) => b.t - a.t);
  const s = S.series(c.cur.map(a => a.date), st.period, Date.now(), st.period === 'all' ? st.firstDate : null);
  const sw = S.seriesSum(c.walksP.map(w => ({ t: w.t, v: 1 })), s.buckets);
  const sr = S.seriesSum(c.repsP.map(r => ({ t: r.t, v: 1 })), s.buckets);
  return `<div class="sub-card"><h3>Actividad por ${s.g === 'day' ? 'día' : s.g === 'week' ? 'semana' : 'mes'}</h3>
    ${ev.length ? C.columns([
      { name: 'Análisis', color: C.COLORS.sano, values: s.buckets.map(b => b.n) },
      { name: 'Recorridos', color: C.COLORS.lime, values: sw.map(b => b.n) },
      { name: 'Reportes', color: C.COLORS.forest, values: sr.map(b => b.n) },
    ], s.buckets.map(b => bucketLabel(b.start, s.g))) : emptyBox('Sin actividad', 'No hay actividad en el periodo seleccionado.', 'activity')}</div>
    ${ev.length ? `<div class="sub-card"><h3>Línea de tiempo</h3><div class="rlist">${ev.slice(0, 60).map(e => `<div class="rrow" style="grid-template-columns:40px 1fr auto"><span class="thumb">${icon(e.ic)}</span><span><b>${esc(e.txt)}</b><small>${esc(e.sub)}</small></span><span class="date">${dtfmt(e.t)}</span></div>`).join('')}</div></div>` : ''}`;
}
function summaryCats(l) {
  const d = S.distribution(l);
  return [d.sano && `${d.sano} saludables`, d.revisar && `${d.revisar} por revisar`, d.problema && `${d.problema} con problema`, d.inconcluso && `${d.inconcluso} sin fruto`].filter(Boolean).join(' · ');
}

// ───────── USUARIOS ─────────
function renderUsuarios() {
  const el = $('#v-usuarios');
  if (!el.dataset.ready) {
    el.innerHTML = `<section class="card glass"><div class="toolbar">
      <label class="search">${icon('search')}<input class="input" data-f="usrF.q" placeholder="Buscar por correo…"></label>
      ${CHIPS.map(([k, t]) => `<button class="chip ${st.uchips.has(k) ? 'on' : ''}" data-act="chip" data-k="${k}">${t}</button>`).join('')}
    </div><div id="usr-body"></div></section>`;
    el.dataset.ready = '1';
  }
  el.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', st.uchips.has(b.dataset.k)));
  const q = lc(st.usrF.q);
  const saved = st.uq; st.uq = q;
  const list = filteredUsers();
  st.uq = saved;
  const page = pageOf(list, st.usrF, 25);
  $('#usr-body').innerHTML = list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Usuario</th><th>Plan</th><th class="num">Tokens</th><th class="num">Huertas</th><th class="num">Análisis</th><th class="num">Saludable</th><th class="num">Reportes</th><th>Último análisis</th></tr></thead><tbody>
    ${page.rows.map(({ u, n }) => {
      const a = per(st.by.analyses.get(u.email) || []);
      const d = S.distribution(a);
      const last = (st.by.analyses.get(u.email) || []).reduce((m, x) => Math.max(m, x.date), 0);
      return `<tr class="click" data-act="openUser" data-email="${esc(u.email)}"><td><span style="display:flex;align-items:center;gap:10px"><span class="av" style="width:32px;height:32px;font-size:12px">${esc(initials(u.email))}</span><span class="ell">${esc(u.email)}</span></span></td>
        <td><span class="plan ${u.plan}">${S.PLAN_LABEL[u.plan]}</span></td><td class="num"><span class="tok ${S.lowBalance(u) ? 'low' : ''}">${fmtInt(S.visibleTokens(u.tokens))}</span></td>
        <td class="num">${fmtInt((st.by.huertas.get(u.email) || []).length)}</td><td class="num">${fmtInt(n)}</td><td class="num">${d.conclusive ? pct(d.healthyRate) : '—'}</td>
        <td class="num">${fmtInt(per(st.by.reportes.get(u.email) || []).length)}</td><td>${last ? dfmt(last) : 'Sin análisis'}</td></tr>`;
    }).join('')}</tbody></table></div>${pager(page, 'usrF')}` : emptyBox('Sin coincidencias', 'Ningún usuario coincide con la búsqueda.', 'users');
}

function pageOf(list, f, size) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  if (f.page >= pages) f.page = pages - 1;
  return { rows: list.slice(f.page * size, f.page * size + size), page: f.page, pages, total: list.length, size };
}
function pager(p, key) {
  if (p.pages <= 1) return `<div class="pager"><span>${fmtInt(p.total)} registros</span></div>`;
  return `<div class="pager"><span>${fmtInt(p.page * p.size + 1)}–${fmtInt(Math.min(p.total, (p.page + 1) * p.size))} de ${fmtInt(p.total)}</span><span class="btns">
    <button class="btn ghost sm" data-act="page" data-k="${key}" data-d="-1" ${p.page === 0 ? 'disabled' : ''}>Anterior</button>
    <button class="btn ghost sm" data-act="page" data-k="${key}" data-d="1" ${p.page >= p.pages - 1 ? 'disabled' : ''}>Siguiente</button></span></div>`;
}

// ───────── ESCANEOS ─────────
const userOptions = (sel, all = 'Todos los usuarios') => `<option value="">${all}</option>` + st.users.map(u => `<option value="${esc(u.email)}" ${sel === u.email ? 'selected' : ''}>${esc(u.email)}</option>`).join('');
const huertaOptions = (email, sel, all = 'Todas las huertas', extra = '') => `<option value="">${all}</option>${extra}` + (email ? (st.by.huertas.get(email) || []) : st.huertas).map(h => `<option value="${esc(h.id)}" ${sel === h.id ? 'selected' : ''}>${esc(h.nombre || 'Huerta sin nombre')}${email ? '' : ' — ' + esc(lc(h.user_email))}</option>`).join('');

function renderEscaneos() {
  const el = $('#v-escaneos');
  const f = st.scansF;
  const crops = [...new Set(st.analyses.map(a => a.crop))].sort();
  el.innerHTML = `<section class="card glass"><div class="toolbar">
      <label class="search">${icon('search')}<input class="input" data-f="scansF.q" placeholder="Buscar por correo, resultado o huerta…" value="${esc(f.q)}"></label>
      <select class="select" data-f="scansF.user" aria-label="Usuario">${userOptions(f.user)}</select>
      <select class="select" data-f="scansF.huerta" aria-label="Huerta">${huertaOptions(f.user, f.huerta, 'Todas las huertas', `<option value="none" ${f.huerta === 'none' ? 'selected' : ''}>Sin huerta asignada</option>`)}</select>
      <select class="select" data-f="scansF.crop" aria-label="Cultivo"><option value="">Todos los cultivos</option>${crops.map(c => `<option ${f.crop === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select class="select" data-f="scansF.cat" aria-label="Estado"><option value="">Todos los estados</option>${Object.entries(CAT).map(([k, v]) => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="select" data-f="scansF.src" aria-label="Tipo de captura"><option value="">Foto y recorrido</option><option value="foto" ${f.src === 'foto' ? 'selected' : ''}>Foto individual</option><option value="recorrido" ${f.src === 'recorrido' ? 'selected' : ''}>Recorrido</option></select>
      <label class="f">Desde <input type="date" class="input" data-f="scansF.from" value="${esc(f.from)}"></label>
      <label class="f">Hasta <input type="date" class="input" data-f="scansF.to" value="${esc(f.to)}"></label>
      <button class="btn ghost sm" data-act="clearScans">Limpiar</button>
    </div><div id="scans-body"></div></section>`;
  renderScansBody();
}

function scansFiltered() {
  const f = st.scansF, q = lc(f.q);
  const from = f.from ? Date.parse(f.from + 'T00:00:00') : null, to = f.to ? Date.parse(f.to + 'T23:59:59') : null;
  return per(st.analyses).filter(a => {
    if (f.user && a.email !== f.user) return false;
    if (f.huerta === 'none' ? a.huerta : f.huerta && a.huerta !== f.huerta) return false;
    if (f.crop && a.crop !== f.crop) return false;
    if (f.cat && a.cat !== f.cat) return false;
    if (f.src && a.source !== f.src) return false;
    if (from && a.date < from) return false;
    if (to && a.date > to) return false;
    if (q && !(a.email.includes(q) || lc(a.label).includes(q) || lc(huertaName(a.huerta)).includes(q) || lc(a.crop).includes(q))) return false;
    return true;
  }).sort((a, b) => b.date - a.date);
}

function scanTable(rows, withUser = true) {
  return `<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Fecha</th>${withUser ? '<th>Usuario</th>' : ''}<th>Huerta</th><th>Cultivo</th><th>Resultado del modelo</th><th class="num">Confianza</th><th>Estado</th><th>Captura</th></tr></thead><tbody>
  ${rows.map(a => `<tr class="click" data-act="scan" data-key="${esc(a.key)}"><td>${a.thumb ? `<img class="thumb" data-thumb="${esc(a.thumb)}" alt="">` : `<span class="thumb" data-tip="${a.source === 'foto' ? 'Las fotos individuales no guardan imagen en el servidor' : 'Sin miniatura'}">${icon(a.source === 'foto' ? 'camera' : 'image')}</span>`}</td>
    <td>${dtfmt(a.date)}</td>${withUser ? `<td class="ell">${esc(a.email)}</td>` : ''}<td class="ell ${a.huerta ? '' : 'nohuerta'}">${esc(huertaName(a.huerta) || 'Sin huerta asignada')}</td><td>${esc(a.crop)}</td>
    <td class="ell">${esc(S.labelName(a.label))}</td><td class="num">${a.conf === null ? '—' : fmt(a.conf * 100, 0) + ' %'}</td><td>${pill(a.cat)}</td><td><span class="pill src">${a.source === 'foto' ? 'Foto' : 'Recorrido'}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}

function renderScansBody() {
  const list = scansFiltered();
  const d = S.distribution(list);
  const fotos = list.filter(a => a.source === 'foto').length;
  const page = pageOf(list, st.scansF, 25);
  $('#scans-body').innerHTML = list.length ? `<p class="note" style="margin:0 0 10px">${fmtInt(list.length)} análisis · ${fmtInt(fotos)} fotos · ${fmtInt(list.length - fotos)} de recorrido · ${fmtInt(d.sano)} saludables · ${fmtInt(d.revisar)} por revisar · ${fmtInt(d.problema)} con problema${d.inconcluso ? ` · ${fmtInt(d.inconcluso)} sin fruto` : ''}</p>${scanTable(page.rows)}${pager(page, 'scansF')}`
    : emptyBox('Sin escaneos', st.analyses.length ? 'Ningún análisis coincide con los filtros o el periodo.' : 'Todavía no hay análisis registrados.', 'camera');
  loadThumbs($('#scans-body'));
}

async function loadThumbs(root) {
  const imgs = [...root.querySelectorAll('img[data-thumb]')];
  if (!imgs.length) return;
  const now = Date.now();
  const need = [...new Set(imgs.map(i => i.dataset.thumb))].filter(p => !(st.urls.get(p)?.exp > now));
  if (need.length) {
    const urls = await D.signedUrls(st.getToken, need);
    for (const p of need) st.urls.set(p, { url: urls[p] || null, exp: now + 8 * 60000 });
  }
  for (const i of imgs) {
    const u = st.urls.get(i.dataset.thumb)?.url;
    if (u) i.src = u;
    else { const s = document.createElement('span'); s.className = 'thumb'; s.dataset.tip = D.getMode() === 'api' ? 'Miniatura no disponible' : 'Las miniaturas solo se muestran en modo seguro'; s.innerHTML = icon('image'); i.replaceWith(s); }
  }
}

// ───────── HUERTAS ─────────
function renderHuertas() {
  const el = $('#v-huertas');
  const f = st.hueF;
  el.innerHTML = `<section class="card glass"><div class="toolbar">
    <label class="search">${icon('search')}<input class="input" data-f="hueF.q" placeholder="Buscar huerta o correo…" value="${esc(f.q)}"></label>
    <select class="select" data-f="hueF.user" aria-label="Cliente">${userOptions(f.user, 'Todos los clientes')}</select>
    <select class="select" data-f="hueF.sort" aria-label="Orden"><option value="recent" ${f.sort === 'recent' ? 'selected' : ''}>Más recientes</option><option value="area" ${f.sort === 'area' ? 'selected' : ''}>Mayor superficie</option><option value="analyses" ${f.sort === 'analyses' ? 'selected' : ''}>Más análisis</option><option value="health" ${f.sort === 'health' ? 'selected' : ''}>Menor salud observada</option></select>
  </div><div id="hue-body"></div></section>`;
  renderHuertasBody();
}
function renderHuertasBody() {
  const f = st.hueF, q = lc(f.q);
  const cur = per(st.analyses), walks = per(st.recorridos), reps = per(st.reportes);
  const aBy = group(cur, a => a.huerta), wBy = group(walks, w => w.huerta_id), rBy = group(reps, r => r.huerta_id);
  let list = st.huertas.filter(h => (!f.user || lc(h.user_email) === f.user) && (!q || lc(h.nombre).includes(q) || lc(h.user_email).includes(q)))
    .map(h => ({ h, s: S.huertaStats(h, aBy.get(h.id) || [], wBy.get(h.id) || [], rBy.get(h.id) || []) }));
  const sorters = {
    recent: (a, b) => (Date.parse(b.h.created_at) || 0) - (Date.parse(a.h.created_at) || 0),
    area: (a, b) => (Number(b.h.area_m2) || 0) - (Number(a.h.area_m2) || 0),
    analyses: (a, b) => (b.s.fotos + b.s.resultadosRecorrido) - (a.s.fotos + a.s.resultadosRecorrido),
    health: (a, b) => (a.s.dist.healthyRate ?? 101) - (b.s.dist.healthyRate ?? 101),
  };
  list.sort(sorters[f.sort] || sorters.recent);
  const page = pageOf(list, f, 24);
  $('#hue-body').innerHTML = list.length ? `<div class="hcards">${page.rows.map(({ h, s }) => `<button class="hcard" data-act="huerta" data-id="${esc(h.id)}">${sat(h, 400)}
    <div class="info"><b>${esc(h.nombre || 'Huerta sin nombre')}</b><small>${esc(lc(h.user_email))}</small>
    <div class="nums"><span>${fmt(S.hectares(h.area_m2), 2)} ha</span><span>${fmtInt(s.fotos + s.resultadosRecorrido)} análisis</span><span>${fmtInt(s.recorridos)} recorridos</span><span>${fmtInt(s.reportes.length)} reportes</span></div>
    <div class="health" style="margin-top:8px">${s.dist.healthyRate === null ? '<span class="lbl"><span>Salud observada en escaneos</span><b>Sin datos</b></span><span class="bar"></span>' : `<span class="lbl"><span>Salud observada · n=${fmtInt(s.sample)}</span><b>${fmt(s.dist.healthyRate, 0)} %</b></span><span class="bar"><i style="width:${s.dist.healthyRate.toFixed(1)}%"></i></span>`}</div></div></button>`).join('')}</div>${pager(page, 'hueF')}`
    : emptyBox('Sin huertas', st.huertas.length ? 'Ninguna huerta coincide con la búsqueda.' : 'Aún no hay huertas registradas.', 'map');
}

function openHuerta(id) {
  const h = st.huertaById.get(id);
  if (!h) return;
  const email = lc(h.user_email);
  const s = S.huertaStats(h, per(st.analyses), per(st.recorridos), st.reportes);
  const reps = st.reportes.filter(r => r.huerta_id === id);
  drawer(esc(h.nombre || 'Huerta sin nombre'), `${sat(h, 560)}
    <div class="kv">
      <div><small>Cliente</small><b style="font-size:13.5px;overflow-wrap:anywhere">${esc(email)}</b></div>
      <div><small>Superficie</small><b>${fmt(S.hectares(h.area_m2), 2)} ha</b></div>
      <div><small>Fotos individuales (periodo)</small><b>${fmtInt(s.fotos)}</b></div>
      <div><small>Resultados de recorrido (periodo)</small><b>${fmtInt(s.resultadosRecorrido)}</b></div>
      <div><small>Recorridos (periodo)</small><b>${fmtInt(s.recorridos)}</b></div>
      <div><small>Fotos tomadas / analizadas</small><b>${fmtInt(s.fotosTomadas)} / ${fmtInt(s.fotosAnalizadas)}</b></div>
      <div><small>Última inspección</small><b class="${s.lastInspection ? '' : 'na'}">${s.lastInspection ? dfmt(s.lastInspection) : 'Sin inspecciones'}</b></div>
      <div><small>Registrada</small><b>${dfmt(Date.parse(h.created_at))}</b></div>
    </div>
    <div class="sub-card"><h3>Salud observada en escaneos</h3>${healthDonut(per(st.analyses).filter(a => a.huerta === id))}</div>
    <div class="sub-card"><h3>Cultivos</h3>${s.crops.length ? C.hbars(s.crops.map(c => ({ label: c.crop, value: c.n, display: `${fmtInt(c.n)} · ${fmt(c.pct, 0)} %`, segments: catSegs(c) }))) : emptyBox('Sin análisis', 'No hay análisis con huerta asignada en el periodo.')}</div>
    <div class="sub-card"><h3>Problemas detectados</h3>${s.diseases.length ? C.hbars(s.diseases.map(d => ({ label: d.label, sub: d.crop, value: d.n, color: C.COLORS.problema, display: fmtInt(d.n) }))) : emptyBox('Sin problemas detectados', 'No hay resultados con problema y confianza suficiente.', 'check')}</div>
    <div class="sub-card"><h3>Reportes de esta huerta <button class="btn primary sm" data-act="genreport" data-email="${esc(email)}" data-huerta="${esc(id)}">${icon('plus')}Generar</button></h3>${reps.length ? `<div class="rlist">${reps.map(reportRow).join('')}</div>` : emptyBox('Sin reportes', 'Aún no hay reportes para esta huerta.', 'file')}</div>`);
}
const catSegs = c => [
  { label: 'Saludable', value: c.sano, color: C.COLORS.sano },
  { label: 'Requiere revisión', value: c.revisar, color: C.COLORS.revisar },
  { label: 'Con problema', value: c.problema, color: C.COLORS.problema },
];

// ───────── REPORTES ─────────
const RF = window.AvxReportRules.FIELDS;
const fval = (r, k) => {
  const f = RF.find(x => x.key === k);
  const v = r[k];
  if (v === null || v === undefined || v === '') return '<span class="na">Sin dato</span>';
  return `${fmt(Number(v), f.int ? 0 : (f.group === 'veg' ? 3 : 1))}${f.unit ? ' ' + f.unit : ''}`;
};

function renderReportes() {
  const el = $('#v-reportes');
  const f = st.repF;
  el.innerHTML = `<section class="card glass"><div class="toolbar">
    <label class="search">${icon('search')}<input class="input" data-f="repF.q" placeholder="Buscar por cliente o huerta…" value="${esc(f.q)}"></label>
    <select class="select" data-f="repF.user" aria-label="Cliente">${userOptions(f.user, 'Todos los clientes')}</select>
    <select class="select" data-f="repF.huerta" aria-label="Huerta">${huertaOptions(f.user, f.huerta, 'Todas las huertas', `<option value="none" ${f.huerta === 'none' ? 'selected' : ''}>Sin huerta asignada</option>`)}</select>
    <label class="f">Desde <input type="date" class="input" data-f="repF.from" value="${esc(f.from)}"></label>
    <label class="f">Hasta <input type="date" class="input" data-f="repF.to" value="${esc(f.to)}"></label>
    <button class="btn primary" data-act="genreport" data-email="${esc(f.user)}">${icon('plus')}Generar reporte</button>
  </div><div id="rep-body"></div></section>`;
  renderReportesBody();
}
function renderReportesBody() {
  const f = st.repF, q = lc(f.q);
  const from = f.from ? Date.parse(f.from + 'T00:00:00') : null, to = f.to ? Date.parse(f.to + 'T23:59:59') : null;
  const list = per(st.reportes).filter(r => (!f.user || r.email === f.user)
    && (f.huerta === 'none' ? !r.huerta_id : !f.huerta || r.huerta_id === f.huerta)
    && (!from || r.t >= from) && (!to || r.t <= to)
    && (!q || r.email.includes(q) || lc(huertaName(r.huerta_id) || 'sin huerta asignada').includes(q)));
  const page = pageOf(list, f, 25);
  $('#rep-body').innerHTML = list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Cliente</th><th>Huerta</th><th class="num">NDVI</th><th class="num">NDRE</th><th class="num">MSAVI</th><th class="num">RECI</th><th class="num">NDMI</th><th class="num">Lluvia</th><th class="num">T. máx / mín</th></tr></thead><tbody>
    ${page.rows.map(r => `<tr class="click" data-act="report" data-id="${esc(r.id)}"><td>${dfmt(r.t)}</td><td class="ell">${esc(r.email)}</td><td class="ell ${r.huerta_id ? '' : 'nohuerta'}">${esc(huertaName(r.huerta_id) || 'Sin huerta asignada')}</td>
      ${['ndvi', 'ndre', 'msavi', 'reci', 'ndmi'].map(k => `<td class="num">${r[k] === null || r[k] === undefined ? '—' : fmt(r[k], 3)}</td>`).join('')}
      <td class="num">${r.precipitacion === null || r.precipitacion === undefined ? '—' : fmt(r.precipitacion, 1) + ' mm'}</td><td class="num">${r.temp_max ?? '—'} / ${r.temp_min ?? '—'} °C</td></tr>`).join('')}
    </tbody></table></div>${pager(page, 'repF')}` : emptyBox('Sin reportes', st.reportes.length ? 'Ningún reporte coincide con los filtros o el periodo.' : 'Todavía no se ha generado ningún reporte.', 'file');
}

function openReport(id) {
  const r = st.reportes.find(x => String(x.id) === String(id));
  if (!r) return;
  const h = r.huerta_id ? st.huertaById.get(r.huerta_id) : null;
  drawer('Reporte satelital', `${h ? sat(h, 560) : ''}
    ${r.huerta_id ? '' : '<div class="callout warn">' + icon('info') + '<span>Reporte histórico <b>sin huerta asignada</b>: se creó antes de que el formulario pidiera la huerta. Se conserva tal cual.</span></div>'}
    <div class="kv"><div><small>Cliente</small><b style="font-size:13.5px;overflow-wrap:anywhere">${esc(r.email)}</b></div><div><small>Huerta</small><b class="${r.huerta_id ? '' : 'na'}">${esc(huertaName(r.huerta_id) || 'Sin huerta asignada')}</b></div>
      <div><small>Fecha</small><b>${dtfmt(r.t)}</b></div><div><small>ID</small><b style="font-size:11.5px;overflow-wrap:anywhere">${esc(r.id)}</b></div></div>
    <div class="sub-card"><h3>Índices de vegetación</h3><div class="kv">${RF.filter(f => f.group === 'veg').map(f => `<div><small>${f.label}</small><b>${fval(r, f.key)}</b></div>`).join('')}</div></div>
    <div class="sub-card"><h3>Clima</h3><div class="kv">${RF.filter(f => f.group === 'clima').map(f => `<div><small>${f.label}</small><b>${fval(r, f.key)}</b></div>`).join('')}</div></div>`);
}

// ───────── TOKENS ─────────
function renderTokens() {
  const el = $('#v-tokens');
  const f = st.tokF;
  const total = st.users.reduce((s, u) => s + S.visibleTokens(u.tokens), 0);
  const low = st.users.filter(S.lowBalance);
  const byPlan = ['pro', 'basic', 'free'].map(p => { const us = st.users.filter(u => u.plan === p); return { p, n: us.length, low: us.filter(S.lowBalance).length, tokens: us.reduce((s, u) => s + S.visibleTokens(u.tokens), 0) }; });
  el.innerHTML = `<div class="kpis">
      ${kpi('coins', 'Tokens en cuentas', fmtInt(total), { sub: 'Suma del saldo actual', tip: 'Saldo actual; no depende del periodo.' })}
      ${kpi('alert', 'Saldo bajo', fmtInt(low.length), { sub: 'Menos del 10 % de su plan mensual' })}
      ${kpi('users', 'Promedio por usuario', st.users.length ? fmtInt(total / st.users.length) : '—', { sub: `${fmtInt(st.users.length)} usuarios` })}
      ${kpi('crown', 'Usuarios de pago', fmtInt(byPlan[0].n + byPlan[1].n), { sub: `${fmtInt(byPlan[0].n)} Pro · ${fmtInt(byPlan[1].n)} Básico` })}
    </div>
    <div class="grid2">
      <section class="card glass"><h3>Usuarios por plan <small>saldo normal / bajo</small></h3>${st.users.length ? C.hbars(byPlan.map(b => ({ label: S.PLAN_LABEL[b.p], sub: `${fmtInt(S.PLAN_TOKENS[b.p])} tokens/mes`, value: b.n, display: fmtInt(b.n), segments: [{ label: 'Saldo normal', value: b.n - b.low, color: C.COLORS.sano }, { label: 'Saldo bajo', value: b.low, color: C.COLORS.revisar }] }))) : emptyBox('Sin usuarios', 'No hay cuentas registradas.', 'users')}</section>
      <section class="card glass"><h3>Tokens por plan</h3>${total ? C.hbars(byPlan.map((b, i) => ({ label: S.PLAN_LABEL[b.p], value: b.tokens, color: [C.COLORS.forest, C.COLORS.sano, C.COLORS.lime][i], display: fmtInt(b.tokens) }))) : emptyBox('Sin saldo', 'Ninguna cuenta tiene tokens.', 'coins')}
        <p class="note">La base guarda solo el saldo actual (users.tokens); no hay historial de movimientos, así que no se muestra consumo por fecha.</p></section>
    </div>
    <section class="card glass"><div class="toolbar">
      <label class="search">${icon('search')}<input class="input" data-f="tokF.q" placeholder="Buscar por correo…" value="${esc(f.q)}"></label>
      <select class="select" data-f="tokF.plan" aria-label="Plan"><option value="">Todos los planes</option>${['pro', 'basic', 'free'].map(p => `<option value="${p}" ${f.plan === p ? 'selected' : ''}>${S.PLAN_LABEL[p]}</option>`).join('')}</select>
      <button class="chip ${f.low ? 'on' : ''}" data-act="tokLow">Solo saldo bajo</button>
    </div><div id="tok-body"></div></section>`;
  renderTokensBody();
}
function renderTokensBody() {
  const f = st.tokF, q = lc(f.q);
  const list = st.users.filter(u => (!q || u.email.includes(q)) && (!f.plan || u.plan === f.plan) && (!f.low || S.lowBalance(u)))
    .sort((a, b) => S.visibleTokens(a.tokens) - S.visibleTokens(b.tokens));
  const page = pageOf(list, f, 25);
  $('#tok-body').innerHTML = list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Usuario</th><th>Plan</th><th class="num">Tokens visibles</th><th class="num">Valor en BD</th><th>Saldo vs plan mensual</th><th>Estado</th></tr></thead><tbody>
    ${page.rows.map(u => { const v = S.visibleTokens(u.tokens), cap = S.PLAN_TOKENS[u.plan], p = Math.min(100, (v / cap) * 100), low = S.lowBalance(u);
      return `<tr class="click" data-act="openUser" data-email="${esc(u.email)}"><td class="ell">${esc(u.email)}</td><td><span class="plan ${u.plan}">${S.PLAN_LABEL[u.plan]}</span></td><td class="num">${fmtInt(v)}</td><td class="num">${fmt(Number(u.tokens) || 0, 2)}</td>
      <td style="min-width:160px"><span class="health"><span class="bar"><i style="width:${p.toFixed(1)}%;${low ? 'background:linear-gradient(90deg,#f6c860,#e39b14)' : ''}"></i></span><span class="lbl"><span>${fmt(p, 0)} % de ${fmtInt(cap)}</span></span></span></td>
      <td>${low ? '<span class="pill revisar">Saldo bajo</span>' : '<span class="pill sano">Normal</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>${pager(page, 'tokF')}<p class="note">Solo lectura: los tokens se modifican desde la app (compras y consumo), no desde este panel.</p>` : emptyBox('Sin coincidencias', 'Ningún usuario coincide con los filtros.', 'coins');
}

// ───────── ANALÍTICAS ─────────
function renderAnaliticas() {
  const el = $('#v-analiticas');
  const cur = per(st.analyses);
  const g = st.evoG || S.granularity(st.period === 'all' ? 'all' : Number(st.period));
  const fd = st.period === 'all' ? st.firstDate : null;
  const ser = list => S.series(list, st.period, Date.now(), fd, g);
  const sAll = ser(cur.map(a => a.date));
  const labels = sAll.buckets.map(b => bucketLabel(b.start, g));
  const sF = ser(cur.filter(a => a.source === 'foto').map(a => a.date)), sR = ser(cur.filter(a => a.source === 'recorrido').map(a => a.date));
  const crops = S.byCrop(cur), dis = S.topDiseases(cur, 8);
  const actUsers = [...group(cur, a => a.email)].map(([e, l]) => ({ e, n: l.length, f: l.filter(a => a.source === 'foto').length })).sort((a, b) => b.n - a.n).slice(0, 10);
  const hueUsers = [...st.by.huertas].map(([e, l]) => ({ e, n: l.length, ha: l.reduce((s, h) => s + S.hectares(h.area_m2), 0) })).sort((a, b) => b.n - a.n).slice(0, 10);
  const reps = per(st.reportes), walks = per(st.recorridos);
  const sRep = ser(reps.map(r => r.t)), sWalk = ser(walks.map(w => w.t));
  const fotosAn = S.seriesSum(walks.map(w => ({ t: w.t, v: w.fotos_analizadas })), sAll.buckets);
  const byH = [...group(cur.filter(a => a.huerta && a.cat !== 'inconcluso'), a => a.huerta)].map(([id, l]) => { const d = S.distribution(l); return { id, n: d.evaluated, d }; }).sort((a, b) => b.n - a.n).slice(0, 10);
  const segG = `<span class="seg">${[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([k, t]) => `<button class="${g === k ? 'on' : ''}" data-act="evoG" data-g="${k}">${t}</button>`).join('')}</span>`;
  const none = (t = 'Sin datos en el periodo', s = 'Cambia el periodo para ver más historial.') => emptyBox(t, s);
  el.innerHTML = `<div class="analytics">
    <section class="card glass wide"><h3>1 · Evolución de análisis ${segG}</h3>${cur.length ? C.line([{ name: 'Total', color: C.COLORS.sano, values: sAll.buckets.map(b => b.n) }, { name: 'Fotos', color: C.COLORS.sky, values: sF.buckets.map(b => b.n) }, { name: 'Recorrido', color: '#7FC31C', values: sR.buckets.map(b => b.n) }], labels, { w: 1100, h: 260 }) : none()}</section>
    <section class="card glass"><h3>2 · Cultivos analizados <small>proporción de salud por cultivo</small></h3>${crops.length ? C.hbars(crops.map(c => ({ label: c.crop, value: c.n, display: `${fmtInt(c.n)} · ${fmt(c.pct, 0)} %`, segments: catSegs(c) }))) : none()}</section>
    <section class="card glass"><h3>3 · Enfermedades y problemas detectados</h3>${dis.length ? C.hbars(dis.map(d => ({ label: d.label, sub: d.crop, value: d.n, color: C.COLORS.problema, display: `${fmtInt(d.n)} · ${fmt(d.pct, 0)} %` }))) : none('Sin problemas detectados', 'No hay resultados con problema y confianza ≥ 60 %.')}</section>
    <section class="card glass"><h3>4 · Distribución de salud</h3>${healthDonut(cur)}</section>
    <section class="card glass"><h3>5 · Actividad por usuario <small>top 10</small></h3>${actUsers.length ? C.hbars(actUsers.map(u => ({ label: u.e, value: u.n, display: fmtInt(u.n), segments: [{ label: 'Fotos', value: u.f, color: C.COLORS.sky }, { label: 'Recorrido', value: u.n - u.f, color: '#7FC31C' }] }))) : none()}</section>
    <section class="card glass"><h3>6 · Huertas por usuario <small>total actual</small></h3>${hueUsers.length ? C.hbars(hueUsers.map(u => ({ label: u.e, sub: `${fmt(u.ha, 1)} ha`, value: u.n, color: C.COLORS.forest, display: fmtInt(u.n) }))) : none('Sin huertas', 'Aún no hay huertas registradas.')}</section>
    <section class="card glass"><h3>7 · Reportes por periodo</h3>${reps.length ? C.columns([{ name: 'Reportes', color: C.COLORS.forest, values: sRep.buckets.map(b => b.n) }], labels) : none()}</section>
    <section class="card glass"><h3>8 · Recorridos</h3>${walks.length ? C.columns([{ name: 'Recorridos', color: C.COLORS.lime, values: sWalk.buckets.map(b => b.n) }], labels) : none()}</section>
    <section class="card glass"><h3>9 · Fotos analizadas <small>individuales + en recorridos</small></h3>${cur.length || walks.length ? C.columns([{ name: 'Fotos individuales', color: C.COLORS.sky, values: sF.buckets.map(b => b.n) }, { name: 'Fotos analizadas en recorridos', color: C.COLORS.sano, values: fotosAn.map(b => b.n) }], labels) : none()}</section>
    <section class="card glass"><h3>10 · Hallazgos por huerta <small>proporción por estado, top 10</small></h3>${byH.length ? C.hbars(byH.map(x => ({ label: huertaName(x.id), sub: lc(st.huertaById.get(x.id)?.user_email || ''), value: x.n, display: fmtInt(x.n), segments: catSegs(x.d) })), { proportional: true }) : none('Sin análisis con huerta', 'Los análisis aún no tienen huerta asignada en este periodo.')}</section>
  </div>`;
}

// ───────── CONFIG ─────────
function renderConfig() {
  const m = D.getMode();
  $('#v-config').innerHTML = `<div class="grid2">
    <section class="card glass"><h3>Conexión</h3><div class="set-list">
      <div><b>Administrador:</b> ${esc(st.admin)}</div>
      <div><b>Modo:</b> ${m === 'api' ? 'Seguro — /api/admin verifica tu token de Firebase y consulta Supabase en el servidor.' : 'Directo — se consulta Supabase con la clave pública (anon). La seguridad depende de las políticas RLS.'}</div>
      <div><b>Datos cargados:</b> ${fmtInt(st.users.length)} usuarios · ${fmtInt(st.huertas.length)} huertas · ${fmtInt((st.data.scans || []).length)} fotos · ${fmtInt(st.recorridos.length)} recorridos · ${fmtInt((st.data.hallazgos || []).length)} hallazgos · ${fmtInt(st.reportes.length)} reportes</div>
      <div><button class="btn ghost sm" data-act="reload">${icon('refresh')}Recargar datos</button></div>
    </div></section>
    <section class="card glass"><h3>Reglas de cálculo</h3><div class="set-list">
      <div><b>Análisis</b> = fotos individuales (scans) + resultados de recorrido (hallazgos). Los recorridos son sesiones; no se suman como análisis.</div>
      <div><b>Saludable</b>: etiqueta saludable/sano/healthy/fresh con confianza ≥ 60 %. <b>Requiere revisión</b>: confianza &lt; 60 %. <b>Con problema</b>: otra etiqueta con confianza ≥ 60 %. <b>No concluyente</b>: «no es fruto».</div>
      <div><b>Tasa saludable</b> = saludables ÷ (saludables + con problema).</div>
      <div><b>Tendencias</b>: solo si el periodo anterior de igual duración tiene datos.</div>
      <div><b>Tokens</b>: saldo actual; se muestran como users.tokens × 100 (igual que la app).</div>
      <div><b>Viento</b>: se guarda en km/h, sin conversión.</div>
    </div></section>
    ${m === 'api' ? '' : `<section class="card glass" style="grid-column:1/-1"><h3>${icon('shield')} Activar el modo seguro</h3><div class="set-list">
      <div>En Vercel → Settings → Environment Variables agrega: <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> (secreta, solo servidor), <code>FIREBASE_WEB_API_KEY</code> y <code>ADMIN_EMAILS</code> (correos separados por coma). Después vuelve a desplegar.</div>
      <div>Ejecuta en Supabase <code>docs/sql/20261112_reportes_integridad.sql</code> para que la base rechace reportes con huertas de otro cliente.</div>
      <div>Mientras tanto, cualquiera con la clave anon puede leer y escribir estas tablas si RLS está desactivado.</div></div></section>`}
  </div>`;
}

// ───────── drawer / toast ─────────
function drawer(title, html) {
  $('#drawerTitle').innerHTML = title;
  $('#drawerBody').innerHTML = html;
  $('#drawer').classList.add('on');
  $('#scrim').classList.add('on');
  $('#drawer').setAttribute('aria-hidden', 'false');
  loadThumbs($('#drawerBody'));
  setTimeout(() => $('#drawerClose').focus(), 50);
}
function closeOverlays() {
  $('#drawer').classList.remove('on');
  $('#modal').classList.remove('on');
  $('#scrim').classList.remove('on');
  $('#drawer').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('nav-open');
}
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

function openScan(key) {
  const a = st.analyses.find(x => x.key === key);
  if (!a) return;
  const w = a.recorrido ? st.recorridos.find(r => r.id === a.recorrido) : null;
  drawer(a.source === 'foto' ? 'Foto individual' : 'Resultado de recorrido', `
    ${a.thumb ? `<img data-thumb="${esc(a.thumb)}" alt="Foto del hallazgo" style="width:100%;border-radius:16px;max-height:340px;object-fit:cover">` : `<div class="callout info">${icon('info')}<span>${a.source === 'foto' ? 'Las fotos individuales no se guardan en el servidor; solo su resultado.' : 'Este resultado no tiene miniatura guardada.'}</span></div>`}
    <div class="kv"><div><small>Resultado del modelo</small><b>${esc(S.labelName(a.label))}</b></div><div><small>Estado</small><b>${pill(a.cat)}</b></div>
      <div><small>Confianza</small><b>${a.conf === null ? '—' : fmt(a.conf * 100, 1) + ' %'}</b></div><div><small>Cultivo</small><b>${esc(a.crop)}</b></div>
      <div><small>Cliente</small><b style="font-size:13.5px;overflow-wrap:anywhere">${esc(a.email)}</b></div><div><small>Huerta</small><b class="${a.huerta ? '' : 'na'}">${esc(huertaName(a.huerta) || 'Sin huerta asignada')}</b></div>
      <div><small>Fecha</small><b>${dtfmt(a.date)}</b></div><div><small>Captura</small><b>${a.source === 'foto' ? 'Foto individual' : 'Recorrido'}</b></div></div>
    ${w ? `<div class="sub-card"><h3>Recorrido</h3><div class="kv"><div><small>Inicio</small><b>${dtfmt(w.t)}</b></div><div><small>Estado</small><b>${esc(w.estado || '—')}</b></div><div><small>Fotos tomadas / analizadas</small><b>${fmtInt(w.fotos_total)} / ${fmtInt(w.fotos_analizadas)}</b></div><div><small>Hallazgos</small><b>${fmtInt(w.hallazgos_total)}</b></div></div></div>` : ''}`);
}

// ───────── formulario «Generar reporte» ─────────
const rf = { step: 0, email: '', huerta: '', v: {}, errors: {}, saving: false, q: '' };
const STEPS = ['Cliente y huerta', 'Índices de vegetación', 'Clima', 'Vista previa'];
const HINTS = {
  ndvi: 'Vigor general. Huerta sana ≈ 0.6–0.9; suelo desnudo ≈ 0–0.2.',
  ndre: 'Clorofila en dosel denso. Típico 0.2–0.6.',
  msavi: 'Como NDVI, corrige el suelo visible. Típico 0.2–0.8.',
  reci: 'Clorofila (NIR/RedEdge − 1). Típico 0–10.',
  ndmi: 'Humedad de la hoja. Estrés hídrico < 0; buena humedad > 0.2.',
};

function openReportForm(email = '', huerta = '') {
  Object.assign(rf, { step: 0, email: lc(email), huerta: '', v: {}, errors: {}, saving: false, q: '', formError: '' });
  if (rf.email && huerta && (st.by.huertas.get(rf.email) || []).some(h => h.id === huerta)) rf.huerta = huerta;
  $('#modal').classList.add('on');
  $('#scrim').classList.add('on');
  renderForm();
}

function stepErrors(step) {
  // Se envía el correo EXACTO de public.users (el trigger de la base compara user_email sin normalizar).
  const orig = st.users.find(u => u.email === rf.email)?.user_email ?? rf.email;
  const v = window.AvxReportRules.validate({ ...rf.v, user_email: orig, huerta_id: rf.huerta });
  const keys = step === 0 ? ['user_email', 'huerta_id'] : step === 1 ? [...RF.filter(f => f.group === 'veg').map(f => f.key), 'veg'] : step === 2 ? RF.filter(f => f.group === 'clima').map(f => f.key) : Object.keys(v.errors);
  const e = {};
  for (const k of keys) if (v.errors[k]) e[k] = v.errors[k];
  if (step === 0 && rf.email && !st.users.some(u => u.email === rf.email)) e.user_email = 'El cliente no existe.';
  if (step === 0 && rf.huerta) {
    const h = st.huertaById.get(rf.huerta);
    if (!h || lc(h.user_email) !== rf.email) e.huerta_id = 'La huerta no pertenece a este cliente.';
  }
  return { e, v };
}

function field(f) {
  const err = rf.errors[f.key];
  return `<div class="field ${err ? 'bad' : ''}"><label for="rf-${f.key}">${f.label}</label>
    <div class="inwrap"><input id="rf-${f.key}" class="input" inputmode="decimal" autocomplete="off" data-rf="${f.key}" value="${esc(rf.v[f.key] ?? '')}" placeholder="Sin dato">${f.unit ? `<span class="unit">${f.unit}</span>` : ''}</div>
    <span class="help">${HINTS[f.key] ? HINTS[f.key] + ' ' : ''}Rango válido: ${f.min} a ${f.max}${f.unit ? ' ' + f.unit : ''}${f.int ? ' (entero)' : ''}. Vacío = no medido.</span>
    ${err ? `<span class="err">${esc(err)}</span>` : ''}</div>`;
}

function renderForm() {
  const s = rf.step;
  $('#modalSteps').innerHTML = STEPS.map((t, i) => `<span class="${i === s ? 'on' : i < s ? 'done' : ''}">${i + 1}. ${t}</span>`).join('');
  let b = '';
  if (D.getMode() !== 'api') b += `<div class="callout warn" style="margin-bottom:12px">${icon('alert')}<span><b>Modo directo:</b> la validación se hace aquí y, si ejecutaste el SQL de integridad, también en la base. Activa el modo seguro (Configuración) para validarlo en el servidor.</span></div>`;
  if (rf.formError) b += `<div class="callout err" style="margin-bottom:12px">${icon('alert')}<span>${esc(rf.formError)}</span></div>`;
  if (s === 0) {
    const q = lc(rf.q);
    const users = st.users.filter(u => !q || u.email.includes(q) || u.email === rf.email);
    const hs = rf.email ? (st.by.huertas.get(rf.email) || []) : [];
    const h = rf.huerta ? st.huertaById.get(rf.huerta) : null;
    b += `<div class="fgrid">
      <div class="field full"><label for="rf-q">Buscar cliente</label><input id="rf-q" class="input" data-rfq placeholder="Escribe parte del correo…" value="${esc(rf.q)}"></div>
      <div class="field ${rf.errors.user_email ? 'bad' : ''}"><label for="rf-user">Cliente <em>*</em></label><select id="rf-user" class="select" data-rfsel="email"><option value="">Selecciona un cliente…</option>${users.map(u => `<option value="${esc(u.email)}" ${rf.email === u.email ? 'selected' : ''}>${esc(u.email)}</option>`).join('')}</select>
        <span class="help">${fmtInt(users.length)} clientes${q ? ' coinciden' : ''}.</span>${rf.errors.user_email ? `<span class="err">${esc(rf.errors.user_email)}</span>` : ''}</div>
      <div class="field ${rf.errors.huerta_id ? 'bad' : ''}"><label for="rf-huerta">Huerta <em>*</em></label><select id="rf-huerta" class="select" data-rfsel="huerta" ${!rf.email || !hs.length ? 'disabled' : ''}><option value="">${!rf.email ? 'Primero elige un cliente' : hs.length ? 'Selecciona una huerta…' : 'Sin huertas registradas'}</option>${hs.map(x => `<option value="${esc(x.id)}" ${rf.huerta === x.id ? 'selected' : ''}>${esc(x.nombre || 'Huerta sin nombre')} · ${fmt(S.hectares(x.area_m2), 2)} ha</option>`).join('')}</select>
        ${rf.errors.huerta_id ? `<span class="err">${esc(rf.errors.huerta_id)}</span>` : ''}</div>
      ${rf.email && !hs.length ? `<div class="field full"><div class="callout warn">${icon('map')}<span>Este cliente no tiene huertas registradas. Debe dibujar su huerta en la app AVOTEX antes de recibir un reporte.</span></div></div>` : ''}
      ${h ? `<div class="field full"><div class="hrow" style="grid-template-columns:120px 1fr;cursor:default">${sat(h, 260)}<span><b>${esc(h.nombre || 'Huerta sin nombre')}</b><small>${fmt(S.hectares(h.area_m2), 2)} ha · registrada el ${dfmt(Date.parse(h.created_at))}</small></span></div></div>` : ''}
    </div>`;
  } else if (s === 1) {
    b += `<p class="note" style="margin:0 0 12px">Captura los índices disponibles (al menos uno). Deja vacío lo que no se midió: se guarda como «sin dato», no como 0.</p>
      <div class="fgrid">${RF.filter(f => f.group === 'veg').map(field).join('')}</div>${rf.errors.veg ? `<p class="err" style="color:#c23a25;margin-top:10px">${esc(rf.errors.veg)}</p>` : ''}`;
  } else if (s === 2) {
    b += `<p class="note" style="margin:0 0 12px">Todos opcionales. El viento se captura y se guarda en <b>km/h</b> (sin conversión).</p><div class="fgrid">${RF.filter(f => f.group === 'clima').map(field).join('')}</div>`;
  } else {
    const h = st.huertaById.get(rf.huerta);
    const row = stepErrors(3).v.row;
    b += `<div class="preview">${h ? sat(h, 560) : ''}
      <div class="kv"><div><small>Cliente</small><b style="font-size:13.5px;overflow-wrap:anywhere">${esc(rf.email)}</b></div><div><small>Huerta</small><b>${esc(h?.nombre || 'Huerta sin nombre')}</b></div></div>
      <div class="sub-card"><h3>Índices</h3><div class="kv">${RF.filter(f => f.group === 'veg').map(f => `<div><small>${f.label}</small><b>${fval(row, f.key)}</b></div>`).join('')}</div></div>
      <div class="sub-card"><h3>Clima</h3><div class="kv">${RF.filter(f => f.group === 'clima').map(f => `<div><small>${f.label}</small><b>${fval(row, f.key)}</b></div>`).join('')}</div></div>
      <p class="note">Se guardará en <b>public.reportes</b> con user_email y huerta_id. El identificador y la fecha los genera PostgreSQL.</p></div>`;
  }
  $('#modalBody').innerHTML = b;
  const hs = rf.email ? (st.by.huertas.get(rf.email) || []) : [];
  $('#modalFoot').innerHTML = `<button class="btn ghost" data-act="${s === 0 ? 'closeModal' : 'rfBack'}">${s === 0 ? 'Cancelar' : 'Atrás'}</button>
    ${s < 3 ? `<button class="btn dark" data-act="rfNext" ${s === 0 && (!rf.email || !hs.length) ? 'disabled' : ''}>Continuar</button>` : `<button class="btn primary" data-act="rfSave" ${rf.saving ? 'disabled' : ''}>${rf.saving ? 'Guardando…' : icon('check') + 'Guardar reporte'}</button>`}`;
}

async function saveReport() {
  const { e, v } = stepErrors(3);
  if (Object.keys(e).length) { rf.errors = e; rf.step = e.user_email || e.huerta_id ? 0 : RF.some(f => f.group === 'veg' && e[f.key]) || e.veg ? 1 : 2; renderForm(); return; }
  rf.saving = true; rf.formError = ''; renderForm();
  try {
    const rep = await D.createReport(st.getToken, v.row, st.huertas);
    st.data.reportes = [rep || { ...v.row, id: 'nuevo-' + Date.now(), created_at: new Date().toISOString() }, ...(st.data.reportes || [])];
    indexData(st.data);
    closeOverlays();
    toast('Reporte guardado');
    render();
  } catch (err) {
    rf.saving = false;
    const errs = err.details?.errors;
    if (errs) { rf.errors = errs; rf.step = errs.user_email || errs.huerta_id ? 0 : 1; rf.formError = 'Revisa los campos marcados.'; }
    else rf.formError = err.status === 403 ? 'Tu cuenta no tiene permiso de administrador.' : (err.details?.message || 'No se pudo guardar el reporte. Intenta de nuevo.');
    renderForm();
  }
}

// ───────── eventos ─────────
function setPath(path, value) {
  const [o, k] = path.split('.');
  st[o][k] = value;
  if ('page' in st[o] && k !== 'page') st[o].page = 0;
}
const BODY = { scansF: renderScansBody, repF: renderReportesBody, hueF: renderHuertasBody, tokF: renderTokensBody, usrF: renderUsuarios };

function bind() {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!e.target.closest('.menu')) document.querySelectorAll('.menu-pop.on').forEach(m => m.classList.remove('on'));
    if (!a) return;
    const d = a.dataset;
    switch (d.act) {
      case 'nav': setView(d.view); break;
      case 'user': st.sel = d.email; st.tab = st.tab || 'resumen'; document.querySelectorAll('.urow').forEach(r => r.classList.toggle('on', r.dataset.email === d.email)); $('#udetail').innerHTML = userDetail(); if (window.innerWidth <= 1240) $('#udetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'openUser': st.sel = d.email; st.tab = 'resumen'; setView('dashboard'); break;
      case 'tab': st.tab = d.tab; $('#udetail').innerHTML = userDetail(); break;
      case 'toggleFilters': st.showFilters = !st.showFilters; $('.filters-pop')?.classList.toggle('on', st.showFilters); break;
      case 'chip': st.uchips.has(d.k) ? st.uchips.delete(d.k) : st.uchips.add(d.k); st.usrF.page = 0; if (st.view === 'dashboard') renderDashboard(); else renderUsuarios(); break;
      case 'umenu': $('#umenu').classList.toggle('on'); break;
      case 'copy': navigator.clipboard?.writeText(d.text).then(() => toast('Correo copiado'), () => toast(d.text)); break;
      case 'goScans': Object.assign(st.scansF, { user: d.email, huerta: '', page: 0 }); setView('escaneos'); break;
      case 'goHuertas': Object.assign(st.hueF, { user: d.email, page: 0 }); setView('huertas'); break;
      case 'goReports': Object.assign(st.repF, { user: d.email, huerta: '', page: 0 }); setView('reportes'); break;
      case 'goTokens': Object.assign(st.tokF, { q: d.email, plan: '', low: false, page: 0 }); setView('tokens'); break;
      case 'huerta': openHuerta(d.id); break;
      case 'report': openReport(d.id); break;
      case 'scan': openScan(d.key); break;
      case 'genreport': closeOverlays(); openReportForm(d.email || '', d.huerta || ''); break;
      case 'closeModal': closeOverlays(); break;
      case 'rfBack': rf.step--; rf.errors = {}; rf.formError = ''; renderForm(); break;
      case 'rfNext': { const { e: errs } = stepErrors(rf.step); rf.errors = errs; rf.formError = ''; if (!Object.keys(errs).length) rf.step++; renderForm(); break; }
      case 'rfSave': saveReport(); break;
      case 'page': st[d.k].page += Number(d.d); BODY[d.k](); break;
      case 'clearScans': Object.assign(st.scansF, { q: '', user: '', huerta: '', crop: '', cat: '', src: '', from: '', to: '', page: 0 }); renderEscaneos(); break;
      case 'tokLow': st.tokF.low = !st.tokF.low; st.tokF.page = 0; a.classList.toggle('on', st.tokF.low); renderTokensBody(); break;
      case 'evoG': st.evoG = d.g; renderAnaliticas(); break;
      case 'reload': reload(); break;
      case 'closeDrawer': closeOverlays(); break;
      case 'menu': document.body.classList.toggle('nav-open'); break;
      case 'logout': window.avxLogout?.(); break;
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f === 'uq') { st.uq = t.value; $('#ulist').innerHTML = userRows(); return; }
    if (t.dataset.f && t.tagName === 'INPUT' && t.type !== 'date') { setPath(t.dataset.f, t.value); BODY[t.dataset.f.split('.')[0]]?.(); return; }
    if (t.dataset.rf) { rf.v[t.dataset.rf] = t.value; if (rf.errors[t.dataset.rf]) { delete rf.errors[t.dataset.rf]; t.closest('.field')?.classList.remove('bad'); t.closest('.field')?.querySelector('.err')?.remove(); } return; }
    if (t.hasAttribute('data-rfq')) { rf.q = t.value; const pos = t.selectionStart; renderForm(); const n = $('#rf-q'); n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'period') { st.period = t.value === 'all' ? 'all' : Number(t.value); st.evoG = null; Object.values({ a: st.scansF, b: st.repF, c: st.hueF, d: st.usrF }).forEach(f => f.page = 0); render(); return; }
    if (t.dataset.f && (t.tagName === 'SELECT' || t.type === 'date')) {
      setPath(t.dataset.f, t.value);
      const o = t.dataset.f.split('.')[0];
      if (t.dataset.f.endsWith('.user') && 'huerta' in st[o]) { st[o].huerta = ''; ({ scansF: renderEscaneos, repF: renderReportes })[o]?.(); }
      else BODY[o]?.();
      return;
    }
    if (t.dataset.rfsel === 'email') { rf.email = t.value; rf.huerta = ''; rf.errors = {}; renderForm(); return; } // cambiar cliente limpia la huerta
    if (t.dataset.rfsel === 'huerta') { rf.huerta = t.value; rf.errors = {}; renderForm(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlays(); });
  $('#scrim').addEventListener('click', closeOverlays);
  C.bindTooltips(document);
}

async function reload() {
  $('#boot').classList.remove('off');
  try { indexData(await D.loadSnapshot(st.getToken)); shell(); render(); toast('Datos actualizados'); }
  catch (e) { toast('No se pudieron recargar los datos'); }
  $('#boot').classList.add('off');
}

/** Punto de entrada (lo llama avotex-admin.html tras Firebase Auth). */
export async function start({ getToken, email, legacyAdmins = [], onDenied }) {
  st.getToken = getToken;
  st.admin = email;
  let data;
  try {
    data = await D.loadSnapshot(getToken);
  } catch (e) {
    if (e.status === 401 || e.status === 403) return onDenied('forbidden');
    $('#bootMsg').textContent = 'No se pudieron cargar los datos. Revisa tu conexión y recarga la página.';
    return;
  }
  // Modo directo (sin servidor): se mantiene el filtro de la versión anterior para no abrir el panel a cualquiera.
  if (D.getMode() === 'direct' && !legacyAdmins.includes(lc(email))) return onDenied('forbidden');
  indexData(data);
  if (D.getMode() === 'direct') $('#modeBanner').hidden = false;
  shell();
  bind();
  setView('dashboard');
  $('#boot').classList.add('off');
}

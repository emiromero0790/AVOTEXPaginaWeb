/**
 * AVOTEX Admin — gráficas SVG/HTML ligeras (sin dependencias). Devuelven cadenas HTML.
 * Interacción: cualquier elemento con data-tip muestra un tooltip (ver bindTooltips).
 * Las animaciones viven en admin.css y se desactivan con prefers-reduced-motion.
 */
export const COLORS = {
  sano: '#169447', sanoDark: '#0c5f2c',
  revisar: '#F2B632', revisarDark: '#b27f12',
  problema: '#E2513C', problemaDark: '#9c2d1d',
  lime: '#B6F342', forest: '#123D2A', mint: '#DDF8E5', sky: '#3B9AD9',
};
export const PALETTE = ['#169447', '#7FC31C', '#123D2A', '#3B9AD9', '#F2B632', '#8E6CCF', '#E2513C', '#2BB3A3', '#B0892F', '#5F7F6B'];

const nf = new Intl.NumberFormat('es-MX');
export const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtInt = n => nf.format(Math.round(Number(n) || 0));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let uid = 0;
const id = p => `${p}${++uid}`;

/** Estado vacío diseñado. */
export function empty(title, text, icon = 'chart') {
  return `<div class="empty"><div class="empty-ic" data-ic="${icon}"></div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
}

/**
 * Dona 2.5D (anillo inclinado con canto). segments: [{key,label,value,color,dark}]
 * Si el total es 0 devuelve el estado vacío.
 */
export function donut(segments, { center = '', sub = '', emptyText = 'Sin análisis registrados', size = 230 } = {}) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);
  if (!total) return `<div class="donut-empty"><svg viewBox="0 0 230 170" class="donut3d"><g transform="translate(115 78) scale(1 .62)"><circle r="78" fill="none" stroke="rgba(18,61,42,.10)" stroke-width="34"/></g></svg><div class="donut-center"><b>0</b><span>${esc(emptyText)}</span></div></div>`;
  const r = 78, C = 2 * Math.PI * r, depth = 14;
  let acc = 0;
  const arcs = segments.filter(s => s.value > 0).map(s => {
    const len = (s.value / total) * C;
    const a = { ...s, len, off: acc };
    acc += len;
    return a;
  });
  const ring = (fill, extra = '') => arcs.map(a => `<circle r="${r}" fill="none" stroke="${fill(a)}" stroke-width="34" stroke-dasharray="${Math.max(0, a.len - (arcs.length > 1 ? 1.2 : 0)).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-a.off).toFixed(2)}" transform="rotate(-90)" ${extra(a)}/>`).join('');
  let edge = '';
  for (let i = depth; i >= 1; i -= 2) edge += `<g transform="translate(0 ${(i / 0.62).toFixed(2)})">${ring(a => a.dark, () => '')}</g>`;
  const gid = id('dg');
  const top = ring(a => a.color, a => `class="arc" data-tip="${esc(a.label)}: ${fmtInt(a.value)} (${fmt((a.value / total) * 100, 1)} %)"`);
  return `<div class="donut-wrap" style="max-width:${size}px">
    <svg viewBox="0 0 230 175" class="donut3d" role="img" aria-label="${esc(segments.map(s => `${s.label} ${s.value}`).join(', '))}">
      <defs><radialGradient id="${gid}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="115" cy="${78 + 62}" rx="96" ry="14" fill="rgba(18,61,42,.18)" style="filter:blur(6px)"/>
      <g transform="translate(115 78) scale(1 .62)">${edge}${top}<circle r="${r}" fill="none" stroke="url(#${gid})" stroke-width="34" pointer-events="none"/></g>
    </svg>
    <div class="donut-center"><b>${esc(center)}</b><span>${esc(sub)}</span></div>
  </div>`;
}

/** Leyenda con porcentaje. */
export function legend(items) {
  return `<ul class="legend">${items.map(i => `<li data-tip="${esc(i.tip || '')}"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${esc(i.value)}</b></li>`).join('')}</ul>`;
}

/** Interpolación suave (Catmull-Rom → Bézier) sin pasar por debajo de 0. */
function smooth(pts, floorY) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(floorY, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(floorY, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/**
 * Línea/área suave. series: [{name, color, values:[]}], labels: [] (mismo largo).
 */
export function line(series, labels, { w = 640, h = 230, unit = '' } = {}) {
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  const L = 38, R = 12, T = 14, B = 28;
  const x = i => L + (n <= 1 ? (w - L - R) / 2 : (i * (w - L - R)) / (n - 1));
  const y = v => T + (h - T - B) * (1 - v / max);
  const ticks = [0, .25, .5, .75, 1].map(f => max * f);
  const every = Math.max(1, Math.ceil(n / 7));
  const gid = id('lg');
  let out = `<svg viewBox="0 0 ${w} ${h}" class="linechart" preserveAspectRatio="xMidYMid meet">
    <defs>${series.map((s, k) => `<linearGradient id="${gid}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${k ? .12 : .32}"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
  out += ticks.map(t => `<g><line x1="${L}" x2="${w - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${fmt(t, t % 1 ? 1 : 0)}</text></g>`).join('');
  out += labels.map((l, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every / 2) ? `<text x="${x(i)}" y="${h - 8}" class="ax" text-anchor="middle">${esc(l)}</text>` : '').join('');
  series.forEach((s, k) => {
    const pts = s.values.map((v, i) => [x(i), y(v)]);
    const d = smooth(pts, y(0));
    if (!d) return;
    out += `<path d="${d} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#${gid}${k})" class="area"/>`;
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${k ? 2.2 : 3}" stroke-linecap="round" class="stroke" pathLength="1"/>`;
    if (n <= 40) out += pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#fff" stroke="${s.color}" stroke-width="2" class="dot"/>`).join('');
  });
  // zonas de hover por columna
  const bw = n > 1 ? (w - L - R) / (n - 1) : w - L - R;
  out += labels.map((l, i) => `<rect x="${x(i) - bw / 2}" y="${T}" width="${bw}" height="${h - T - B}" fill="transparent" data-tip="${esc(l)} · ${esc(series.map(s => `${s.name}: ${fmtInt(s.values[i])}${unit}`).join(' · '))}"/>`).join('');
  return out + '</svg>';
}

/**
 * Columnas (apiladas o simples). stacks: [{name,color,values:[]}], labels: [].
 */
export function columns(stacks, labels, { w = 640, h = 220 } = {}) {
  const n = labels.length;
  const totals = labels.map((_, i) => stacks.reduce((s, st) => s + (st.values[i] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const L = 38, R = 8, T = 12, B = 28;
  const slot = (w - L - R) / Math.max(1, n);
  const bw = Math.max(3, Math.min(34, slot * 0.62));
  const y = v => T + (h - T - B) * (1 - v / max);
  const every = Math.max(1, Math.ceil(n / 8));
  let out = `<svg viewBox="0 0 ${w} ${h}" class="colchart" preserveAspectRatio="xMidYMid meet">`;
  out += [0, .5, 1].map(f => `<line x1="${L}" x2="${w - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="grid"/><text x="${L - 8}" y="${y(max * f) + 4}" class="ax" text-anchor="end">${fmt(max * f, (max * f) % 1 ? 1 : 0)}</text>`).join('');
  labels.forEach((l, i) => {
    const cx = L + slot * i + slot / 2;
    let base = 0;
    const tip = `${l} · ${stacks.map(s => `${s.name}: ${fmtInt(s.values[i] || 0)}`).join(' · ')}`;
    stacks.forEach((s, k) => {
      const v = s.values[i] || 0;
      if (!v) return;
      const y1 = y(base + v), y0 = y(base);
      const top = k === stacks.length - 1 || stacks.slice(k + 1).every(t => !(t.values[i] || 0));
      out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" rx="${top ? Math.min(6, bw / 2) : 0}" fill="${s.color}" class="col" style="animation-delay:${Math.min(i * 12, 300)}ms"/>`;
      base += v;
    });
    out += `<rect x="${cx - slot / 2}" y="${T}" width="${slot}" height="${h - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
    if (i % every === 0) out += `<text x="${cx}" y="${h - 8}" class="ax" text-anchor="middle">${esc(l)}</text>`;
  });
  return out + '</svg>';
}

/**
 * Barras horizontales HTML. items: [{label, sub, value, display, color, segments:[{value,color,label}]}]
 * Con segments se dibuja la proporción (apilada al 100 % del valor del renglón).
 */
export function hbars(items, { max = null, proportional = false } = {}) {
  const m = max ?? Math.max(1, ...items.map(i => i.value || 0));
  return `<div class="hbars">${items.map((it, k) => {
    const w = proportional ? 100 : ((it.value || 0) / m) * 100;
    const segs = it.segments && it.segments.length
      ? it.segments.filter(s => s.value > 0).map(s => `<i style="flex:${s.value};background:${s.color}" data-tip="${esc(it.label)} · ${esc(s.label)}: ${fmtInt(s.value)} (${fmt((s.value / (it.value || 1)) * 100, 1)} %)"></i>`).join('')
      : `<i style="flex:1;background:${it.color || PALETTE[k % PALETTE.length]}" data-tip="${esc(it.tip || `${it.label}: ${it.display ?? fmtInt(it.value)}`)}"></i>`;
    return `<div class="hbar"><div class="hbar-l"><span title="${esc(it.label)}">${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
      <div class="hbar-t"><div class="hbar-f" style="width:${Math.max(w, it.value ? 2 : 0).toFixed(2)}%;animation-delay:${k * 40}ms">${segs}</div></div>
      <b class="hbar-v">${esc(it.display ?? fmtInt(it.value))}</b></div>`;
  }).join('')}</div>`;
}

/** Medidor semicircular 0–100. */
export function gauge(value, { label = '', color = COLORS.sano } = {}) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const r = 70, C = Math.PI * r;
  return `<svg viewBox="0 0 180 104" class="gauge"><path d="M20,92 A70,70 0 0 1 160,92" fill="none" stroke="rgba(18,61,42,.1)" stroke-width="16" stroke-linecap="round"/>
    <path d="M20,92 A70,70 0 0 1 160,92" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(C * v / 100).toFixed(1)} ${C.toFixed(1)}" class="gauge-v"/>
    <text x="90" y="80" text-anchor="middle" class="gauge-t">${value === null ? '—' : fmt(value, 1) + ' %'}</text><text x="90" y="99" text-anchor="middle" class="ax">${esc(label)}</text></svg>`;
}

/** Tooltip único para todo el documento. */
export function bindTooltips(root = document) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let cur = null;
  root.addEventListener('pointermove', e => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || !el.dataset.tip) { if (cur) { tip.classList.remove('on'); cur = null; } return; }
    if (el !== cur) { tip.textContent = el.dataset.tip; cur = el; }
    tip.classList.add('on');
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
    const y = e.clientY - tip.offsetHeight - 12 < 4 ? e.clientY + 18 : e.clientY - tip.offsetHeight - 12;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  });
  root.addEventListener('pointerleave', () => tip.classList.remove('on'));
}

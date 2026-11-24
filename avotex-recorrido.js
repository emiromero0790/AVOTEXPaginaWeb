/*
 * AVOTEX — tarjetas flotantes del recorrido (Street View) y paginación sin desplazamiento.
 *
 * - Las cuatro tarjetas (Resumen, Mi huerta, Reportes satelitales, Análisis IA) muestran datos
 *   desde que se entra: no hace falta abrir un menú. Cada una lleva a su detalle (los paneles
 *   .fpanel de siempre, con su contenido y sus IDs).
 * - Cero barras de desplazamiento dentro de los paneles: las listas largas (historial de
 *   escaneos, reportes, huertas, indicadores) se reparten en páginas calculadas con el alto
 *   real disponible, con «Anterior», «Siguiente» y un indicador como «1–5 de 33».
 * - Tarjetas secundarias (Diagnósticos, Escaneos recientes) aparecen solo si caben completas.
 * - Todo lo que se muestra viene de los datos reales de la sesión (Supabase) o de la huerta
 *   seleccionada. La miniatura de Mi huerta dibuja el polígono registrado sobre imagen Esri.
 *
 * admin.html llama a setData() después de cargar escaneos y reportes; las huertas llegan por el
 * evento avotex:huertas y la huerta activa la indica avotex-inmersiva.js con setActiveHuerta().
 */
(function (root) {
    'use strict';

    // ───────── paginación por altura (función pura: se prueba en Node) ─────────

    /*
     * Reparte elementos de alturas distintas en páginas que caben en `avail` px.
     * Devuelve [[inicio, fin), …]. Un elemento más alto que la página ocupa una página propia.
     */
    function paginateHeights(heights, avail, gap) {
        gap = gap || 0;
        var pages = [];
        var start = 0, used = 0;
        for (var i = 0; i < heights.length; i++) {
            var h = Math.max(0, heights[i]);
            var need = (i === start ? 0 : gap) + h;
            if (i > start && used + need > avail + 0.5) {
                pages.push([start, i]);
                start = i;
                used = h;
            } else {
                used += need;
            }
        }
        if (heights.length) pages.push([start, heights.length]);
        return pages;
    }

    function pageLabel(page, total, single) {
        if (!total) return 'Sin registros';
        if (single || page[1] - page[0] === 1) return (page[0] + 1) + ' de ' + total;
        return (page[0] + 1) + '–' + page[1] + ' de ' + total;
    }

    if (typeof document === 'undefined') {
        if (typeof module !== 'undefined' && module.exports) module.exports = { paginateHeights: paginateHeights, pageLabel: pageLabel };
        return;
    }

    // ───────── utilidades ─────────

    function $(id) { return document.getElementById(id); }
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function num(n, d) { return Number(n).toLocaleString('es-MX', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d && d > 0 ? Math.min(d, 1) : 0 }); }
    function fmtDate(iso, withTime) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        var o = { year: 'numeric', month: 'short', day: 'numeric' };
        if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
        return d.toLocaleDateString('es-MX', o);
    }
    function fmtShort(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    }
    function period(scans) {
        if (!scans.length) return '';
        var t = scans.map(function (s) { return new Date(s.created_at).getTime(); }).filter(isFinite);
        if (!t.length) return '';
        var a = new Date(Math.min.apply(null, t)), b = new Date(Math.max.apply(null, t));
        var sameYear = a.getFullYear() === b.getFullYear();
        var left = a.toLocaleDateString('es-MX', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
        var right = b.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
        return left === right ? right : left + ' – ' + right;
    }

    // Diagnósticos: color + texto siempre (el estado nunca depende solo del color).
    var STATE = {
        'Saludable': { cls: 'is-ok', color: '#7fd66b' },
        'Costra': { cls: 'is-warn', color: '#f2b450' },
        'Antracnosis': { cls: 'is-bad', color: '#f2766b' },
        'Mancha Grasienta': { cls: 'is-alt', color: '#b49cf0' }
    };
    function stateOf(label) { return STATE[label] || { cls: 'is-neutral', color: '#a9b8b0' }; }
    function stateBadge(label) {
        var st = stateOf(label);
        return '<span class="xstate ' + st.cls + '"><i aria-hidden="true"></i>' + esc(label || 'Sin diagnóstico') + '</span>';
    }

    var D = {
        status: 'loading',   // loading | ready | error | unauthorized
        scans: [], filtered: [], reports: [], fruit: null, retry: null,
        huertasStatus: 'loading', huertas: [], active: null
    };
    var pagers = {};

    // ───────── paginador para un contenedor ─────────

    /*
     * opts.viewport  contenedor con alto limitado (flex: 1; overflow: hidden)
     * opts.items     () → elementos a paginar
     * opts.footer    elemento .xpager donde van los controles
     * opts.reserve   () → px ocupados dentro del viewport que no son elementos (encabezado de tabla)
     * opts.fill      una página = un elemento que ocupa todo el alto (mapas de Mi Huerta)
     * opts.noun      texto para lectores de pantalla («escaneos», «reportes»…)
     */
    function createPager(name, opts) {
        var p = { page: 0, pages: [], total: 0, opts: opts };
        var footer = opts.footer;
        footer.innerHTML =
            '<button type="button" class="xpager-btn" data-pg="prev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>Anterior</button>' +
            '<span class="xpager-label" aria-live="polite"></span>' +
            '<button type="button" class="xpager-btn" data-pg="next">Siguiente<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></button>';
        footer.setAttribute('role', 'group');
        footer.setAttribute('aria-label', 'Páginas de ' + (opts.noun || 'registros'));
        footer.addEventListener('click', function (e) {
            var b = e.target.closest('[data-pg]');
            if (!b || b.disabled) return;
            go(p.page + (b.dataset.pg === 'next' ? 1 : -1), true);
        });

        function items() { return Array.prototype.slice.call(opts.items() || []); }

        function visible(el) { return !!(el && el.offsetParent !== null); }

        function update(o) {
            o = o || {};
            var vp = opts.viewport();
            var list = items();
            p.total = list.length;
            if (!vp || !visible(vp)) { p.dirty = true; return; }
            p.dirty = false;
            watch(vp);
            var firstShown = (!o.reset && p.pages[p.page]) ? p.pages[p.page][0] : 0;
            // Se miden todos los elementos visibles; luego se ocultan los que no van en la página.
            list.forEach(function (el) { el.hidden = false; el.classList.remove('pg-out'); });
            footer.hidden = false;
            var reserve = opts.reserve ? opts.reserve() : 0;
            var avail = vp.clientHeight - reserve - 4; // margen: bordes colapsados y redondeo de subpíxeles
            if (opts.fill) {
                p.pages = list.map(function (_, i) { return [i, i + 1]; });
            } else {
                var gap = parseFloat(getComputedStyle(vp).rowGap) || 0;
                if (opts.rowGap != null) gap = opts.rowGap;
                var heights = list.map(function (el) { return el.getBoundingClientRect().height; });
                p.pages = paginateHeights(heights, avail, gap);
            }
            p.page = 0;
            for (var i = 0; i < p.pages.length; i++) if (firstShown >= p.pages[i][0] && firstShown < p.pages[i][1]) { p.page = i; break; }
            apply(list);
            verifyLater(vp);
        }

        // Algunos elementos (gráficas, mapas) cambian de alto un instante después de mostrarse.
        // Si la página visible ya no cabe, se vuelve a paginar con las medidas reales.
        var retries = 0, verifyTimer = null;
        function verifyLater(vp) {
            clearTimeout(verifyTimer);
            verifyTimer = setTimeout(function () {
                if (!visible(vp)) return;
                if (vp.scrollHeight > vp.clientHeight + 1 && retries < 3) { retries++; update(); }
                else retries = 0;
            }, 320);
        }

        // Si el alto del visor cambia después (fuentes, gráficas, filtros que ocupan otra
        // línea), las páginas se recalculan: ninguna fila queda cortada.
        var ro = null, watched = null, lastH = 0, roPending = false;
        function watch(vp) {
            if (watched === vp || typeof root.ResizeObserver !== 'function') return;
            if (ro) ro.disconnect();
            watched = vp;
            lastH = vp.clientHeight;
            ro = new root.ResizeObserver(function () {
                if (!watched || Math.abs(watched.clientHeight - lastH) < 1 || roPending) return;
                roPending = true;
                requestAnimationFrame(function () {
                    roPending = false;
                    if (!watched) return;
                    lastH = watched.clientHeight;
                    update();
                });
            });
            ro.observe(vp);
        }

        function apply(list) {
            list = list || items();
            var pg = p.pages[p.page] || [0, 0];
            list.forEach(function (el, i) {
                var on = i >= pg[0] && i < pg[1];
                el.classList.toggle('pg-out', !on);
            });
            var single = p.pages.length <= 1;
            footer.classList.toggle('is-single', single);
            footer.hidden = p.total === 0;
            footer.querySelector('[data-pg="prev"]').disabled = p.page <= 0;
            footer.querySelector('[data-pg="next"]').disabled = p.page >= p.pages.length - 1;
            footer.querySelector('.xpager-label').textContent = pageLabel(pg, p.total, opts.fill);
            if (opts.onPage) opts.onPage(pg, list);
        }

        function go(i, user) {
            if (i < 0 || i >= p.pages.length) return;
            p.page = i;
            apply();
            if (user) {
                // El foco se queda en el botón; si se deshabilitó, pasa al otro.
                var active = document.activeElement;
                if (active && active.disabled) {
                    var other = footer.querySelector('[data-pg]:not(:disabled)');
                    if (other) other.focus({ preventScroll: true });
                }
            }
        }

        p.update = update;
        p.go = go;
        pagers[name] = p;
        return p;
    }

    function setupPagers() {
        if (pagers.recientes) return;
        var footerOf = function (n) { return document.querySelector('.xpager[data-pager="' + n + '"]'); };
        createPager('recientes', {
            footer: footerOf('recientes'),
            viewport: function () { return document.querySelector('#xcRecientesBody .scan-list'); },
            items: function () { return document.querySelectorAll('#xcRecientesBody .scan-row'); },
            noun: 'escaneos recientes'
        });
        createPager('analisis', {
            footer: footerOf('analisis'),
            viewport: function () { return $('historyViewport'); },
            items: function () { return document.querySelectorAll('#historyViewport tbody tr'); },
            reserve: function () { var th = document.querySelector('#historyViewport thead'); return th ? th.getBoundingClientRect().height : 0; },
            rowGap: 0,
            noun: 'escaneos'
        });
        createPager('reportes', {
            footer: footerOf('reportes'),
            viewport: function () { return $('reportsArea'); },
            items: function () { return document.querySelectorAll('#reportsArea > .report-card'); },
            noun: 'reportes'
        });
        createPager('huerta', {
            footer: footerOf('huerta'),
            viewport: function () { return $('huertaList'); },
            items: function () { return document.querySelectorAll('#huertaList > .huerta-card'); },
            fill: true,
            noun: 'huertas',
            onPage: function () { if (typeof root.refreshHuertaMaps === 'function') root.refreshHuertaMaps(); }
        });
        createPager('resumen', {
            footer: footerOf('resumen'),
            viewport: function () { return $('resumenPages'); },
            items: function () { return document.querySelectorAll('#resumenPages > *'); },
            noun: 'indicadores'
        });
    }

    function refreshPager(name, opts) {
        var p = pagers[name];
        if (p) p.update(opts);
    }
    function refreshVisiblePagers(opts) {
        Object.keys(pagers).forEach(function (n) { refreshPager(n, opts); });
    }

    // ───────── tarjetas ─────────

    function stateMessage(kind, retry) {
        if (kind === 'unauthorized') {
            return '<div class="xempty is-error"><strong>Acceso no autorizado</strong><span>Vuelve a iniciar sesión o contacta a AVOTEX.</span></div>';
        }
        return '<div class="xempty is-error"><strong>No se pudieron cargar tus datos</strong><span>Revisa tu conexión e intenta de nuevo.</span>' +
            (retry ? '<button type="button" class="xbtn-ghost" data-xretry>Reintentar</button>' : '') + '</div>';
    }

    function setTag(id, text) { var el = $(id); if (el) { el.textContent = text || ''; el.hidden = !text; } }

    function fruitTag() { return D.fruit ? 'Filtro: ' + D.fruit : ''; }

    function renderResumen() {
        var body = $('xcResumenBody');
        if (!body) return;
        var h = D.active;
        var area = h && Number(h.area_m2) > 0 ? Number(h.area_m2) : null;
        var areaHtml = area
            ? '<b>' + num(area / 10000, 2) + '</b><small>ha</small>'
            : '<b>—</b>';
        var areaSub = area ? num(area) + ' m² · ' + esc((h.nombre || 'Huerta').trim()) : (h ? 'Sin superficie registrada' : 'Sin huerta seleccionada');

        var dataBlock;
        if (D.status === 'loading') {
            dataBlock = '<div class="xmetric"><span>Análisis IA</span><div class="xskel xskel-sm"></div></div>' +
                '<div class="xmetric"><span>Salud</span><div class="xskel xskel-sm"></div></div>' +
                '<div class="xmetric"><span>Reportes satelitales</span><div class="xskel xskel-sm"></div></div>';
        } else if (D.status !== 'ready') {
            dataBlock = '<div class="xmetric xmetric-wide">' + stateMessage(D.status, D.retry) + '</div>';
        } else {
            var sc = D.filtered;
            var salu = sc.filter(function (s) { return s.label === 'Saludable'; }).length;
            var pct = sc.length ? Math.round(salu / sc.length * 100) : null;
            var last = D.reports[0];
            dataBlock =
                '<div class="xmetric"><span>Análisis IA</span><p><b>' + num(sc.length) + '</b><small>escaneos</small></p><em>' + (period(sc) || 'Sin escaneos todavía') + '</em></div>' +
                '<div class="xmetric"><span>Salud</span><p><b>' + (pct == null ? '—' : pct) + '</b><small>' + (pct == null ? '' : '% saludable') + '</small></p><em>' + (sc.length ? salu + ' de ' + sc.length + ' frutos' : 'Sin análisis') + '</em></div>' +
                '<div class="xmetric"><span>Reportes satelitales</span><p><b>' + num(D.reports.length) + '</b><small>' + (D.reports.length === 1 ? 'reporte' : 'reportes') + '</small></p><em>' + (last ? 'Último: ' + fmtDate(last.created_at) : 'Sin reportes') + '</em></div>';
        }
        body.innerHTML =
            '<div class="xmetrics">' +
            '<div class="xmetric"><span>Superficie</span><p>' + areaHtml + '</p><em>' + areaSub + '</em></div>' +
            dataBlock +
            '</div>' +
            '<p class="xnote">Escaneos y reportes de toda tu cuenta; aún no se registran por huerta.</p>';
        setTag('xcResumenTag', fruitTag());
    }

    // Miniatura: imagen Esri (Web Mercator) del encuadre de la huerta + su polígono real encima.
    var R = 6378137;
    function merc(lat, lng) {
        var x = R * lng * Math.PI / 180;
        var y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
        return [x, y];
    }
    function huertaThumb(h, w, hh) {
        var coords = root.AvotexScreenX && root.AvotexScreenX.parseCoords ? root.AvotexScreenX.parseCoords(h.coordinates) : [];
        if (!coords || coords.length < 3) {
            return '<div class="xthumb is-empty"><span>' + (coords && coords.length ? 'Contorno incompleto: ' + coords.length + ' vértices registrados' : 'El equipo AVOTEX aún no delimita el contorno de esta huerta.') + '</span></div>';
        }
        var pts = coords.map(function (c) { return merc(c[0], c[1]); });
        var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
        var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var spanX = Math.max(maxX - minX, 60) * 1.35, spanY = Math.max(maxY - minY, 60) * 1.35;
        var aspect = w / hh;
        if (spanX / spanY < aspect) spanX = spanY * aspect; else spanY = spanX / aspect;
        var bx0 = cx - spanX / 2, bx1 = cx + spanX / 2, by0 = cy - spanY / 2, by1 = cy + spanY / 2;
        var px = function (p) { return [((p[0] - bx0) / spanX * w).toFixed(1), ((by1 - p[1]) / spanY * hh).toFixed(1)]; };
        var poly = pts.map(function (p) { return px(p).join(','); }).join(' ');
        var dots = pts.map(function (p) { var q = px(p); return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="2.6"/>'; }).join('');
        var src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=' +
            [bx0, by0, bx1, by1].map(function (v) { return v.toFixed(2); }).join(',') +
            '&bboxSR=3857&imageSR=3857&size=' + (w * 2) + ',' + (hh * 2) + '&format=jpg&f=image';
        return '<figure class="xthumb">' +
            '<img src="' + src + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' +
            '<svg viewBox="0 0 ' + w + ' ' + hh + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Contorno registrado de ' + esc((h.nombre || 'la huerta').trim()) + ' (' + coords.length + ' vértices)">' +
            '<polygon points="' + poly + '"/>' + dots + '</svg>' +
            '<figcaption>Imágenes © Esri · contorno registrado</figcaption>' +
            '</figure>';
    }

    function renderHuerta() {
        var body = $('xcHuertaBody');
        if (!body) return;
        var st = D.huertasStatus;
        if (st === 'loading') { body.innerHTML = '<div class="xskel xskel-tall"></div>'; setTag('xcHuertaTag', ''); return; }
        if (st === 'empty') { body.innerHTML = '<div class="xempty"><strong>Sin huertas delimitadas</strong><span>Cuando el equipo AVOTEX registre una, aparecerá aquí.</span></div>'; setTag('xcHuertaTag', ''); return; }
        if (st !== 'ready') { body.innerHTML = stateMessage(st === 'unauthorized' ? 'unauthorized' : 'error', null); setTag('xcHuertaTag', ''); return; }
        var h = D.active || D.huertas[0];
        if (!h) { body.innerHTML = ''; return; }
        var area = Number(h.area_m2) > 0 ? num(Number(h.area_m2) / 10000, 2) + ' ha' : 'Superficie sin registrar';
        var coords = root.AvotexScreenX && root.AvotexScreenX.parseCoords ? root.AvotexScreenX.parseCoords(h.coordinates) : [];
        body.innerHTML =
            '<div class="xhuerta-head"><strong>' + esc((h.nombre || 'Huerta sin nombre').trim()) + '</strong>' +
            '<span>' + area + (coords.length >= 3 ? ' · ' + coords.length + ' vértices' : '') + '</span></div>' +
            huertaThumb(h, 400, 190);
        setTag('xcHuertaTag', D.huertas.length > 1 ? D.huertas.length + ' huertas' : '');
    }

    function distribution(scans) {
        var counts = {};
        scans.forEach(function (s) { var l = s.label || 'Sin diagnóstico'; counts[l] = (counts[l] || 0) + 1; });
        return Object.keys(counts).map(function (l) { return { label: l, n: counts[l] }; })
            .sort(function (a, b) { return b.n - a.n; });
    }

    function renderDiagnosticos() {
        var body = $('xcDiagBody');
        if (!body) return;
        if (D.status !== 'ready') { body.innerHTML = D.status === 'loading' ? '<div class="xskel"></div>' : stateMessage(D.status, D.retry); return; }
        var sc = D.filtered;
        if (!sc.length) { body.innerHTML = '<div class="xempty"><strong>Sin diagnósticos</strong><span>Aún no hay escaneos para este filtro.</span></div>'; return; }
        var rows = distribution(sc).slice(0, 4).map(function (r) {
            var pct = Math.round(r.n / sc.length * 100);
            return '<li><span class="xbar-name">' + stateBadge(r.label) + '</span><span class="xbar-track"><i style="width:' + pct + '%;background:' + stateOf(r.label).color + '"></i></span><span class="xbar-val">' + r.n + ' · ' + pct + '%</span></li>';
        }).join('');
        body.innerHTML = '<ul class="xbars">' + rows + '</ul>';
        setTag('xcDiagTag', fruitTag());
    }

    // NDVI: referencia general del índice (no es un diagnóstico de la huerta).
    function ndviClass(v) {
        if (v < 0.2) return 'Suelo o vegetación escasa';
        if (v < 0.5) return 'Vegetación moderada';
        return 'Vegetación densa';
    }

    function renderReportes() {
        var body = $('xcReportesBody');
        if (!body) return;
        var action = document.querySelector('.xcard[data-module="reportes"] .xcard-action');
        if (D.status !== 'ready') {
            body.innerHTML = D.status === 'loading' ? '<div class="xskel"></div>' : stateMessage(D.status, D.retry);
            setTag('xcReportesTag', '');
            return;
        }
        if (!D.reports.length) {
            body.innerHTML = '<div class="xempty"><strong>Aún no tienes reportes</strong><span>Cuando tu asesor AVOTEX genere un reporte satelital, aparecerá aquí.</span></div>';
            setTag('xcReportesTag', '');
            if (action) action.firstChild.textContent = 'Ver reportes';
            return;
        }
        var r = D.reports[0];
        var ndvi = r.ndvi != null && isFinite(parseFloat(r.ndvi)) ? parseFloat(r.ndvi) : null;
        var pos = ndvi == null ? null : Math.max(0, Math.min(1, ndvi)) * 100;
        var chip = function (name, v, unit, d) {
            var ok = v != null && isFinite(parseFloat(v));
            return '<div class="xchip"><span>' + name + '</span><b>' + (ok ? parseFloat(v).toFixed(d) + (unit || '') : 'N/D') + '</b></div>';
        };
        body.innerHTML =
            '<div class="xreport-top"><span class="xreport-date">Reporte #' + D.reports.length + ' · ' + fmtDate(r.created_at) + '</span></div>' +
            '<div class="xvigor">' +
            '<div class="xvigor-head"><span>Vigor · NDVI</span><b>' + (ndvi == null ? 'N/D' : ndvi.toFixed(3)) + '</b></div>' +
            '<div class="xvigor-scale" role="img" aria-label="Escala NDVI de 0 a 1' + (ndvi == null ? '' : ', valor ' + ndvi.toFixed(2) + ': ' + ndviClass(ndvi)) + '">' +
            (pos == null ? '' : '<i style="left:' + pos.toFixed(1) + '%"></i>') + '</div>' +
            '<div class="xvigor-legend"><span>0 · bajo</span><span>0.5</span><span>1 · alto</span></div>' +
            (ndvi == null ? '' : '<p class="xvigor-class">' + ndviClass(ndvi) + ' <small>(referencia general del índice)</small></p>') +
            '</div>' +
            '<div class="xchips">' + chip('NDRE', r.ndre, '', 3) + chip('NDMI', r.ndmi, '', 3) + chip('Lluvia', r.precipitacion, ' mm', 1) + '</div>' +
            '<p class="xsource">Datos satelitales: <b>EOSDA</b></p>';
        setTag('xcReportesTag', D.reports.length > 1 ? D.reports.length + ' reportes' : '');
        if (action) action.firstChild.textContent = D.reports.length > 1 ? 'Reportes anteriores (' + (D.reports.length - 1) + ')' : 'Ver reporte completo';
    }

    function renderAnalisis() {
        var body = $('xcAnalisisBody');
        if (!body) return;
        if (D.status !== 'ready') {
            body.innerHTML = D.status === 'loading' ? '<div class="xskel"></div>' : stateMessage(D.status, D.retry);
            setTag('xcAnalisisTag', '');
            return;
        }
        var sc = D.filtered;
        if (!sc.length) {
            body.innerHTML = '<div class="xempty"><strong>Sin análisis registrados</strong><span>Escanea frutos con la app AVOTEX para ver resultados aquí.</span></div>';
            setTag('xcAnalisisTag', fruitTag());
            return;
        }
        var dist = distribution(sc);
        var salu = sc.filter(function (s) { return s.label === 'Saludable'; }).length;
        var avg = sc.reduce(function (a, s) { return a + (Number(s.score) || 0); }, 0) / sc.length;
        var bar = dist.map(function (r) {
            return '<i style="flex:' + r.n + ';background:' + stateOf(r.label).color + '" title="' + esc(r.label) + ': ' + r.n + '"></i>';
        }).join('');
        var legend = dist.slice(0, 4).map(function (r) {
            return '<li>' + stateBadge(r.label) + '<b>' + r.n + '</b></li>';
        }).join('');
        body.innerHTML =
            '<div class="xmetrics xmetrics-3">' +
            '<div class="xmetric"><span>Total</span><p><b>' + num(sc.length) + '</b></p><em>escaneos</em></div>' +
            '<div class="xmetric"><span>Saludables</span><p><b>' + Math.round(salu / sc.length * 100) + '</b><small>%</small></p><em>' + salu + ' frutos</em></div>' +
            '<div class="xmetric"><span>Confianza</span><p><b>' + Math.round(avg * 100) + '</b><small>%</small></p><em>promedio IA</em></div>' +
            '</div>' +
            '<div class="xstack" aria-hidden="true">' + bar + '</div>' +
            '<ul class="xlegend">' + legend + '</ul>' +
            '<p class="xnote">Último escaneo: ' + fmtDate(sc[0].created_at, true) + '</p>';
        setTag('xcAnalisisTag', fruitTag());
    }

    function renderRecientes(reset) {
        var body = $('xcRecientesBody');
        if (!body) return;
        if (D.status !== 'ready') {
            body.innerHTML = D.status === 'loading' ? '<div class="xskel"></div>' : stateMessage(D.status, D.retry);
            refreshPager('recientes', { reset: true });
            return;
        }
        var sc = D.filtered;
        if (!sc.length) {
            body.innerHTML = '<div class="xempty"><strong>Sin escaneos recientes</strong><span>Aún no hay escaneos para este filtro.</span></div>';
        } else {
            body.innerHTML = '<ol class="scan-list">' + sc.map(function (s, i) {
                return '<li class="scan-row">' +
                    '<span class="scan-n">' + (i + 1) + '</span>' +
                    '<span class="scan-main"><b>' + esc(s.fruto || 'Sin fruto') + '</b>' + stateBadge(s.label) + '</span>' +
                    '<span class="scan-side"><b>' + ((Number(s.score) || 0) * 100).toFixed(1) + '%</b><time datetime="' + esc(s.created_at) + '">' + fmtDate(s.created_at, true) + '</time></span>' +
                    '</li>';
            }).join('') + '</ol>';
        }
        setTag('xcRecientesTag', fruitTag());
        refreshPager('recientes', { reset: !!reset });
    }

    function renderAll(opts) {
        opts = opts || {};
        renderResumen();
        renderHuerta();
        renderDiagnosticos();
        renderReportes();
        renderAnalisis();
        renderRecientes(opts.reset);
        fitColumns();
    }

    // ───────── tarjetas secundarias: solo si caben completas ─────────

    function fitColumn(col) {
        if (!col || col.offsetParent === null) return false;
        var changed = false;
        var optional = Array.prototype.slice.call(col.querySelectorAll(':scope > .xcard.is-optional'));
        var mobile = root.matchMedia && root.matchMedia('(max-width: 760px)').matches;
        optional.forEach(function (c) { if (!c.classList.contains('is-fit-off')) { c.classList.add('is-fit-off'); changed = true; } });
        if (mobile || col.dataset.showing) return changed;
        var colRect = { height: col.clientHeight };
        var gap = parseFloat(getComputedStyle(col).rowGap) || 12;
        var used = 0;
        Array.prototype.forEach.call(col.querySelectorAll(':scope > .xcard:not(.is-optional)'), function (c) { used += c.offsetHeight + gap; });
        optional.forEach(function (c) {
            var min = Number(c.dataset.minH) || 200;
            if (colRect.height - used >= min) {
                c.classList.remove('is-fit-off');
                changed = true;
                used += (c.classList.contains('xcard-fill') ? colRect.height - used : c.offsetHeight) + gap;
            }
        });
        // Comprobación final con el tamaño real: una tarjeta que no alcanza su alto mínimo
        // (p. ej. solo cabría una fila de escaneos) no se muestra.
        optional.forEach(function (c) {
            if (c.classList.contains('is-fit-off')) return;
            var min = Number(c.dataset.minH) || 200;
            // offsetTop/offsetHeight ignoran la inclinación 3D (transform) de las tarjetas.
            var tooShort = c.classList.contains('xcard-fill') && c.offsetHeight < min - 1;
            var overflows = c.offsetTop + c.offsetHeight > col.clientHeight + 1;
            if (tooShort || overflows) c.classList.add('is-fit-off');
        });
        return changed;
    }

    var fitTimer = null;
    function fitColumns() {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(function () {
            fitColumn($('colLeft'));
            fitColumn($('colRight'));
            refreshPager('recientes');
            document.dispatchEvent(new CustomEvent('avotex:layout'));
        }, 30);
    }

    // ───────── API ─────────

    function setData(d) {
        var filterChanged = !!d.filterChanged || d.fruit !== D.fruit;
        D.status = d.status || 'ready';
        D.scans = d.scans || [];
        D.filtered = d.filtered || D.scans;
        D.reports = d.reports || [];
        D.fruit = d.fruit || null;
        D.retry = d.retry || null;
        renderAll({ reset: filterChanged });
        // Al cambiar el filtro, el historial empieza en la primera página del conjunto nuevo.
        setTimeout(function () {
            refreshPager('analisis', { reset: true });
            refreshPager('reportes', { reset: filterChanged });
            refreshPager('resumen', { reset: filterChanged });
        }, 0);
    }

    function setHuertas(status, rows) {
        D.huertasStatus = status;
        D.huertas = rows || [];
        if (D.active && !D.huertas.some(function (h) { return h.id === D.active.id; })) D.active = null;
        renderHuerta();
        renderResumen();
        setTimeout(function () { refreshPager('huerta', { reset: true }); }, 0);
        fitColumns();
    }

    function setActiveHuerta(h) {
        var changed = !D.active || !h || D.active.id !== h.id;
        D.active = h || null;
        if (!changed) return;
        renderHuerta();
        renderResumen();
        // La huerta activa pasa al principio de la lista: el detalle vuelve a la página 1.
        setTimeout(function () { refreshPager('huerta', { reset: true }); }, 0);
    }

    // Al abrir un detalle, su contenido ya es visible y se puede medir.
    function onDetailShown(module) {
        var map = { resumen: 'resumen', huerta: 'huerta', reportes: 'reportes', analisis: 'analisis' };
        var name = map[module];
        if (!name) return;
        requestAnimationFrame(function () {
            refreshPager(name);
            // Las gráficas de Chart.js y los mapas toman su tamaño real un instante después.
            setTimeout(function () { refreshPager(name); }, 260);
        });
    }

    document.addEventListener('avotex:huertas', function (e) {
        var d = e.detail || {};
        setHuertas(d.status, (d.rows || []).filter(function (h) { return h && h.id; }));
    });
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-xretry]');
        if (b && D.retry) { D.status = 'loading'; renderAll(); D.retry(); }
    });
    var resizeTimer = null;
    root.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { fitColumns(); refreshVisiblePagers(); }, 140);
    });

    setupPagers();
    renderAll();

    root.AvotexRecorrido = {
        setData: setData,
        setActiveHuerta: setActiveHuerta,
        onDetailShown: onDetailShown,
        layout: function () { fitColumns(); refreshVisiblePagers(); },
        _pagers: pagers,
        paginateHeights: paginateHeights,
        pageLabel: pageLabel
    };
})(typeof window !== 'undefined' ? window : globalThis);

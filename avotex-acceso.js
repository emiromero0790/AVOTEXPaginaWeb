/* =====================================================================
   AVOTEX · Acceso desde el hero («Administra tu huerta»)

   Hero → la cámara retrocede → aparece la huerta en surcos → login real.

   Cómo está hecho (2.5D, sin Three.js):
     · Al pulsar el botón se miden los planos del hero tal como están en pantalla
       (tierra, montículo delantero, aguacate y su sombra) y se redibujan en dos lienzos
       con las mismas posiciones. Mientras los textos y la navegación se desvanecen sobre
       el hero real, la capa aparece sin que se note el cambio.
     · Una sola variable de cámara p (0 → 1) decide cada cuadro: la tierra del hero y el
       fruto se alejan con escala exponencial hacia un punto del suelo de la huerta, y la
       huerta llega desde un encuadre cerrado sobre ese mismo suelo hasta mostrar los surcos.
       La tierra del hero se recorta con un óvalo difuso y se funde con la tierra de la huerta
       (misma textura oscura y removida), así el entorno aparece alrededor del fruto.
     · Todo se pinta en <canvas> (sin máscaras CSS por cuadro): la animación es estable.
     · Al terminar se muestra dashboard.html?embed=1 en un iframe del mismo origen:
       el mismo HTML, Firebase Auth, pestañas, redirecciones y chat. Nada se duplica.
   El regreso ejecuta la misma cámara en sentido inverso y devuelve el hero intacto.
   ===================================================================== */
(function () {
    'use strict';

    const root = document.querySelector('[data-acceso]');
    if (!root) return;

    const html = document.documentElement;
    const q = n => root.querySelector('[data-ac="' + n + '"]');
    const E = { back: q('back'), front: q('front'), haze: q('haze'), shade: q('shade'), login: q('login'), status: q('status') };
    const backBtn = root.querySelector('[data-access-close]');
    const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqMobile = window.matchMedia('(max-width: 760px)');

    const FRAME_URL = 'dashboard.html?embed=1';
    const FRAME_TIMEOUT = 12000;
    const MOUND = [0.62, 0.493];               // cima del montículo en la fotografía de tierra (igual que avotex.js)
    const SRC = {
        orchard: root.dataset.orchard, orchardM: root.dataset.orchardM,
        soil: 'assets/tierra/huerta-suelo.webp', soilM: 'assets/tierra/huerta-suelo-m.webp',
        front: 'assets/tierra/huerta-frente.webp', frontM: 'assets/tierra/huerta-frente-m.webp',
        fruit: 'assets/fruto/aguacate-entero.webp'
    };
    const CONF = {
        // anchor: punto de tierra removida (izquierda del camino) donde termina el fruto, en fracción de la foto
        // frameY: altura de pantalla donde queda ese punto · fruitEnd: ancho final del aguacate (px)
        desktop: { anchor: [0.25, 0.84], frameY: 0.84, fruitEnd: 40, dur: 2.7, orchardEx: 0.45 },
        mobile: { anchor: [0.2, 0.86], frameY: 0.86, fruitEnd: 30, dur: 2.1, orchardEx: 0.45 }
    };
    // Cada fotografía de la huerta puede declarar su propio punto de llegada en el HTML
    // (data-anchor="x,y", data-frame-y, data-fruit-end y sus variantes -m para móvil):
    // así el aguacate del hero aterriza dentro de la caja de cosecha de la escena.
    (function readSceneConf() {
        const d = root.dataset;
        const pair = v => { const a = String(v || '').split(',').map(Number); return a.length === 2 && a.every(isFinite) ? a : null; };
        const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
        [['desktop', ''], ['mobile', 'M']].forEach(([k, s]) => {
            const c = CONF[k];
            const a = pair(d['anchor' + s]); if (a) c.anchor = a;
            const fy = num(d['frameY' + s]); if (fy !== null) c.frameY = fy;
            const fe = num(d['fruitEnd' + s]); if (fe !== null) c.fruitEnd = fe;
        });
    })();

    const S = {
        open: false, busy: false, p: 0, fromHero: false, trigger: null,
        iframe: null, ready: false, failed: false, camDone: false, loginShown: false,
        pushed: false, afterClose: null, pendingClose: null,
        saved: [], hero: null, G: null, tl: null, timer: 0, scrollY: 0,
        bgUrl: '', bgWait: null
    };

    const gs = () => window.gsap || null;
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const opacityOf = el => {
        if (!el) return 0;
        const cs = getComputedStyle(el);
        return cs.visibility === 'hidden' || cs.display === 'none' ? 0 : parseFloat(cs.opacity) || 0;
    };
    const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

    /* ---------- Imágenes (se piden por intención, en reposo o al abrir) ---------- */
    const IMG = {};
    function img(url) {
        if (!url) return null;
        if (!IMG[url]) {
            const im = new Image();
            im.decoding = 'async';
            im.onload = () => { if (S.open && S.G) draw(S.p); };
            im.src = url;
            IMG[url] = im;
        }
        return IMG[url];
    }
    const ok = im => !!(im && im.complete && im.naturalWidth);
    const pick = (d, m) => img(mqMobile.matches ? m : d);
    function loadAssets() {
        pick(SRC.orchard, SRC.orchardM); pick(SRC.soil, SRC.soilM); pick(SRC.front, SRC.frontM); img(SRC.fruit);
    }
    function decoded(im, ms) {
        if (!im) return Promise.resolve();
        const p = ok(im) && im.decode ? im.decode().catch(() => {}) : new Promise(r => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); });
        return Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    }

    /* ---------- Login real en iframe (mismo origen) ---------- */
    function ensureFrame() {
        if (S.iframe) return;
        const f = document.createElement('iframe');
        f.className = 'acceso__frame';
        f.title = 'Iniciar sesión en Avotex';
        f.setAttribute('allow', 'microphone');            // el chat de voz de ayuda lo necesita
        f.addEventListener('load', () => {
            let found = false;
            try { found = !!(f.contentDocument && f.contentDocument.getElementById('agriEmail')); } catch (_) { found = false; }
            S.ready = found;
            S.failed = !found;
            if (S.open && S.camDone) settleLogin();
        });
        f.src = FRAME_URL;
        E.login.appendChild(f);
        S.iframe = f;
    }

    /* ---------- Medición del hero ---------- */
    function heroNodes() {
        const st = document.querySelector('.story--fruto');
        if (!st) return null;
        const f = n => st.querySelector('[data-f="' + n + '"]');
        return {
            story: st, copy: st.querySelector('[data-copy="hero"]'),
            soil: f('soil'), front: f('soil-front'), rig: f('rig'), travel: f('travel'), whole: f('whole'),
            contact: f('contact'), haze: f('haze'),
            scrim: st.querySelector('[data-scrim="hero"]'), rail: st.querySelector('.story-rail')
        };
    }

    // El hero está en pantalla tal como se diseñó (acto I animado, título y tierra visibles).
    function heroVisible(h) {
        if (!h || !h.copy || !h.soil || !h.whole || !h.story.classList.contains('story--motion')) return false;
        const t = h.copy.querySelector('h1');
        if (!t) return false;
        const r = t.getBoundingClientRect();
        return opacityOf(t) > 0.9 && opacityOf(h.soil) > 0.9 && r.bottom > 0 && r.top < window.innerHeight;
    }

    function measureHero(h) {
        const g = gs();
        const prop = (el, p, d) => { if (!g || !el) return d; const v = parseFloat(g.getProperty(el, p)); return isFinite(v) ? v : d; };
        const wr = h.whole.getBoundingClientRect();
        // Se dibuja con las mismas imágenes que eligió el navegador para el hero.
        const cur = el => { const i = el && el.querySelector('img'); return i && (i.currentSrc || i.src); };
        return {
            soil: Object.assign(rectOf(h.soil), { o: opacityOf(h.soil), src: cur(h.soil) }),
            front: Object.assign(rectOf(h.front), { o: opacityOf(h.front), src: cur(h.front) }),
            fruit: {
                cx: wr.left + wr.width / 2, cy: wr.top + wr.height / 2,
                bw: h.whole.offsetWidth, bh: h.whole.offsetHeight,
                s: prop(h.whole, 'scale', 1) * prop(h.rig, 'scale', 1) * prop(h.travel, 'scale', 1),
                rot: prop(h.whole, 'rotation', 0),
                o: opacityOf(h.rig) * opacityOf(h.whole)
            },
            contact: Object.assign(rectOf(h.contact), { o: opacityOf(h.contact) }),
            haze: opacityOf(h.haze)
        };
    }

    // Composición equivalente al hero, para cuando el botón se pulsa lejos de él.
    function fallbackHero(W, H, mob) {
        const bw = Math.max(W, 1.5 * H), k = mob ? 1.3 : 1.26, w = bw * k, hh = w / 1.5;
        const at = mob ? [0.52, 0.34] : [0.53, 0.52];
        const x = Math.min(0, Math.max(W - w, at[0] * W - MOUND[0] * w));
        const y = Math.min(0, Math.max(H - hh, at[1] * H - MOUND[1] * hh));
        const soil = { x, y, w, h: hh, o: 1, src: null };
        const rigW = mob ? Math.min(0.30 * H, 0.64 * W) : Math.min(0.46 * H, 430);
        const rigH = rigW * 1185 / 910;
        const fbw = rigW * 1.18, fbh = fbw * 885 / 1358;
        const mx = x + MOUND[0] * w, my = y + MOUND[1] * hh;
        const cx = mx + 0.012 * w, cy = my - fbh * (mob ? 1 : 0.96) * 0.14;
        return {
            soil, front: Object.assign({}, soil),
            fruit: { cx, cy, bw: fbw, bh: fbh, s: mob ? 0.95 : 0.92, rot: mob ? -6 : -8, o: 1 },
            contact: { x: cx - rigW * 0.44, y: cy - rigH / 2 + rigH * 0.63, w: rigW * 0.88, h: rigH * 0.16, o: 1 },
            haze: 1
        };
    }

    /* ---------- Geometría de la cámara ---------- */
    function sizeCanvas(c, W, H, dpr) {
        const w = Math.round(W * dpr), h = Math.round(H * dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }

    function computeG() {
        const W = root.clientWidth || window.innerWidth, H = root.clientHeight || window.innerHeight;
        const mob = mqMobile.matches, C = mob ? CONF.mobile : CONF.desktop;
        if (!S.hero) S.hero = fallbackHero(W, H, mob);
        const hz = S.hero;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        [E.back, E.front].forEach(c => sizeCanvas(c, W, H, dpr));

        // Encuadre final de la huerta: cubre la pantalla y deja el punto de llegada en el tercio inferior
        const orch = pick(SRC.orchard, SRC.orchardM);
        const ratio = ok(orch) ? orch.naturalWidth / orch.naturalHeight : (mob ? 900 / 1309 : 1.5);
        let ow = W, oh = W / ratio;
        if (oh < H) { oh = H; ow = H * ratio; }
        const ox = Math.min(0, Math.max(W - ow, 0.5 * W - 0.5 * ow));
        const oy = Math.min(0, Math.max(H - oh, C.frameY * H - C.anchor[1] * oh));
        const O = { x: ox, y: oy, w: ow, h: oh };
        const A = { x: ox + C.anchor[0] * ow, y: oy + C.anchor[1] * oh };

        const c0 = { x: hz.soil.x + MOUND[0] * hz.soil.w, y: hz.soil.y + MOUND[1] * hz.soil.h };
        // fruitEnd < 1: fracción del ancho de la fotografía (el fruto iguala a los de la caja en cualquier pantalla)
        const fruitEnd = C.fruitEnd < 1 ? C.fruitEnd * ow : C.fruitEnd;
        const s1 = Math.min(0.5, fruitEnd / Math.max(1, hz.fruit.bw * hz.fruit.s));
        return { W, H, dpr, O, A, c0, s1, dur: C.dur, ex: C.orchardEx, mob };
    }

    /* ---------- Dibujo: todo el cuadro depende solo de p ---------- */
    let scratch = null;
    function scratchCtx(G) {
        if (!scratch) scratch = document.createElement('canvas');
        sizeCanvas(scratch, G.W, G.H, G.dpr);
        const c = scratch.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, scratch.width, scratch.height);
        c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        return c;
    }

    // Fotografía de tierra recortada con un óvalo difuso alrededor del montículo y bordes suaves.
    function drawSoilLayer(ctx, G, im, r, p, alpha) {
        if (!ok(im) || alpha <= 0.002) return;
        const masked = p > 0.0005;
        const c = masked ? scratchCtx(G) : ctx;
        c.imageSmoothingQuality = 'high';
        c.globalAlpha = masked ? 1 : alpha;
        c.drawImage(im, r.x, r.y, r.w, r.h);
        c.globalAlpha = 1;
        if (!masked) return;

        c.globalCompositeOperation = 'destination-in';
        // óvalo: se cierra con la cámara
        const rad = lerp(1.7, 0.26, smooth(0.04, 0.5, p));
        const mx = r.x + MOUND[0] * r.w, my = r.y + MOUND[1] * r.h;
        c.save();
        c.translate(mx, my);
        c.scale(r.w, r.h);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
        g.addColorStop(0, '#000'); g.addColorStop(0.55, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(-4, -4, 8, 8);
        c.restore();
        // bordes de la fotografía: difuminados en cuanto entran en cuadro
        const e = 0.16 * smooth(0, 0.06, p);
        if (e > 0.001) {
            const lin = (x0, y0, x1, y1) => {
                const l = c.createLinearGradient(x0, y0, x1, y1);
                l.addColorStop(0, 'rgba(0,0,0,0)'); l.addColorStop(e, '#000'); l.addColorStop(1 - e, '#000'); l.addColorStop(1, 'rgba(0,0,0,0)');
                return l;
            };
            c.fillStyle = lin(r.x, 0, r.x + r.w, 0); c.fillRect(r.x, r.y, r.w, r.h);
            c.fillStyle = lin(0, r.y, 0, r.y + r.h); c.fillRect(r.x, r.y, r.w, r.h);
        }
        c.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha;
        ctx.drawImage(scratch, 0, 0);
        ctx.restore();
    }

    function draw(p) {
        const G = S.G, hz = S.hero;
        if (!G || !hz) return;
        S.p = p;
        const sig = Math.pow(G.s1, p);
        const Cx = lerp(G.c0.x, G.A.x, p), Cy = lerp(G.c0.y, G.A.y, p);
        const T = (x, y) => [sig * (x - G.c0.x) + Cx, sig * (y - G.c0.y) + Cy];
        const TR = r => { const [x, y] = T(r.x, r.y); return { x, y, w: r.w * sig, h: r.h * sig }; };

        /* Lienzo trasero: huerta + tierra del hero */
        const b = E.back.getContext('2d');
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.fillStyle = '#0b1710';
        b.fillRect(0, 0, E.back.width, E.back.height);
        b.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        b.imageSmoothingQuality = 'high';

        const orch = pick(SRC.orchard, SRC.orchardM);
        if (ok(orch)) {
            const k = Math.pow(sig / G.s1, G.ex);
            const w = k * G.O.w, h = k * G.O.h;
            const x = Math.min(0, Math.max(G.W - w, Cx - k * (G.A.x - G.O.x)));
            const y = Math.min(0, Math.max(G.H - h, Cy - k * (G.A.y - G.O.y)));
            b.drawImage(orch, x, y, w, h);
        }

        const soilO = 1 - smooth(0.36, 0.78, p);
        const soilImg = hz.soil.src ? img(hz.soil.src) : pick(SRC.soil, SRC.soilM);
        drawSoilLayer(b, G, soilImg, TR(hz.soil), p, soilO);

        /* Bruma del hero (capa CSS entre lienzos, como en el hero) */
        E.haze.style.opacity = (hz.haze * (1 - smooth(0.03, 0.4, p))).toFixed(3);

        /* Lienzo delantero: sombra de contacto, aguacate y montículo */
        const f = E.front.getContext('2d');
        f.setTransform(1, 0, 0, 1, 0, 0);
        f.clearRect(0, 0, E.front.width, E.front.height);
        f.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        f.imageSmoothingQuality = 'high';

        // Sombra de contacto: se conserva al final para que el fruto quede asentado en el surco
        const c = TR(hz.contact);
        const co = hz.contact.o * lerp(1, 0.75, smooth(0.5, 1, p));
        if (co > 0.002) {
            f.save();
            f.globalAlpha = co;
            f.translate(c.x + c.w / 2, c.y + c.h / 2);
            f.scale(c.w / 2, c.h / 2);
            const g = f.createRadialGradient(0, 0, 0, 0, 0, 1);
            g.addColorStop(0, 'rgba(4,3,2,.82)'); g.addColorStop(0.38, 'rgba(4,3,2,.55)'); g.addColorStop(0.72, 'rgba(4,3,2,0)');
            f.fillStyle = g;
            f.fillRect(-1, -1, 2, 2);
            f.restore();
        }

        // Aguacate: misma rotación y sombra del hero; termina como parte del paisaje
        const fi = img(SRC.fruit), fr = hz.fruit;
        if (ok(fi) && fr.o > 0.002) {
            const [fx, fy] = T(fr.cx, fr.cy);
            const sc = sig * fr.s;
            f.save();
            f.globalAlpha = fr.o;
            f.translate(fx, fy);
            f.rotate(fr.rot * Math.PI / 180);
            f.scale(sc, sc);
            f.shadowColor = 'rgba(0,0,0,.6)';
            f.shadowBlur = 34 * sc * G.dpr;
            f.shadowOffsetY = 34 * sc * G.dpr;
            f.drawImage(fi, -fr.bw / 2, -fr.bh / 2, fr.bw, fr.bh);
            f.restore();
        }

        const frontImg = hz.front.src ? img(hz.front.src) : pick(SRC.front, SRC.frontM);
        drawSoilLayer(f, G, frontImg, TR(hz.front), p, soilO * hz.front.o);

        E.shade.style.opacity = smooth(0.55, 1, p).toFixed(3);
    }

    /* ---------- Fondo del cristal ----------
       El iframe no puede desenfocar lo que pinta la landing (backdrop-filter solo ve su propio
       documento). Se compone el último cuadro (lienzos + oscurecimiento final) y se le envía como
       imagen alineada con la pantalla; el cristal de la tarjeta desenfoca exactamente esa huerta. */
    function snapshotUrl() {
        const G = S.G;
        if (!G) return Promise.resolve('');
        const c = document.createElement('canvas');
        c.width = E.back.width; c.height = E.back.height;
        const x = c.getContext('2d');
        x.drawImage(E.back, 0, 0);
        x.drawImage(E.front, 0, 0);
        // Mismos degradados que .acceso__shade (opacidad 1 al final de la cámara)
        x.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        x.save();
        x.translate(G.W / 2, G.H / 2);
        x.scale(0.46 * G.W, 0.62 * G.H);
        const r = x.createRadialGradient(0, 0, 0, 0, 0, 1);
        r.addColorStop(0, 'rgba(6,14,9,.3)'); r.addColorStop(0.6, 'rgba(6,14,9,.12)'); r.addColorStop(1, 'rgba(6,14,9,0)');
        x.fillStyle = r; x.fillRect(-2, -2, 4, 4);
        x.restore();
        const l = x.createLinearGradient(0, 0, 0, 0.22 * G.H);
        l.addColorStop(0, 'rgba(6,14,9,.5)'); l.addColorStop(1, 'rgba(6,14,9,0)');
        x.fillStyle = l; x.fillRect(0, 0, G.W, 0.22 * G.H);
        return new Promise(res => {
            try {
                c.toBlob(b => {
                    if (!b) return res('');
                    if (S.bgUrl) URL.revokeObjectURL(S.bgUrl);
                    S.bgUrl = URL.createObjectURL(b);
                    res(S.bgUrl);
                }, 'image/jpeg', 0.9);
            } catch (_) { res(''); }
        });
    }

    // Envía el fondo al login y espera su confirmación (como mucho 700 ms; nunca bloquea el acceso).
    function sendBackdrop() {
        const f = S.iframe;
        if (!f || !S.ready) return Promise.resolve();
        return snapshotUrl().then(url => {
            if (!url) return;
            const fr = f.getBoundingClientRect();
            return new Promise(res => {
                const t = setTimeout(() => { S.bgWait = null; res(); }, 700);
                S.bgWait = () => { clearTimeout(t); S.bgWait = null; res(); };
                try {
                    f.contentWindow.postMessage({
                        source: 'avotex-landing', type: 'backdrop', url,
                        x: -fr.left, y: -fr.top, w: S.G.W, h: S.G.H
                    }, window.location.origin);
                } catch (_) { S.bgWait(); }
            });
        }).catch(() => {});
    }

    /* ---------- Página de fondo: bloqueo sin cambiar el layout ---------- */
    // No se toca overflow (eso cambia el ancho por la barra de scroll y deja una franja visible):
    // se bloquean las entradas que desplazan la página y se fija la posición.
    const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
    const stopWheel = e => { if (S.open) e.preventDefault(); };
    const stopKeys = e => {
        if (!S.open || !SCROLL_KEYS.has(e.key)) return;
        const t = e.target;
        if (t && t.closest && t.closest('button, a, input, textarea, select')) return;
        e.preventDefault();
    };
    const holdScroll = () => { if (S.open && Math.abs(window.scrollY - S.scrollY) > 1) window.scrollTo(0, S.scrollY); };
    const pageParts = () => Array.from(document.querySelectorAll('body > .skip-link, body > .site-nav, body > main, body > footer'));

    function lockPage(on) {
        html.classList.toggle('acceso-open', on);
        pageParts().forEach(el => { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
        if (on) {
            S.scrollY = window.scrollY;
            window.addEventListener('wheel', stopWheel, { passive: false });
            window.addEventListener('touchmove', stopWheel, { passive: false });
            window.addEventListener('keydown', stopKeys);
            window.addEventListener('scroll', holdScroll, { passive: true });
        } else {
            window.removeEventListener('wheel', stopWheel);
            window.removeEventListener('touchmove', stopWheel);
            window.removeEventListener('keydown', stopKeys);
            window.removeEventListener('scroll', holdScroll);
        }
    }

    function pushHistory() {
        try { history.pushState({ avotexAcceso: true }, '', '#acceso'); S.pushed = true; } catch (_) { S.pushed = false; }
    }

    function requestClose(then) {
        if (!S.open) return;
        if (S.pushed && history.state && history.state.avotexAcceso) {
            S.afterClose = then || null;
            history.back();                              // popstate cierra la escena
        } else {
            close({ then });
        }
    }

    /* ---------- Apertura ---------- */
    function open(trigger, opts) {
        opts = opts || {};
        if (S.open || S.busy) return;
        S.open = true; S.busy = true; S.camDone = false; S.loginShown = false; S.trigger = trigger || null;
        if (S.trigger) S.trigger.setAttribute('aria-expanded', 'true');

        loadAssets();
        ensureFrame();

        const g = gs();
        const reduce = !!opts.instant || mqReduce.matches || !g;
        const h = heroNodes();
        S.fromHero = !reduce && heroVisible(h);
        S.hero = null;
        try { if (S.fromHero) S.hero = measureHero(h); } catch (_) { S.fromHero = false; S.hero = null; }

        lockPage(true);
        if (!opts.fromHistory) pushHistory();

        root.hidden = false;
        root.style.opacity = '0';
        if (g) g.set([E.login, backBtn], { autoAlpha: 0, y: 0 });
        E.status.textContent = '';
        root.focus({ preventScroll: true });

        try {
            S.G = computeG();
            draw(reduce ? 1 : 0);

            if (reduce) {
                // Transición simplificada: la huerta y el acceso aparecen sin recorrido de cámara.
                decoded(pick(SRC.orchard, SRC.orchardM), 1200).then(() => {
                    S.G = computeG(); draw(1);
                    if (g && !opts.instant) g.to(root, { opacity: 1, duration: 0.3, ease: 'power1.out', onComplete: cameraDone });
                    else { root.style.opacity = '1'; cameraDone(); }
                });
                return;
            }

            const nav = document.querySelector('[data-nav]');
            const tl = g.timeline({ defaults: { ease: 'power2.out' }, paused: true });
            S.tl = tl;
            tl.to(nav, { yPercent: -100, autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, 0);

            let swapAt;
            if (S.fromHero) {
                const kids = Array.from(h.copy.children);
                const actions = kids.find(k => k.classList.contains('actions'));
                const lede = kids.find(k => k.classList.contains('lede'));
                const title = kids.find(k => k.tagName === 'H1');
                // Valores actuales, para devolverlos exactos al regresar.
                S.saved = [title, lede, actions, h.scrim, h.rail].filter(Boolean).map(el => ({
                    el, o: parseFloat(g.getProperty(el, 'opacity')) || 0, y: parseFloat(g.getProperty(el, 'y')) || 0
                }));
                tl.to(h.rail, { autoAlpha: 0, duration: 0.3 }, 0)
                  .to(actions, { autoAlpha: 0, y: -12, duration: 0.38, ease: 'power1.in' }, 0.04)
                  .to(lede, { autoAlpha: 0, y: -14, duration: 0.4, ease: 'power1.in' }, 0.12)
                  .to(title, { autoAlpha: 0, y: -18, duration: 0.44, ease: 'power1.in' }, 0.2)
                  .to(h.scrim, { autoAlpha: 0, duration: 0.5, ease: 'power1.inOut' }, 0.14);
                swapAt = 0.66;
                // La capa es idéntica al hero sin textos: el cambio es invisible.
                tl.call(() => { root.style.opacity = '1'; }, null, swapAt);
            } else {
                S.saved = [];
                tl.to(root, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 0.1);
                swapAt = 0.5;
            }

            tl.to(S, { p: 1, duration: S.G.dur, ease: 'power2.inOut', onUpdate: () => draw(S.p) }, swapAt)
              .call(cameraDone);

            // La cámara no arranca hasta que la huerta está decodificada (como mucho 1.2 s de espera).
            decoded(pick(SRC.orchard, SRC.orchardM), 1200).then(() => {
                if (!S.open || S.tl !== tl) return;
                S.G = computeG();
                draw(0);
                tl.play();
            });
        } catch (err) {
            // Cualquier fallo visual recuperable: el acceso aparece igualmente.
            console.error('[Avotex acceso]', err);
            if (S.tl) S.tl.kill();
            try { draw(1); } catch (_) { /* sin escena */ }
            root.style.opacity = '1';
            cameraDone();
        }
    }

    function cameraDone() {
        S.camDone = true;
        const g = gs();
        if (g) g.to(backBtn, { autoAlpha: 1, duration: mqReduce.matches ? 0 : 0.35, ease: 'power1.out' });
        else { backBtn.style.opacity = '1'; backBtn.style.visibility = 'visible'; }
        settleLogin();
    }

    // Muestra el login en cuanto la cámara terminó y el iframe está listo; si tarda, lo indica.
    function settleLogin() {
        if (!S.open || !S.camDone || S.loginShown) return;
        clearTimeout(S.timer);
        if (S.ready) {
            S.loginShown = true;
            E.status.textContent = '';
            sendBackdrop().then(() => {
                if (!S.open) return;
                const g = gs();
                const finish = () => { S.busy = false; focusLogin(); flushPendingClose(); };
                // El iframe ya tiene la misma huerta de fondo: solo la tarjeta se percibe al aparecer.
                try { S.iframe.contentWindow.postMessage({ source: 'avotex-landing', type: 'enter' }, window.location.origin); } catch (_) { /* sin login */ }
                if (g) g.fromTo(E.login, { autoAlpha: 0, y: 0 }, { autoAlpha: 1, duration: mqReduce.matches ? 0.2 : 0.55, ease: 'power2.out', onComplete: finish });
                else { E.login.style.opacity = '1'; E.login.style.visibility = 'visible'; finish(); }
            });
            return;
        }
        if (S.failed) return showFailure();
        E.status.textContent = 'Abriendo el acceso…';
        S.timer = setTimeout(() => { if (!S.ready) { S.failed = true; showFailure(); } }, FRAME_TIMEOUT);
    }

    function showFailure() {
        E.status.innerHTML = 'No pudimos abrir el acceso aquí. <a href="dashboard.html">Abrir la página de inicio de sesión</a>';
        S.busy = false;
        const a = E.status.querySelector('a');
        if (a) a.focus({ preventScroll: true });
        flushPendingClose();
    }

    function focusLogin() {
        const f = S.iframe;
        if (!f) return;
        try {
            f.contentWindow.focus();
            f.contentWindow.postMessage({ source: 'avotex-landing', type: 'focus' }, window.location.origin);
        } catch (_) { f.focus(); }
    }

    function flushPendingClose() {
        if (!S.pendingClose) return;
        const o = S.pendingClose;
        S.pendingClose = null;
        close(o);
    }

    /* ---------- Regreso a la landing ---------- */
    function close(opts) {
        opts = opts || {};
        if (!S.open) return;
        if (S.busy) { S.pendingClose = opts; return; }
        S.busy = true;
        clearTimeout(S.timer);
        const g = gs();
        const reduce = mqReduce.matches || !g;
        const nav = document.querySelector('[data-nav]');

        const done = () => {
            root.hidden = true;
            root.style.opacity = '';
            E.status.textContent = '';
            try { if (S.iframe) S.iframe.contentWindow.postMessage({ source: 'avotex-landing', type: 'reset' }, window.location.origin); } catch (_) { /* sin login */ }
            lockPage(false);
            if (g && nav) g.set(nav, { clearProps: 'transform,opacity,visibility' });
            if (S.trigger) {
                S.trigger.setAttribute('aria-expanded', 'false');
                if (document.contains(S.trigger) && S.trigger.offsetParent !== null) S.trigger.focus({ preventScroll: true });
            }
            S.open = false; S.busy = false; S.tl = null; S.saved = [];
            if (typeof opts.then === 'function') opts.then();
        };

        if (reduce) {
            S.saved.forEach(s => { if (g) g.set(s.el, { autoAlpha: s.o, y: s.y }); });
            if (g) g.to(root, { opacity: 0, duration: 0.2, onComplete: done });
            else done();
            return;
        }

        try {
            // El hero pudo cambiar de tamaño mientras el acceso estaba abierto: se vuelve a medir.
            if (S.fromHero) {
                const h = heroNodes();
                if (h) S.hero = measureHero(h);
            }
            S.G = computeG();
            draw(S.p);
            const tl = g.timeline();
            S.tl = tl;
            tl.to(E.login, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, 0)
              .to(backBtn, { autoAlpha: 0, y: 10, duration: 0.3, ease: 'power1.in' }, 0)
              .to(S, { p: 0, duration: S.G.dur * 0.82, ease: 'power2.inOut', onUpdate: () => draw(S.p) }, 0.16);

            if (S.fromHero) {
                tl.call(() => { root.style.opacity = '0'; });
                const at = tl.duration();
                // Orden inverso al de salida: título, párrafo, botones; la navegación al final.
                S.saved.forEach((s, i) => tl.to(s.el, { autoAlpha: s.o, y: s.y, duration: 0.45, ease: 'power2.out' }, at + i * 0.07));
                tl.to(nav, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'power2.out' }, at + 0.2);
            } else {
                tl.to(root, { opacity: 0, duration: 0.45, ease: 'power1.in' })
                  .to(nav, { yPercent: 0, autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, '-=0.2');
            }
            tl.call(done);
        } catch (err) {
            console.error('[Avotex acceso]', err);
            S.saved.forEach(s => g.set(s.el, { autoAlpha: s.o, y: s.y }));
            done();
        }
    }

    function goToPricing() {
        const t = document.getElementById('pricing');
        if (!t) return;
        const navH = parseFloat(getComputedStyle(html).getPropertyValue('--nav-h')) || 0;
        const top = t.getBoundingClientRect().top + window.scrollY - navH + 1;
        window.scrollTo({ top, behavior: mqReduce.matches ? 'auto' : 'smooth' });
    }

    /* ---------- Eventos ---------- */
    const isTrigger = el => el && el.closest && el.closest('a[data-access-open]');

    document.addEventListener('click', e => {
        const a = isTrigger(e.target);
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (S.busy || S.open) return;                    // bloquea clics repetidos durante la transición
        if (a.closest('#planModal') && typeof window.closePlanModal === 'function') window.closePlanModal();
        open(a);
    });

    // Precarga por intención: la huerta y el login empiezan a cargar antes del clic.
    const warm = e => { if (isTrigger(e.target)) { loadAssets(); ensureFrame(); } };
    document.addEventListener('pointerover', warm, { passive: true });
    document.addEventListener('focusin', warm);
    document.addEventListener('touchstart', warm, { passive: true });

    backBtn.addEventListener('click', () => { if (!S.busy) requestClose(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && S.open && !S.busy) requestClose();
    });

    window.addEventListener('popstate', () => {
        const inAccess = !!(history.state && history.state.avotexAcceso);
        if (S.open && !inAccess) {
            S.pushed = false;
            const then = S.afterClose; S.afterClose = null;
            close({ then });
        } else if (!S.open && inAccess) {
            S.pushed = true;
            open(null, { fromHistory: true });
        }
    });

    // Mensajes del login embebido (solo del iframe propio y del mismo origen)
    window.addEventListener('message', e => {
        if (e.origin !== window.location.origin || !S.iframe || e.source !== S.iframe.contentWindow) return;
        const d = e.data || {};
        if (d.source !== 'avotex-login') return;
        if (d.type === 'backdrop-ready') { if (S.bgWait) S.bgWait(); return; }
        if (S.busy) return;
        if (d.type === 'close') requestClose();
        else if (d.type === 'plans') requestClose(goToPricing);
    });

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
        if (!S.open || S.busy) return;
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            S.G = computeG(); draw(S.p);
            if (S.loginShown) sendBackdrop();
        });
    });

    // Enlace directo a avotex.html#acceso: abre el acceso cuando termina la pantalla de carga.
    if (window.location.hash === '#acceso') {
        try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) { /* ignora */ }
        const t0 = Date.now();
        const wait = () => {
            if (!html.classList.contains('avotex-loading') && !document.getElementById('avotexPageLoader')) open(null, { instant: true });
            else if (Date.now() - t0 < 13000) setTimeout(wait, 150);
            else open(null, { instant: true });
        };
        wait();
    }

    // Con la página ya cargada y en reposo, se descarga la huerta para que la cámara nunca espere.
    window.addEventListener('load', () => {
        const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
        setTimeout(() => idle(loadAssets), 2500);
    }, { once: true });

    // Pruebas manuales desde la consola
    window.AvotexAcceso = { open: () => open(null), close: () => requestClose(), state: S };
})();

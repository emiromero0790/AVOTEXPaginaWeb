/*
 * AVOTEX — gesto para cambiar de pestaña en el Panel Administrador (avotex-admin.html).
 *
 * La cámara se enciende sola al cargar (la primera vez el navegador pide permiso; en el equipo del
 * stand queda recordado). Con la PINZA (pulgar + índice): mueve la mano a tu derecha = pestaña
 * siguiente; a tu izquierda = pestaña anterior. Un movimiento cambia una vez; regresa la mano al
 * centro (o suelta la pinza) para cambiar de nuevo. Respaldo sin cámara: flechas ← → del teclado.
 *
 * Reutiliza avotex-gestos-core.js (mismo reconocimiento de la pinza que la experiencia inmersiva).
 * Para quitarlo: borra este archivo y su <script> de avotex-admin.html.
 */
(function (root, doc) {
    'use strict';
    var CORE = root.AvotexGestosCore;
    if (!CORE) return;

    var AUTO = root.AVOTEX_ADMIN_GESTOS_NOAUTO !== true;
    var MP_BASE = 'assets/vendor/mediapipe/tasks-vision-1.2.3/';
    var MODEL_URL = 'assets/vendor/mediapipe/models/hand_landmarker-float16-v1.task';
    function abs(p) { return new URL(p, doc.baseURI).href; }

    var G = { armed: false, loading: false, stream: null, video: null, landmarker: null,
        raf: 0, lastVideoTime: -1, lastTs: 0, controller: null, swipe: null, statusEl: null, deps: null, lastDir: 0, upSince: 0, leaving: false };
    function getUM(c) { return (G.deps && G.deps.getUserMedia ? G.deps.getUserMedia : navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices))(c); }
    function mkLM() { return G.deps && G.deps.makeLandmarker ? G.deps.makeLandmarker() : makeLandmarker(); }

    // ───────── cambiar de pestaña (hace clic en el menú existente) ─────────
    function navButtons() { return Array.prototype.slice.call(doc.querySelectorAll('#nav button[data-view]')); }
    function changeTab(delta) {
        var btns = navButtons();
        if (!btns.length) return;
        var cur = btns.findIndex(function (b) { return b.classList.contains('on'); });
        if (cur < 0) cur = 0;
        var next = ((cur + delta) % btns.length + btns.length) % btns.length;
        btns[next].click();
        flash((delta > 0 ? 'Siguiente' : 'Anterior') + ': ' + (btns[next].textContent || '').trim());
    }

    // ───────── estado discreto ─────────
    var flashTimer = 0;
    function flash(text, kind) {
        if (!G.statusEl) {
            var el = doc.createElement('div');
            el.id = 'adminGestoEstado';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;' +
                'font:600 12px/1.3 Inter,system-ui,sans-serif;padding:7px 14px;border-radius:999px;' +
                'background:rgba(9,24,17,.85);color:#eafff0;border:1px solid rgba(185,246,47,.35);' +
                'box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;transition:opacity .2s;pointer-events:none;' +
                'display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);';
            doc.body.appendChild(el); G.statusEl = el;
        }
        G.statusEl.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:' + (kind === 'error' ? '#f2766b' : '#b9f62f') + '"></span><span></span>';
        G.statusEl.lastChild.textContent = text || '';
        G.statusEl.style.opacity = text ? '1' : '0';
        clearTimeout(flashTimer);
        if (text && kind !== 'persist') flashTimer = setTimeout(function () { if (G.statusEl) G.statusEl.style.opacity = '0'; }, 1600);
    }

    // ───────── cámara y modelo ─────────
    var scriptP = null;
    function loadBundle() {
        if (root.Vision && root.Vision.HandLandmarker) return Promise.resolve();
        if (scriptP) return scriptP;
        scriptP = new Promise(function (resolve, reject) {
            var sc = doc.createElement('script'); sc.src = abs(MP_BASE + 'vision_bundle.js'); sc.async = true;
            sc.onload = resolve; sc.onerror = function () { scriptP = null; sc.remove(); reject(new Error('bundle')); };
            doc.head.appendChild(sc);
        });
        return scriptP;
    }
    async function makeLandmarker() {
        await loadBundle();
        var V = root.Vision;
        var fileset = await V.FilesetResolver.forVisionTasks(abs(MP_BASE + 'wasm'));
        var opts = function (d) { return { baseOptions: { modelAssetPath: abs(MODEL_URL), delegate: d }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 }; };
        try { return await V.HandLandmarker.createFromOptions(fileset, opts('GPU')); }
        catch (e) { return await V.HandLandmarker.createFromOptions(fileset, opts('CPU')); }
    }

    async function arm() {
        if (G.armed || G.loading) return;
        if (!root.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        G.loading = true;
        var stream;
        try {
            stream = await getUM({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } } });
            G.landmarker = await mkLM();
        } catch (e) {
            G.loading = false;
            if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
            return; // sin cámara: quedan las flechas del teclado
        }
        G.stream = stream;
        var v = doc.createElement('video');
        v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
        v.srcObject = stream; doc.body.appendChild(v); G.video = v;
        try { await v.play(); } catch (e) { /* al primer frame */ }
        G.controller = CORE.createController(CORE.DEFAULTS);
        G.swipe = CORE.createSwipe(CORE.DEFAULTS);
        G.armed = true; G.loading = false;
        flash('✋ Pinza y desliza para cambiar de pestaña · 👍 para volver a la huerta');
        G.raf = requestAnimationFrame(loop);
    }

    function loop() {
        if (!G.armed) return;
        G.raf = requestAnimationFrame(loop);
        var v = G.video;
        if (!v || v.readyState < 2 || v.currentTime === G.lastVideoTime) return;
        G.lastVideoTime = v.currentTime;
        var ts = Math.max(Math.round(performance.now()), G.lastTs + 1); G.lastTs = ts;
        var res;
        try { res = G.landmarker.detectForVideo(v, ts); } catch (e) { return; }
        var lm = res && res.landmarks && res.landmarks[0];
        var hd = res && (res.handedness || res.handednesses);
        var handedness = hd && hd[0] && hd[0][0] ? hd[0][0].categoryName : null;
        var aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
        var out = G.controller.update({ landmarks: lm, handedness: handedness, t: ts, aspect: aspect });
        var dir = G.swipe.update({ pinching: !!out.offset, x: out.offset ? out.offset.x : null });
        if (dir === 'next') changeTab(1);
        else if (dir === 'prev') changeTab(-1);
        // Pulgar arriba 👍 sostenido ~1 s: volver a Street View (la huerta).
        var m = lm && lm.length >= 21 ? CORE.measure(lm, aspect) : null;
        var up = m && m.pinch > CORE.DEFAULTS.pinchOpen && m.indexDown && m.middleDown && m.ringDown && m.pinkyDown &&
            m.thumbUp >= CORE.DEFAULTS.thumbUpMin && m.thumbVertical;
        if (up) { if (!G.upSince) G.upSince = ts; else if (ts - G.upSince >= 1000) { G.upSince = 0; goBack(); } }
        else G.upSince = 0;
    }

    function goBack() {
        if (G.leaving) return; G.leaving = true;
        flash('Volviendo a la huerta…', 'persist');
        disarm();
        var fx = doc.getElementById('fromAdminFx');
        if (!fx) { fx = doc.createElement('div'); fx.id = 'fromAdminFx'; fx.innerHTML = '<span class="fa-ring"></span><span class="fa-ring fa-ring-2"></span><b class="fa-label">Volviendo a la huerta</b>'; doc.body.appendChild(fx); }
        doc.body.classList.add('from-admin');
        var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () { root.location.href = 'admin.html'; }, reduce ? 0 : 640);
    }

    function disarm() {
        G.armed = false;
        if (G.raf) cancelAnimationFrame(G.raf); G.raf = 0;
        if (G.landmarker) { try { G.landmarker.close(); } catch (e) {} G.landmarker = null; }
        if (G.stream) { G.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); G.stream = null; }
        if (G.video) { try { G.video.pause(); } catch (e) {} G.video.srcObject = null; G.video.remove(); G.video = null; }
    }

    // Flechas del teclado: respaldo sin cámara.
    doc.addEventListener('keydown', function (e) {
        if (e.target && (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
        if (e.key === 'ArrowRight') { changeTab(1); }
        else if (e.key === 'ArrowLeft') { changeTab(-1); }
    });

    root.AvotexAdminGestos = { arm: arm, changeTab: changeTab, _setDeps: function (d) { G.deps = d; }, _state: function () { return { armed: G.armed }; } };
    root.addEventListener('pagehide', disarm);
    function autoArm() { if (AUTO) arm(); }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', autoArm); else autoArm();
})(window, document);

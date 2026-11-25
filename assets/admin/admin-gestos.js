/*
 * AVOTEX — gestos en el Panel Administrador (avotex-admin.html).
 *
 * La cámara se enciende sola al cargar (la primera vez el navegador pide permiso; en el equipo del
 * stand queda recordado). El pulgar abajo 👎 (dislike) sostenido ~1 s regresa a Street View.
 * Las pestañas ya NO se recorren con gestos ni con flechas: quedan fijas.
 *
 * ScreenX: si la URL trae ?sx=left|center|right (al llegar desde ScreenX), cada pantalla muestra una
 * vista FIJA: central = Dashboard, izquierda = Huertas, derecha = Analíticas. Solo la central usa la
 * cámara; su pulgar abajo 👎 regresa las tres a Street View (BroadcastChannel).
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

    // Misma webcam y misma orientación que eligió el usuario en la calibración de Street View
    // (avotex-gestos.js guarda { invertX, deviceId } en esta clave; mismo origen = mismo localStorage).
    // Antes se abría siempre la cámara predeterminada: en el stand (ScreenX) esa es la integrada de la
    // laptop, no la webcam USB que mira al presentador, y la mano nunca se detectaba.
    var SETTINGS_KEY = 'avotex_gestos_ajustes';
    function savedSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {}; } catch (e) { return {}; }
    }
    function gestureConfig() {
        var cfg = {}, k;
        for (k in CORE.DEFAULTS) if (Object.prototype.hasOwnProperty.call(CORE.DEFAULTS, k)) cfg[k] = CORE.DEFAULTS[k];
        cfg.invertX = !!savedSettings().invertX;
        return cfg;
    }

    var G = { armed: false, loading: false, stream: null, video: null, landmarker: null,
        raf: 0, cameraNote: '', lastVideoTime: -1, lastTs: 0, controller: null, statusEl: null, deps: null, lastDir: 0, downSince: 0, leaving: false, retries: 0, tapArmed: false, flashUntil: 0 };
    // Respaldo: si la cámara no arrancó sola (bloqueada o navegador exigente), un toque la activa.
    function armOnTap() {
        if (G.tapArmed) return; G.tapArmed = true;
        var h = function () { doc.removeEventListener('pointerdown', h, true); doc.removeEventListener('touchstart', h, true); G.tapArmed = false; G.loading = false; arm(); };
        doc.addEventListener('pointerdown', h, true);
        doc.addEventListener('touchstart', h, true);
    }
    // Aviso visible y tocable para encender la cámara.
    function tapPrompt(text) {
        setStatus(text || '👋 Toca aquí para activar los gestos', 'go');
        if (G.statusEl) {
            G.statusEl.style.pointerEvents = 'auto';
            G.statusEl.style.cursor = 'pointer';
            G.statusEl.onclick = function () { G.statusEl.onclick = null; G.statusEl.style.pointerEvents = 'none'; G.loading = false; arm(); };
        }
        armOnTap();
    }
    function getUM(c) { return (G.deps && G.deps.getUserMedia ? G.deps.getUserMedia : navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices))(c); }
    // Abre la webcam guardada; si no acepta los límites, la misma sin límites; si ya no está, la predeterminada.
    async function openCamera() {
        var base = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } };
        var want = savedSettings().deviceId || null;
        if (!want) return getUM({ audio: false, video: base });
        var withId = { deviceId: { exact: want } }, k;
        for (k in base) withId[k] = base[k];
        try { return await getUM({ audio: false, video: withId }); }
        catch (err) {
            if (err && err.name === 'OverconstrainedError') {
                try { return await getUM({ audio: false, video: { deviceId: { exact: want } } }); } catch (err2) { err = err2; }
            }
            if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
                G.cameraNote = 'La webcam elegida no está conectada; se usa la predeterminada.';
                return getUM({ audio: false, video: base });
            }
            throw err;
        }
    }
    function mkLM() { return G.deps && G.deps.makeLandmarker ? G.deps.makeLandmarker() : makeLandmarker(); }

    // ───────── ScreenX: tres pantallas, una vista fija en cada una ─────────
    var FIXED_VIEW = { center: 'dashboard', left: 'huertas', right: 'analiticas' };
    var SX = { role: null, ch: null };
    (function () {
        var m = /[?&]sx=(left|center|right)/.exec(root.location.search || '');
        SX.role = m ? m[1] : null;
        if (!SX.role || typeof root.BroadcastChannel !== 'function') return;
        var email = '';
        try { email = localStorage.getItem('avotex_email') || ''; } catch (e) {}
        try {
            SX.ch = new root.BroadcastChannel('avotex-admin-sx:' + email);
            SX.ch.onmessage = function (ev) {
                var d = ev && ev.data; if (!d) return;
                if (d.t === 'back') goBack(true);
            };
        } catch (e) { SX.ch = null; }
    })();

    // Muestra la vista fija de esta pantalla (hace clic en el botón del menú existente).
    function applyTab() {
        if (SX.role == null) return true;
        var btn = doc.querySelector('#nav button[data-view="' + FIXED_VIEW[SX.role] + '"]');
        if (!btn) return false;
        if (!btn.classList.contains('on')) btn.click();
        return true;
    }
    // Espera a que el menú exista (lo arma app.js tras el login) y fija la pestaña inicial.
    function waitNavThenApply() {
        if (SX.role == null) return;
        var tries = 0;
        var iv = setInterval(function () {
            if (applyTab() || ++tries > 200) clearInterval(iv);
        }, 60);
    }

    // ───────── estado visible (como la barra de Street View) ─────────
    // Muestra en vivo si la cámara te capta: «Buscando mano», «Mano detectada», «… · pinza», etc.
    var LEG = {
        loading: 'Preparando gestos…',
        searching: 'Buscando mano',
        hand: 'Mano detectada · 👎 para volver a la huerta',
        holding: 'Mano detectada · 👎 para volver a la huerta',
        turning: 'Mano detectada · 👎 para volver a la huerta',
        blocked: 'Mano detectada · 👎 para volver a la huerta',
        thumb: 'Pulgar abajo… (sostén para volver)'
    };
    var lastStatus = '';
    function setStatus(text, kind) {
        if (!G.statusEl) {
            var el = doc.createElement('div');
            el.id = 'adminGestoEstado';
            el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;' +
                'font:700 13px/1.3 Inter,system-ui,sans-serif;padding:9px 16px;border-radius:999px;' +
                'background:rgba(7,20,13,.9);color:#eafff0;border:1px solid rgba(185,246,47,.45);' +
                'box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:0;transition:opacity .18s;pointer-events:none;' +
                'display:flex;align-items:center;gap:9px;max-width:calc(100vw - 32px);';
            doc.body.appendChild(el); G.statusEl = el;
        }
        var c = kind === 'error' ? '#f2766b' : (kind === 'go' ? '#b9f62f' : (text === 'Buscando mano' ? '#7dd3fc' : '#b9f62f'));
        G.statusEl.dataset.k = kind || '';
        G.statusEl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:' + c + ';box-shadow:0 0 10px ' + c + '"></span><span></span>';
        G.statusEl.lastChild.textContent = text || '';
        G.statusEl.style.opacity = text ? '1' : '0';
    }
    // flash: un aviso breve (p. ej. «Siguiente: Usuarios»); después vuelve el estado en vivo.
    function flash(text, kind, ms) {
        setStatus(text, kind || 'go');
        G.flashUntil = performance.now() + (ms || 1500);
    }
    // Estado en vivo desde el controlador (si no hay un flash activo).
    function liveStatus(st) {
        if (performance.now() < G.flashUntil) return;
        var txt = LEG[st] || '';
        if (txt && txt !== lastStatus) { lastStatus = txt; setStatus(txt, st === 'searching' ? 'searching' : ''); }
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
        setStatus('Preparando gestos…', 'go');
        var stream;
        try {
            stream = await Promise.race([
                openCamera(),
                new Promise(function (_, rej) { setTimeout(function () { var e = new Error('timeout'); e.name = 'TimeoutError'; rej(e); }, 8000); })
            ]);
            G.landmarker = await mkLM();
        } catch (e) {
            G.loading = false;
            if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
            var n = e && e.name;
            // La cámara puede estar ocupada un instante justo al llegar de Street View: se reintenta.
            if ((n === 'NotReadableError' || n === 'AbortError') && G.retries < 4) {
                G.retries++;
                setTimeout(arm, 700);
            } else if (n === 'NotAllowedError' || n === 'SecurityError') {
                tapPrompt('Permiso de cámara: toca aquí y permite la cámara');
            } else if (n === 'TimeoutError' && doc.hasFocus && !doc.hasFocus()) {
                // Algunos navegadores esperan a que la ventana tenga el foco para dar la cámara (en ScreenX
                // el foco suele quedar en otra pantalla): se reintenta en cuanto esta ventana lo recibe.
                tapPrompt('👋 Toca esta pantalla para activar los gestos');
                root.addEventListener('focus', function onFocus() { root.removeEventListener('focus', onFocus); if (!G.armed) { G.loading = false; arm(); } });
            } else {
                tapPrompt('👋 Toca aquí para activar los gestos');
            }
            return;
        }
        G.stream = stream;
        var v = doc.createElement('video');
        v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
        v.srcObject = stream; doc.body.appendChild(v); G.video = v;
        try { await v.play(); } catch (e) { /* al primer frame */ }
        var cfg = gestureConfig();
        G.controller = CORE.createController(cfg);
        G.armed = true; G.loading = false; G.retries = 0; G.flashUntil = 0; lastStatus = '';
        if (G.statusEl) { G.statusEl.style.pointerEvents = 'none'; G.statusEl.onclick = null; }
        if (G.cameraNote) flash(G.cameraNote, 'error', 3500);
        else setStatus('Buscando mano', 'searching'); // de aquí lo toma el estado en vivo del bucle
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
        // Pulgar abajo 👎 (dislike) sostenido ~1 s: volver a Street View (la huerta).
        var m = lm && lm.length >= 21 ? CORE.measure(lm, aspect) : null;
        var down = m && m.pinch > CORE.DEFAULTS.pinchOpen && m.indexDown && m.middleDown && m.ringDown && m.pinkyDown &&
            m.thumbDown >= CORE.DEFAULTS.thumbUpMin && m.thumbVerticalDown;
        if (down) { if (!G.downSince) G.downSince = ts; else if (ts - G.downSince >= 1000) { G.downSince = 0; goBack(); } }
        else G.downSince = 0;
        // Leyenda en vivo: muestra si la cámara te capta la mano y la pinza.
        liveStatus(down ? 'thumb' : out.status);
    }

    function goBack(remote) {
        if (G.leaving) return; G.leaving = true;
        if (!remote && SX.role != null && SX.ch) { try { SX.ch.postMessage({ t: 'back' }); } catch (e) {} }
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

    root.AvotexAdminGestos = { arm: arm, disarm: disarm, role: function () { return SX.role; }, _setDeps: function (d) { G.deps = d; }, _state: function () { return { armed: G.armed }; } };
    root.addEventListener('pagehide', disarm);
    // La cámara solo la usa la pantalla CENTRAL (o Vista normal sin rol). Las laterales solo siguen.
    function boot() {
        waitNavThenApply();
        if (AUTO && (SX.role == null || SX.role === 'center')) {
            arm();
            // Si en unos segundos no armó (permiso, autoplay, cámara ocupada), muestra el botón visible.
            setTimeout(function () { if (!G.armed && !G.loading) tapPrompt('👋 Toca aquí para activar los gestos'); }, 3000);
        }
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);

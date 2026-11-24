/*
 * AVOTEX — entrada por gesto en la página de login (dashboard.html).
 *
 * Para exponer el proyecto: sin escribir correo ni contraseña. Al abrir la página se enciende la
 * cámara (la primera vez el navegador pide permiso; en el equipo del stand se concede una vez y
 * queda recordado). Para entrar: mostrar el PULGAR ARRIBA 👍 frente a la webcam ~1 s. Con eso se
 * inicia sesión DE VERDAD con las credenciales de abajo (no se salta la autenticación de Firebase)
 * y se entra al Panel Administrador.
 *
 * ⚠ SEGURIDAD — LÉEME:
 *   - Esto es TEMPORAL, solo para la demo. Las credenciales quedan visibles en el código fuente de
 *     la página: cualquiera que abra «Ver código fuente» las ve. Úsalo solo en el stand y, al
 *     terminar el evento, borra este archivo, quita su <script> de dashboard.html y CAMBIA la
 *     contraseña de esta cuenta.
 *   - Para quitarlo: borra el <script src="avotex-acceso-gestos.js"> de dashboard.html.
 */
(function (root, doc) {
    'use strict';

    // ───────── lo único que hay que tocar ─────────
    var ACCESO = {
        email: 'vexmxoficial@gmail.com',
        password: 'avotex',
        destino: 'admin.html'          // Experiencia inmersiva (la de los gestos). Cambiar a 'avotex-admin.html' para el Panel Administrador.
    };
    var PULGAR_MS = 1000;              // pulgar arriba sostenido para entrar
    var AUTO_ARMAR = root.AVOTEX_ACCESO_NOAUTO !== true;  // la cámara se enciende sola al cargar
    // ───────────────────────────────────────────────

    var CORE = root.AvotexGestosCore;
    if (!CORE) return; // el núcleo de gestos debe cargarse antes

    var MP_VERSION = '1.2.3';
    var MP_BASE = 'assets/vendor/mediapipe/tasks-vision-' + MP_VERSION + '/';
    var MODEL_URL = 'assets/vendor/mediapipe/models/hand_landmarker-float16-v1.task';
    function abs(p) { return new URL(p, doc.baseURI).href; }

    var G = {
        armed: false, loading: false, stream: null, video: null, landmarker: null,
        raf: 0, lastVideoTime: -1, lastTs: 0, holdSince: 0, lastPalm: null, entering: false,
        statusEl: null, deps: null
    };
    // Solo para pruebas automáticas: reemplaza cámara y modelo.
    function getUM(c) { return (G.deps && G.deps.getUserMedia ? G.deps.getUserMedia : navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices))(c); }
    function mkLM() { return G.deps && G.deps.makeLandmarker ? G.deps.makeLandmarker() : makeLandmarker(); }

    // ───────── estado discreto ─────────
    function status(text, kind) {
        if (!G.statusEl) {
            var el = doc.createElement('div');
            el.id = 'accesoGestoEstado';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;' +
                'font:600 12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
                'padding:7px 14px;border-radius:999px;background:rgba(9,24,17,.82);color:#f7f5e9;' +
                'border:1px solid rgba(185,246,47,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
                'box-shadow:0 6px 20px rgba(0,0,0,.35);opacity:0;transition:opacity .25s ease;pointer-events:none;' +
                'display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);text-align:center;';
            doc.body.appendChild(el);
            G.statusEl = el;
        }
        G.statusEl.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:' +
            (kind === 'error' ? '#f2766b' : (kind === 'ok' ? '#b9f62f' : '#7dd3fc')) + '"></span><span></span>';
        G.statusEl.lastChild.textContent = text || '';
        G.statusEl.style.opacity = text ? '1' : '0';
    }

    // ───────── cámara y modelo ─────────
    var scriptP = null;
    function loadBundle() {
        if (root.Vision && root.Vision.HandLandmarker) return Promise.resolve();
        if (scriptP) return scriptP;
        scriptP = new Promise(function (resolve, reject) {
            var sc = doc.createElement('script');
            sc.src = abs(MP_BASE + 'vision_bundle.js'); sc.async = true;
            sc.onload = resolve;
            sc.onerror = function () { scriptP = null; sc.remove(); reject(new Error('bundle')); };
            doc.head.appendChild(sc);
        });
        return scriptP;
    }
    async function makeLandmarker() {
        await loadBundle();
        var V = root.Vision;
        var fileset = await V.FilesetResolver.forVisionTasks(abs(MP_BASE + 'wasm'));
        try {
            return await V.HandLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: abs(MODEL_URL), delegate: 'GPU' },
                runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5
            });
        } catch (e) {
            return await V.HandLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: abs(MODEL_URL), delegate: 'CPU' },
                runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5
            });
        }
    }

    async function arm() {
        if (G.armed || G.loading) return;
        if (!root.isSecureContext) { status('El acceso por cámara necesita HTTPS o localhost.', 'error'); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('Este navegador no permite la cámara.', 'error'); return; }
        G.loading = true;
        status('Preparando acceso…');
        var stream;
        try {
            stream = await getUM({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } } });
            G.landmarker = await mkLM();
        } catch (e) {
            G.loading = false;
            if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
            var n = e && e.name;
            if (n === 'NotAllowedError' || n === 'SecurityError') status('Permiso de cámara denegado.', 'error');
            else if (n === 'NotFoundError') status('No se encontró una webcam.', 'error');
            else status('No se pudo preparar el acceso por gesto.', 'error');
            return;
        }
        G.stream = stream;
        var v = doc.createElement('video');
        v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
        v.srcObject = stream; doc.body.appendChild(v); G.video = v;
        try { await v.play(); } catch (e) { /* algunos navegadores reproducen al primer frame */ }
        G.armed = true; G.loading = false; G.holdSince = 0; G.lastPalm = null;
        status('👍 Pulgar arriba para entrar');
        G.raf = requestAnimationFrame(loop);
    }

    function disarm() {
        G.armed = false;
        if (G.raf) cancelAnimationFrame(G.raf); G.raf = 0;
        if (G.landmarker) { try { G.landmarker.close(); } catch (e) {} G.landmarker = null; }
        if (G.stream) { G.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); G.stream = null; }
        if (G.video) { try { G.video.pause(); } catch (e) {} G.video.srcObject = null; G.video.remove(); G.video = null; }
    }

    // Pulgar arriba: puño con los cuatro dedos doblados y el pulgar hacia arriba (como 👍).
    function isThumbUp(lm, aspect) {
        var m = CORE.measure(lm, aspect);
        return m.pinch > CORE.DEFAULTS.pinchOpen && m.indexDown && m.middleDown && m.ringDown && m.pinkyDown &&
            m.thumbUp >= CORE.DEFAULTS.thumbUpMin && m.thumbVertical;
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
        var aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
        if (!lm || lm.length < 21 || !isThumbUp(lm, aspect)) { G.holdSince = 0; G.lastPalm = null; return; }
        // Mano quieta: si se mueve mucho, se reinicia el conteo (entrada deliberada).
        var w = lm[0], mid = lm[9];
        var palm = { x: (w.x + mid.x) / 2, y: (w.y + mid.y) / 2 };
        if (G.lastPalm) {
            var dx = (palm.x - G.lastPalm.x) * aspect, dy = palm.y - G.lastPalm.y;
            if (Math.sqrt(dx * dx + dy * dy) > 0.06) { G.holdSince = 0; }
        }
        G.lastPalm = palm;
        var now = performance.now();
        if (!G.holdSince) { G.holdSince = now; return; }
        var held = now - G.holdSince;
        if (held >= PULGAR_MS) enter();
        else status('Mantén el pulgar arriba… ' + Math.max(0, Math.ceil((PULGAR_MS - held) / 1000)) + ' s', 'ok');
    }

    async function enter() {
        if (G.entering) return;
        G.entering = true;
        if (G.raf) cancelAnimationFrame(G.raf); G.raf = 0;
        status('Entrando…', 'ok');
        // Espera breve a que Firebase esté listo.
        for (var i = 0; i < 40 && (!root._signIn || !root._auth); i++) { await new Promise(function (r) { setTimeout(r, 100); }); }
        try {
            if (!root._signIn || !root._auth) throw new Error('firebase');
            await root._signIn(root._auth, ACCESO.email, ACCESO.password);
            try { localStorage.setItem('avotex_email', ACCESO.email); } catch (e) {}
            disarm();
            var go = typeof root.goTo === 'function' ? root.goTo : function (u) { root.location.replace(u); };
            go(ACCESO.destino);
        } catch (e) {
            G.entering = false;
            var code = e && e.code;
            if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/user-not-found') status('Las credenciales de acceso ya no son válidas.', 'error');
            else if (code === 'auth/network-request-failed') status('Sin conexión para iniciar sesión.', 'error');
            else status('No se pudo entrar. Intenta de nuevo.', 'error');
            G.raf = requestAnimationFrame(loop);
        }
    }

    root.AvotexAcceso = { arm: arm, _setDeps: function (d) { G.deps = d; }, _state: function () { return { armed: G.armed, entering: G.entering }; } };
    root.addEventListener('pagehide', disarm);
    // La cámara se enciende sola al cargar (salvo en pruebas, que inyectan cámara y luego llaman a arm()).
    function autoArm() { if (AUTO_ARMAR) arm(); }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', autoArm);
    else autoArm();
})(window, document);

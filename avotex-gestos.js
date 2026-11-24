/*
 * AVOTEX — control por gestos de mano para Street View (opcional, se activa con un clic).
 *
 * Flujo: webcam USB → <video> local → MediaPipe Hand Landmarker (en esta laptop) → gesto confirmado
 * (avotex-gestos-core.js) → acción existente de Street View (look/navigate de la panorámica) →
 * sincronización existente de ScreenX (pov_changed / pano_changed de la central).
 *
 * Reglas:
 *  - Solo funciona donde avotex-inmersiva.js lo permite: Vista normal o pantalla CENTRAL de ScreenX.
 *    Las laterales nunca piden la cámara ni cargan el modelo.
 *  - La cámara se pide solo al pulsar «Activar gestos», con audio: false. El video no se graba,
 *    no se guarda y no sale del navegador; entre ventanas solo viaja la cámara de Street View.
 *  - MediaPipe (JS, WASM y modelo) se carga la primera vez que se activa, desde el propio sitio:
 *    assets/vendor/mediapipe/. Quien usa mouse o teclado no descarga nada de esto.
 *  - Una sola sesión de cámara y un solo bucle. Desactivar, salir del modo, cerrar sesión o cerrar
 *    la ventana detienen las pistas de video y el bucle.
 *  - Perder el foco o la visibilidad, usar el mouse o el teclado sobre la vista, o cambiar de huerta
 *    detienen el giro al instante y exigen soltar la pinza y volver a tomarla.
 *  - Independiente de la capa three.js (avotex-escena3d.js): no comparten bucle ni contexto.
 *
 * Parámetros de sensibilidad: DEFAULTS en avotex-gestos-core.js. Para una prueba sin tocar el código,
 * se pueden sobrescribir antes de activar con window.AVOTEX_GESTOS_CONFIG = { maxYawSpeed: 80, … }.
 */
(function (root) {
    'use strict';

    var CORE = root.AvotexGestosCore;
    var MP_VERSION = '1.2.3';
    var MP_BASE = 'assets/vendor/mediapipe/tasks-vision-' + MP_VERSION + '/';
    var BUNDLE_URL = MP_BASE + 'vision_bundle.js';
    var WASM_DIR = MP_BASE + 'wasm';
    var MODEL_URL = 'assets/vendor/mediapipe/models/hand_landmarker-float16-v1.task';
    var SETTINGS_KEY = 'avotex_gestos_ajustes'; // solo invertX y la webcam elegida
    var STATUS_TEXT = {
        loading: 'Preparando gestos…',
        searching: 'Buscando mano',
        hand: 'Mano detectada',
        holding: 'Mano detectada · pinza',
        turning: 'Girando',
        v: 'Mano detectada',
        thumb: 'Pulgar arriba…',
        'scans-on': 'Mostrando escaneos',
        'scans-off': 'Volviendo a la huerta',
        'scans-busy': 'Escaneos abiertos · pulgar arriba para volver',
        blocked: 'Suelta la pinza para retomar',
        forward: 'Avanzando',
        'no-link': 'Sin camino hacia adelante',
        'links-loading': 'Cargando caminos…',
        paused: 'Gestos en pausa',
        error: ''
    };

    var G = {
        allowed: false,
        actions: null,
        active: false,
        starting: false,
        startToken: 0,
        stream: null,
        video: null,
        landmarker: null,
        delegate: null,
        loadPromise: null,
        controller: null,
        cfg: null,
        raf: 0,
        lastVideoTime: -1,
        lastInferAt: 0,
        lastTs: 0,
        lastStepAt: 0,
        flash: null,
        flashUntil: 0,
        status: null,
        preview: false,
        cameraNote: '',
        lastLandmarks: null,
        lastOut: null,
        inferCount: 0,
        inferMsAvg: 0,
        rate: 0,
        rateN: 0,
        rateAt: 0,
        settings: readSettings(),
        deps: null
    };

    function $(id) { return document.getElementById(id); }
    function abs(p) { return new URL(p, document.baseURI).href; }

    function readSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {}; } catch (e) { return {}; }
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ invertX: !!G.settings.invertX, deviceId: G.settings.deviceId || null })); } catch (e) { /* nada */ }
    }

    function buildConfig() {
        var over = root.AVOTEX_GESTOS_CONFIG || {};
        var cfg = Object.assign({}, CORE.DEFAULTS, over);
        if (typeof G.settings.invertX === 'boolean' && over.invertX === undefined) cfg.invertX = G.settings.invertX;
        return CORE.sanitize(cfg);
    }

    // ───────── dependencias (reemplazables solo en pruebas automáticas) ─────────

    var scriptPromise = null;
    function loadScript(src) {
        if (root.Vision && root.Vision.HandLandmarker) return Promise.resolve();
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { scriptPromise = null; s.remove(); reject(new Error('BUNDLE_LOAD')); };
            document.head.appendChild(s);
        });
        return scriptPromise;
    }

    var realDeps = {
        getUserMedia: function (constraints) { return navigator.mediaDevices.getUserMedia(constraints); },
        createLandmarker: async function () {
            await loadScript(abs(BUNDLE_URL));
            var V = root.Vision;
            var fileset = await V.FilesetResolver.forVisionTasks(abs(WASM_DIR));
            var options = function (delegate) {
                return {
                    baseOptions: { modelAssetPath: abs(MODEL_URL), delegate: delegate },
                    runningMode: 'VIDEO',
                    numHands: 1,
                    minHandDetectionConfidence: 0.6,
                    minHandPresenceConfidence: 0.6,
                    minTrackingConfidence: 0.5
                };
            };
            // delegate: 'CPU' (predeterminado), 'GPU' o 'auto' (GPU y, si falla, CPU). Ver DEFAULTS.delegate.
            var pref = (G.cfg && G.cfg.delegate) || 'CPU';
            if (pref === 'CPU') {
                return { landmarker: await V.HandLandmarker.createFromOptions(fileset, options('CPU')), delegate: 'CPU' };
            }
            try {
                var gpu = await V.HandLandmarker.createFromOptions(fileset, options('GPU'));
                return { landmarker: gpu, delegate: 'GPU' };
            } catch (e) {
                var cpu = await V.HandLandmarker.createFromOptions(fileset, options('CPU'));
                return { landmarker: cpu, delegate: 'CPU' };
            }
        }
    };
    function deps() { return G.deps || realDeps; }

    // ───────── interfaz ─────────

    function setStatus(kind, text) {
        G.status = kind;
        var el = $('gestureStatus');
        if (!el) return;
        var t = text != null ? text : (STATUS_TEXT[kind] || '');
        el.hidden = !t;
        el.textContent = t;
        el.className = 'gesture-status is-' + kind;
        var bar = $('gestureBar');
        if (bar) bar.dataset.state = kind;
    }

    function flash(kind, text, ms) {
        G.flash = { kind: kind, text: text };
        G.flashUntil = performance.now() + (ms || 1300);
        setStatus(kind, text);
    }

    function renderBar() {
        var bar = $('gestureBar');
        if (!bar) return;
        bar.hidden = !G.allowed;
        var on = G.active || G.starting;
        var btn = $('gestureToggle');
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('is-on', on);
        $('gestureToggleLabel').textContent = on ? 'Desactivar gestos' : 'Activar gestos';
        $('gesturePreviewBtn').hidden = !G.active;
        $('gesturePreviewBtn').setAttribute('aria-pressed', String(G.preview));
        if (!on && G.status !== 'error') setStatus(null, '');
    }

    function showError(message) {
        setStatus('error', message);
        renderBar();
    }

    function errorText(err) {
        var name = err && err.name;
        if (err && err.message === 'INSECURE') return 'Los gestos necesitan HTTPS o localhost.';
        if (err && err.message === 'UNSUPPORTED') return 'Este navegador no permite usar la webcam.';
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'Permiso de cámara denegado. Navega con mouse o flechas.';
        if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'No se encontró una webcam.';
        if (name === 'NotReadableError' || name === 'TrackStartError') return 'La webcam está ocupada por otra aplicación.';
        if (err && (err.message === 'BUNDLE_LOAD' || err.message === 'MODEL')) return 'No se pudo cargar el modelo de gestos.';
        return 'No se pudo iniciar el control por gestos.';
    }

    // ───────── activar / desactivar ─────────

    async function openCamera(cfg) {
        var want = G.settings.deviceId || null;
        var video = { width: { ideal: cfg.captureWidth }, height: { ideal: cfg.captureHeight }, frameRate: { ideal: 30, max: 30 } };
        if (want) video.deviceId = { exact: want };
        G.cameraNote = '';
        try {
            return await deps().getUserMedia({ audio: false, video: video });
        } catch (err) {
            if (!want) throw err;
            // Algunas webcams USB no aceptan el límite de fps o la resolución: se abre la MISMA
            // webcam sin esos límites antes de pensar en otra.
            if (err.name === 'OverconstrainedError') {
                try {
                    return await deps().getUserMedia({ audio: false, video: { deviceId: { exact: want } } });
                } catch (err2) { err = err2; }
            }
            // La webcam guardada ya no está conectada: se usa la predeterminada y se avisa.
            if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
                delete video.deviceId;
                var stream = await deps().getUserMedia({ audio: false, video: video });
                G.cameraNote = 'La webcam elegida no está disponible; se usa la predeterminada.';
                return stream;
            }
            throw err;
        }
    }

    function loadLandmarker() {
        if (G.landmarker) return Promise.resolve();
        if (!G.loadPromise) {
            G.loadPromise = deps().createLandmarker().then(function (r) {
                G.landmarker = r.landmarker;
                G.delegate = r.delegate;
            }, function (err) {
                G.loadPromise = null;
                var e = new Error(err && err.message === 'BUNDLE_LOAD' ? 'BUNDLE_LOAD' : 'MODEL');
                e.cause = err;
                throw e;
            });
        }
        return G.loadPromise;
    }

    async function enable() {
        if (!G.allowed || G.active || G.starting) return;
        var token = ++G.startToken;
        G.starting = true;
        G.cfg = buildConfig();
        renderBar();
        setStatus('loading');
        var stream = null;
        try {
            if (!root.isSecureContext) throw new Error('INSECURE');
            if (!G.deps && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw new Error('UNSUPPORTED');
            // Permiso de cámara y descarga del modelo en paralelo.
            var results = await Promise.all([openCamera(G.cfg), loadLandmarker()]);
            stream = results[0];
            if (token !== G.startToken || !G.allowed) { stopStream(stream); return; }
            await attachStream(stream);
            if (token !== G.startToken || !G.allowed) { stopStream(stream); detachVideo(); return; }
        } catch (err) {
            if (stream) stopStream(stream);
            G.starting = false;
            if (token !== G.startToken) return;
            console.warn('AVOTEX gestos:', err && (err.name || err.message), err);
            showError(errorText(err));
            return;
        }
        G.stream = stream;
        G.controller = CORE.createController(G.cfg);
        G.active = true;
        G.starting = false;
        G.lastVideoTime = -1;
        G.lastStepAt = performance.now();
        setStatus('searching');
        if (G.cameraNote) flash('searching', G.cameraNote, 5000);
        renderBar();
        fillCameraList();
        G.raf = requestAnimationFrame(loop);
    }

    async function attachStream(stream) {
        if (!G.video) {
            var v = document.createElement('video');
            v.muted = true;
            v.playsInline = true;
            v.setAttribute('playsinline', '');
            v.setAttribute('aria-hidden', 'true');
            v.className = 'gesture-video';
            G.video = v;
            placeVideo();
        }
        G.video.srcObject = stream;
        stream.getVideoTracks().forEach(function (tr) {
            tr.addEventListener('ended', onTrackEnded);
        });
        await G.video.play();
    }

    function onTrackEnded() {
        if (!G.active) return;
        disable({ keepStatus: true });
        showError('La webcam se desconectó. Navega con mouse o flechas.');
    }

    function stopStream(stream) {
        if (!stream) return;
        stream.getTracks().forEach(function (tr) {
            tr.removeEventListener && tr.removeEventListener('ended', onTrackEnded);
            try { tr.stop(); } catch (e) { /* nada */ }
        });
    }

    function detachVideo() {
        if (G.video) { try { G.video.pause(); } catch (e) { /* nada */ } G.video.srcObject = null; }
    }

    function disable(opts) {
        opts = opts || {};
        G.startToken++;
        G.starting = false;
        if (G.raf) cancelAnimationFrame(G.raf);
        G.raf = 0;
        if (G.controller) G.controller.cancel();
        G.controller = null;
        stopStream(G.stream);
        G.stream = null;
        detachVideo();
        G.active = false;
        G.lastLandmarks = null;
        setPreview(false);
        if (!opts.keepStatus) setStatus(null, '');
        renderBar();
    }

    // Libera el modelo (memoria y contexto) al salir de una vista donde se permiten gestos.
    function releaseModel() {
        if (G.landmarker) { try { G.landmarker.close(); } catch (e) { /* nada */ } }
        G.landmarker = null;
        G.loadPromise = null;
    }

    // ───────── bucle ─────────

    function loop(now) {
        if (!G.active) return;
        G.raf = requestAnimationFrame(loop);
        var v = G.video;
        var cfg = G.cfg;
        // Inferencia: solo con un fotograma nuevo, sin pasar de inferenceFps y, si el equipo es lento,
        // dejando libre al menos (1 - maxBusyShare) del hilo principal para Street View y la interfaz.
        var minGap = Math.max(1000 / cfg.inferenceFps, G.inferMsAvg / cfg.maxBusyShare) - 2;
        if (v && v.readyState >= 2 && v.currentTime !== G.lastVideoTime && now - G.lastInferAt >= minGap) {
            G.lastVideoTime = v.currentTime;
            G.lastInferAt = now;
            var ts = Math.max(Math.round(now), G.lastTs + 1); // detectForVideo exige marcas crecientes
            G.lastTs = ts;
            var t0 = performance.now();
            var res = null;
            try { res = G.landmarker.detectForVideo(v, ts); } catch (err) {
                console.warn('AVOTEX gestos: fallo de inferencia', err);
                disable({ keepStatus: true });
                showError('El modelo de gestos dejó de responder. Navega con mouse o flechas.');
                return;
            }
            var dt = performance.now() - t0;
            G.inferMsAvg = G.inferMsAvg ? G.inferMsAvg * 0.9 + dt * 0.1 : dt;
            G.inferCount++;
            G.rateN++;
            if (now - G.rateAt >= 1000) { G.rate = G.rateN * 1000 / (now - G.rateAt); G.rateN = 0; G.rateAt = now; }
            onResult(res, ts, v, minGap);
        }
        // Movimiento: se aplica en cada cuadro para que el giro sea suave; quieto = no se publica nada.
        var stepDt = Math.min(0.1, Math.max(0, (now - G.lastStepAt) / 1000));
        G.lastStepAt = now;
        if (G.controller) {
            var s = G.controller.step(stepDt);
            if (s.moving && G.actions && G.actions.canMove()) {
                if (Math.abs(s.yaw) > 0.005 || Math.abs(s.pitch) > 0.005) G.actions.look(s.yaw, s.pitch, cfg.pitchMin, cfg.pitchMax);
            }
        }
        if (G.preview) drawPreview();
    }

    function onResult(res, ts, v, expectedGapMs) {
        var lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
        var hd = res && (res.handedness || res.handednesses);
        var handedness = hd && hd[0] && hd[0][0] ? hd[0][0].categoryName : null;
        G.lastLandmarks = lm;
        var aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
        var out = G.controller.update({ landmarks: lm, handedness: handedness, t: ts, aspect: aspect, expectedGapMs: expectedGapMs });
        G.lastOut = out;
        if (out.command === 'scans') {
            // Pulgar arriba: muestra u oculta las imágenes de escaneo (en ScreenX, en las tres pantallas).
            var on = G.actions && G.actions.toggleScans ? G.actions.toggleScans() : null;
            if (on === true) flash('scans-on', STATUS_TEXT['scans-on'], 1600);
            else if (on === false) flash('scans-off', STATUS_TEXT['scans-off'], 1600);
            return;
        }
        if (out.command === 'forward') {
            if (G.actions && G.actions.scansOpen && G.actions.scansOpen()) { flash('scans-busy', STATUS_TEXT['scans-busy'], 2200); return; }
            var r = G.actions && G.actions.canMove() ? G.actions.forward() : 'unavailable';
            if (r === 'ok') flash('forward', STATUS_TEXT.forward, 1400);
            else if (r === 'loading') flash('links-loading', STATUS_TEXT['links-loading'], 1600);
            else flash('no-link', STATUS_TEXT['no-link'], 1800);
            return;
        }
        if (G.flash && performance.now() < G.flashUntil) return;
        G.flash = null;
        if (out.status !== G.status) setStatus(out.status);
    }

    /* Interrumpe un giro (mouse, teclado, botonera, foco, cambio de huerta). */
    function interrupt(reason) {
        if (!G.active || !G.controller) return;
        var st = G.controller.state();
        G.controller.cancel();
        if (st.pinching || reason === 'blur' || reason === 'hidden') setStatus('blocked');
    }

    // ───────── vista previa de calibración ─────────

    /*
     * El <video> siempre está renderizado (algunos navegadores dejan de entregar fotogramas de un
     * video con display: none): con la vista previa cerrada vive en un contenedor invisible de 2 px.
     */
    function placeVideo() {
        if (!G.video) return;
        var hold = $('gestureVideoHold');
        if (!hold) {
            hold = document.createElement('div');
            hold.id = 'gestureVideoHold';
            hold.className = 'gesture-video-hold';
            hold.setAttribute('aria-hidden', 'true');
            document.body.appendChild(hold);
        }
        var target = G.preview ? $('gestureVideoHost') : hold;
        if (target && G.video.parentNode !== target) {
            target.appendChild(G.video);
            if (G.video.srcObject && G.video.paused) { var pr = G.video.play(); if (pr && pr.catch) pr.catch(function () {}); }
        }
    }

    function setPreview(on) {
        G.preview = !!on && G.active;
        var p = $('gesturePreview');
        if (p) p.hidden = !G.preview;
        placeVideo();
        var b = $('gesturePreviewBtn');
        if (b) b.setAttribute('aria-pressed', String(G.preview));
        if (G.preview) {
            $('gestureInvert').checked = !!G.cfg.invertX;
            fillCameraList();
        }
    }

    function currentDeviceId() {
        var tr = G.stream && G.stream.getVideoTracks()[0];
        return tr && tr.getSettings ? tr.getSettings().deviceId || null : null;
    }

    async function listCameras() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
        return (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === 'videoinput'; });
    }

    async function fillCameraList() {
        var sel = $('gestureCamera');
        if (!sel) return;
        try {
            var devices = await listCameras();
            var current = currentDeviceId();
            sel.innerHTML = devices.map(function (d, i) {
                var label = (d.label || 'Cámara ' + (i + 1)).replace(/[<>&"]/g, '');
                return '<option value="' + d.deviceId.replace(/"/g, '') + '"' + (d.deviceId === current ? ' selected' : '') + '>' + label + '</option>';
            }).join('');
            var note = $('gestureCameraNote');
            if (note) {
                var text = G.cameraNote || (devices.length < 2
                    ? 'Solo se ve una webcam. Si conectaste otra, revisa que Windows la reconozca (app Cámara); aparecerá aquí sola.'
                    : '');
                note.textContent = text;
                note.hidden = !text;
            }
        } catch (e) { /* la lista es solo una ayuda */ }
    }

    /*
     * Se conectó o desconectó una cámara: se actualiza la lista y, si la webcam que la persona eligió
     * acaba de volver (por ejemplo, la USB), se cambia a ella sin tener que desactivar los gestos.
     */
    async function onDeviceChange() {
        if (!G.active) return;
        await fillCameraList();
        var want = G.settings.deviceId;
        if (!want || want === currentDeviceId() || G.starting) return;
        try {
            var back = (await listCameras()).some(function (d) { return d.deviceId === want; });
            if (back) switchCamera(want);
        } catch (e) { /* nada */ }
    }

    async function switchCamera(deviceId) {
        G.settings.deviceId = deviceId || null;
        saveSettings();
        if (!G.active) return;
        var keepPreview = G.preview;
        disable();
        await enable();
        if (keepPreview) setPreview(true);
    }

    function drawPreview() {
        var c = $('gestureOverlay');
        var v = G.video;
        if (!c || !v || !v.videoWidth) return;
        var w = c.clientWidth, h = c.clientHeight;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        var ctx = c.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        // Coordenadas en espejo, igual que el video de la vista previa.
        var X = function (x) { return (1 - x) * w; }, Y = function (y) { return y * h; };
        var st = G.controller ? G.controller.state() : null;
        if (st && st.neutral) {
            var dzx = G.cfg.deadZoneX * w, dzy = G.cfg.deadZoneY * h;
            ctx.strokeStyle = 'rgba(185,246,47,0.8)';
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(X(st.neutral.x) - dzx, Y(st.neutral.y) - dzy, dzx * 2, dzy * 2);
            ctx.setLineDash([]);
            if (st.pos) {
                ctx.beginPath();
                ctx.moveTo(X(st.neutral.x), Y(st.neutral.y));
                ctx.lineTo(X(st.pos.x), Y(st.pos.y));
                ctx.stroke();
            }
        }
        var lm = G.lastLandmarks;
        if (lm) {
            ctx.fillStyle = st && st.pinching ? '#b9f62f' : '#f7f5e9';
            lm.forEach(function (p, i) {
                ctx.beginPath();
                ctx.arc(X(p.x), Y(p.y), i === 4 || i === 8 ? 4 : 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        var dir = $('gestureDirection');
        if (dir) {
            var r = st ? st.rate : { yaw: 0, pitch: 0 };
            var parts = [];
            if (r.yaw > 1) parts.push('→ derecha'); else if (r.yaw < -1) parts.push('← izquierda');
            if (r.pitch > 1) parts.push('↑ arriba'); else if (r.pitch < -1) parts.push('↓ abajo');
            dir.textContent = parts.join('  ');
        }
        var meta = $('gestureMeta');
        if (meta && G.inferCount % 10 === 0) {
            meta.textContent = 'MediaPipe ' + MP_VERSION + ' · ' + (G.delegate || '') + ' · ' + v.videoWidth + '×' + v.videoHeight +
                ' · ' + G.cfg.inferenceFps + ' inferencias/s máx · ' + G.inferMsAvg.toFixed(1) + ' ms por inferencia' +
                ' · ' + G.rate.toFixed(1) + ' inferencias/s reales';
        }
    }

    // ───────── eventos ─────────

    function isNavKey(e) {
        return /^(Arrow(Up|Down|Left|Right)|PageUp|PageDown|Home|End|\+|-|=|_)$/.test(e.key) || /^[wasdWASD]$/.test(e.key);
    }

    function bind() {
        var toggle = $('gestureToggle');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
            if (G.active || G.starting) disable(); else enable();
        });
        $('gesturePreviewBtn').addEventListener('click', function () { setPreview(!G.preview); });
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-gesture="close-preview"]')) setPreview(false);
        });
        $('gestureCamera').addEventListener('change', function (e) { switchCamera(e.target.value); });
        // Webcam USB conectada con la página abierta: sin esto la lista se quedaba solo con la integrada.
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
        }
        $('gestureInvert').addEventListener('change', function (e) {
            G.settings.invertX = !!e.target.checked;
            saveSettings();
            G.cfg = buildConfig();
            if (G.active) G.controller = CORE.createController(G.cfg);
        });
        // Mouse o teclado sobre la panorámica o la botonera: la entrada manual manda.
        document.addEventListener('pointerdown', function (e) {
            if (e.target.closest && e.target.closest('#svPano, #svNav')) interrupt('manual');
        }, true);
        document.addEventListener('wheel', function (e) {
            if (e.target.closest && e.target.closest('#svPano')) interrupt('manual');
        }, { capture: true, passive: true });
        document.addEventListener('keydown', function (e) {
            if (isNavKey(e) && !(e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) interrupt('manual');
        }, true);
        // Ventana sin foco u oculta: alto inmediato y nueva pinza obligatoria.
        root.addEventListener('blur', function () { interrupt('blur'); });
        document.addEventListener('visibilitychange', function () { if (document.hidden) interrupt('hidden'); });
        root.addEventListener('pagehide', function () { disable(); });
    }

    // ───────── API para avotex-inmersiva.js ─────────

    function setContext(ctx) {
        ctx = ctx || {};
        if (ctx.actions) G.actions = ctx.actions;
        var allowed = !!ctx.allowed;
        if (allowed === G.allowed) { renderBar(); return; }
        G.allowed = allowed;
        if (!allowed) {
            disable();
            releaseModel();
            setStatus(null, '');
        }
        renderBar();
    }

    bind();

    root.AvotexGestos = {
        setContext: setContext,
        interrupt: interrupt,
        enable: enable,
        disable: disable,
        isActive: function () { return G.active; },
        // Diagnóstico y pruebas automáticas.
        _debug: function () {
            return {
                allowed: G.allowed, active: G.active, starting: G.starting, status: G.status, delegate: G.delegate,
                modelLoaded: !!G.landmarker, inferCount: G.inferCount, inferMsAvg: G.inferMsAvg,
                tracks: G.stream ? G.stream.getTracks().map(function (t) { return t.readyState; }) : [],
                controller: G.controller ? G.controller.state() : null, cfg: G.cfg
            };
        },
        _setDeps: function (d) { G.deps = d; }
    };
})(window);

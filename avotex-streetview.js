/*
 * AVOTEX — Street View de Google Maps (Maps JavaScript API).
 *
 * Reglas de costo y uso:
 *  - Google cobra cada vez que se crea un StreetViewPanorama ("Dynamic Street View").
 *    Por eso se crea UNA sola instancia por ventana y después solo se cambia el
 *    panorama con setPano(); al cambiar de huerta o de modalidad se reutiliza.
 *  - La búsqueda de cobertura (StreetViewService.getPanorama) no se cobra, pero se
 *    hace una sola vez por huerta y se guarda en memoria.
 *  - No hay reintentos automáticos infinitos: los errores se muestran y el usuario decide.
 *
 * La clave de Google NO vive en el repositorio. Se obtiene de:
 *  1) /api/maps-config (función de Vercel que lee la variable GOOGLE_MAPS_API_KEY), o
 *  2) avotex-maps.local.js (archivo local ignorado por git, solo para desarrollo).
 */
(function (root) {
    'use strict';

    var SX = root.AvotexScreenX;
    var LOAD_TIMEOUT_MS = 15000;
    var CONFIG_TIMEOUT_MS = 5000;

    var loadPromise = null;
    var authFailed = false;
    var authListeners = [];
    var panoCache = {}; // huertaId → resultado de la búsqueda (incluye "sin cobertura")

    function makeError(code, detail) {
        var e = new Error(code);
        e.code = code;
        if (detail) e.detail = detail;
        return e;
    }

    /* Google llama a esta función global cuando rechaza la clave (dominio, API desactivada, facturación…). */
    var previousAuthFailure = root.gm_authFailure;
    root.gm_authFailure = function () {
        authFailed = true;
        authListeners.forEach(function (fn) { try { fn(makeError('AUTH')); } catch (e) { /* nada */ } });
        if (typeof previousAuthFailure === 'function') previousAuthFailure();
    };

    function onAuthFailure(fn) {
        authListeners.push(fn);
        if (authFailed) fn(makeError('AUTH'));
        return function () { authListeners = authListeners.filter(function (f) { return f !== fn; }); };
    }

    function withTimeout(promise, ms, code) {
        return new Promise(function (resolve, reject) {
            var t = setTimeout(function () { reject(makeError(code)); }, ms);
            promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
        });
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { s.remove(); reject(makeError('NO_LOCAL_CONFIG')); };
            document.head.appendChild(s);
        });
    }

    async function getConfig() {
        if (root.AVOTEX_MAPS_CONFIG && root.AVOTEX_MAPS_CONFIG.apiKey) return root.AVOTEX_MAPS_CONFIG;

        // 1) Producción: función de Vercel.
        try {
            var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG_TIMEOUT_MS);
            var res = await fetch('/api/maps-config', { cache: 'no-store', credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined });
            clearTimeout(timer);
            if (res.ok && (res.headers.get('content-type') || '').indexOf('application/json') !== -1) {
                var json = await res.json();
                if (json && typeof json.apiKey === 'string' && json.apiKey) return json;
            }
        } catch (e) { /* sigue con el respaldo local */ }

        // 2) Desarrollo: archivo local ignorado por git.
        try {
            await loadScript('avotex-maps.local.js');
            if (root.AVOTEX_MAPS_CONFIG && root.AVOTEX_MAPS_CONFIG.apiKey) return root.AVOTEX_MAPS_CONFIG;
        } catch (e) { /* sin archivo local */ }

        throw makeError('NO_KEY');
    }

    /* Cargador oficial de Google ("inline bootstrap loader"), sin la clave escrita en el código. */
    function installBootstrap(params) {
        /* eslint-disable */
        (function (g) { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = function () { return h || (h = new Promise(async function (f, n) { await (a = m.createElement("script")); e.set("libraries", [].concat(Array.from(r)) + ""); for (k in g) e.set(k.replace(/[A-Z]/g, function (t) { return "_" + t[0].toLowerCase(); }), g[k]); e.set("callback", c + ".maps." + q); a.src = "https://maps." + c + "apis.com/maps/api/js?" + e; d[q] = f; a.onerror = function () { return h = n(Error(p + " could not load.")); }; a.nonce = (m.querySelector("script[nonce]") || {}).nonce || ""; m.head.append(a); })); }; d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = function (f) { var n = Array.prototype.slice.call(arguments, 1); return r.add(f) && u().then(function () { return d[l].apply(d, [f].concat(n)); }); }; })(params);
        /* eslint-enable */
    }

    /* Carga Google Maps una sola vez por ventana. */
    function load() {
        if (loadPromise) return loadPromise;
        loadPromise = (async function () {
            if (authFailed) throw makeError('AUTH');
            var cfg = await getConfig();
            installBootstrap({ key: cfg.apiKey, v: cfg.version || 'quarterly', language: 'es', region: 'MX' });
            var libs = await withTimeout(Promise.all([
                root.google.maps.importLibrary('streetView'),
                root.google.maps.importLibrary('core')
            ]), LOAD_TIMEOUT_MS, 'TIMEOUT').catch(function (e) {
                throw e && e.code ? e : makeError('LOAD_FAILED', e && e.message);
            });
            if (authFailed) throw makeError('AUTH');
            return { streetView: libs[0], core: libs[1] };
        })();
        // Si falla, se permite volver a intentar solo cuando el usuario lo pida (recargando).
        loadPromise.catch(function () { /* el llamador muestra el error */ });
        return loadPromise;
    }

    /*
     * Busca el panorama exterior más cercano a la huerta (radio de 1 km).
     * Resultado: { status: 'OK', pano, latLng, imageDate, copyright, description, placement }
     *         o  { status: 'NO_LOCATION' | 'ZERO_RESULTS' }.
     */
    async function resolveHuerta(huerta) {
        var id = huerta && huerta.id;
        if (id && panoCache[id]) return panoCache[id];

        var target = SX.huertaTarget(huerta);
        if (!target) {
            var noLoc = { status: 'NO_LOCATION' };
            if (id) panoCache[id] = noLoc;
            return noLoc;
        }

        var libs = await load();
        var svc = new libs.streetView.StreetViewService();
        try {
            var res = await svc.getPanorama({
                location: { lat: target.lat, lng: target.lng },
                radius: SX.STREETVIEW_SEARCH_RADIUS_M,
                preference: libs.streetView.StreetViewPreference.NEAREST,
                sources: [libs.streetView.StreetViewSource.OUTDOOR]
            });
            var d = res.data;
            var latLng = { lat: d.location.latLng.lat(), lng: d.location.latLng.lng() };
            var result = {
                status: 'OK',
                target: { lat: target.lat, lng: target.lng, source: target.source },
                pano: d.location.pano,
                latLng: latLng,
                imageDate: d.imageDate || null,
                copyright: d.copyright || null,
                description: d.location.description || null,
                placement: SX.describePanoramaPlacement(target, latLng)
            };
            if (id) panoCache[id] = result;
            return result;
        } catch (e) {
            var code = e && (e.code || '');
            if (String(code).indexOf('ZERO_RESULTS') !== -1 || String(e && e.message).indexOf('ZERO_RESULTS') !== -1) {
                var none = { status: 'ZERO_RESULTS', target: { lat: target.lat, lng: target.lng, source: target.source } };
                if (id) panoCache[id] = none;
                return none;
            }
            if (authFailed) throw makeError('AUTH');
            throw makeError('SEARCH_FAILED', e && e.message); // UNKNOWN_ERROR u otro: no se guarda en caché
        }
    }

    /*
     * Escenario de Street View de una ventana.
     *  - primary=true (Vista normal y pantalla central): todos los controles de Google,
     *    incluida la dirección y la fecha de la imagen.
     *  - primary=false (pantallas laterales de ScreenX): flechas, clic para avanzar, brújula
     *    y zoom; sin dirección ni fecha para no repetirlas en tres monitores.
     * Todas las pantallas son interactivas. `onCamera` recibe cada cambio de cámara y
     * `user: true` cuando lo provocó una persona en esta ventana (no una sincronización).
     */
    var USER_WINDOW_MS = 1500;
    var TURN_DURATION_MS = 380;

    function createStage(el, opts) {
        opts = opts || {};
        var panorama = null;
        var listeners = [];
        var interactive = opts.interactive !== false;
        var primary = opts.primary !== false;
        var applying = 0;
        var rafPending = false;
        var lastUserAt = 0;
        var turnAnim = null;
        var handlers = { camera: opts.onCamera || null, status: opts.onStatus || null, pano: opts.onPano || null, links: opts.onLinks || null };
        var raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : function (f) { return setTimeout(f, 16); };
        var caf = root.cancelAnimationFrame ? root.cancelAnimationFrame.bind(root) : clearTimeout;

        // Cualquier gesto de la persona sobre el panorama (arrastrar, rueda, teclado, tocar).
        function markUser() { lastUserAt = Date.now(); }
        // Un gesto de la persona también detiene un giro animado en curso.
        function onGesture() { stopTurn(); markUser(); }
        ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (evName) {
            el.addEventListener(evName, onGesture, { passive: true, capture: true });
        });

        function panoramaOptions(libs) {
            var CP = libs.core.ControlPosition;
            // En pantallas angostas la barra de AVOTEX ocupa la parte superior: la dirección no cabría.
            var roomForAddress = !root.matchMedia || !root.matchMedia('(max-width: 760px)').matches;
            var base = {
                fullscreenControl: false, // la pantalla completa la da F11; evita botones que compitan
                motionTracking: false,
                motionTrackingControl: false,
                enableCloseButton: false,
                addressControl: primary && roomForAddress,
                addressControlOptions: { position: CP.TOP_CENTER },
                imageDateControl: primary,  // fecha real de Google, solo si la imagen la tiene
                showRoadLabels: true
            };
            if (interactive) {
                return Object.assign(base, {
                    disableDefaultUI: false,
                    linksControl: true,
                    clickToGo: true,
                    panControl: true,
                    zoomControl: true,
                    scrollwheel: true,
                    disableDoubleClickZoom: false,
                    panControlOptions: { position: CP.RIGHT_BOTTOM },
                    zoomControlOptions: { position: CP.RIGHT_BOTTOM }
                });
            }
            return Object.assign(base, {
                disableDefaultUI: true,
                addressControl: false,
                imageDateControl: false,
                linksControl: false,
                clickToGo: false,
                panControl: false,
                zoomControl: false,
                scrollwheel: false,
                disableDoubleClickZoom: true
            });
        }

        function emitCamera() {
            rafPending = false;
            if (!panorama || !handlers.camera) return;
            var pov = panorama.getPov();
            handlers.camera({
                pano: panorama.getPano(),
                heading: SX.normalizeHeading(pov.heading),
                pitch: Number(pov.pitch) || 0,
                zoom: Number(panorama.getZoom()) || 0,
                user: Date.now() - lastUserAt < USER_WINDOW_MS
            });
        }

        function scheduleCamera() {
            if (applying > 0 || !interactive || rafPending) return;
            rafPending = true;
            raf(emitCamera);
        }

        function emitLinks() {
            if (handlers.links && panorama) handlers.links(getLinks());
        }

        function attach() {
            listeners.push(panorama.addListener('pov_changed', scheduleCamera));
            listeners.push(panorama.addListener('zoom_changed', scheduleCamera));
            listeners.push(panorama.addListener('pano_changed', function () {
                if (handlers.pano) handlers.pano(panorama.getPano());
                scheduleCamera();
                emitLinks();
            }));
            listeners.push(panorama.addListener('links_changed', emitLinks));
            listeners.push(panorama.addListener('status_changed', function () {
                if (handlers.status) handlers.status(panorama.getStatus());
            }));
        }

        function stopTurn() { if (turnAnim) { caf(turnAnim.id); turnAnim = null; } }

        async function show(panoId, camera) {
            var libs = await load();
            var pov = { heading: SX.normalizeHeading(camera && camera.heading), pitch: Number(camera && camera.pitch) || 0 };
            var zoom = camera && isFinite(Number(camera.zoom)) ? Number(camera.zoom) : 1;
            stopTurn();
            applying += 1;
            try {
                if (!panorama) {
                    // Única instancia de esta ventana (evento facturable de Google).
                    panorama = new libs.streetView.StreetViewPanorama(el, Object.assign(panoramaOptions(libs), {
                        pano: panoId, pov: pov, zoom: zoom, visible: true
                    }));
                    attach();
                } else {
                    if (panorama.getPano() !== panoId) panorama.setPano(panoId);
                    panorama.setPov(pov);
                    panorama.setZoom(zoom);
                    panorama.setVisible(true);
                }
            } finally {
                // Los eventos de Google llegan después; se ignoran durante un instante.
                setTimeout(function () { applying = Math.max(0, applying - 1); }, 60);
            }
            if (interactive) setTimeout(emitCamera, 80);
        }

        /* Aplica una cámara que llega por sincronización (no cuenta como gesto de la persona). */
        function applyCamera(cam) {
            if (!panorama || !cam) return;
            stopTurn();
            applying += 1;
            try {
                if (cam.pano && panorama.getPano() !== cam.pano) panorama.setPano(cam.pano);
                panorama.setPov({ heading: SX.normalizeHeading(cam.heading), pitch: Number(cam.pitch) || 0 });
                if (isFinite(Number(cam.zoom)) && Number(panorama.getZoom()) !== Number(cam.zoom)) panorama.setZoom(Number(cam.zoom));
            } finally {
                setTimeout(function () { applying = Math.max(0, applying - 1); }, 60);
            }
        }

        /* Enlaces reales del panorama actual (los que dibuja Google como flechas). */
        function getLinks() {
            if (!panorama || typeof panorama.getLinks !== 'function') return [];
            return (panorama.getLinks() || []).filter(function (l) { return l && l.pano; }).map(function (l) {
                return { pano: l.pano, heading: Number(l.heading), description: l.description || '' };
            });
        }

        /* Avanza o retrocede al panorama enlazado en esa dirección. Devuelve false si no hay camino. */
        function navigate(direction) {
            if (!panorama) return false;
            var opt = SX.navOptions(getLinks(), panorama.getPov().heading);
            var link = direction === 'back' ? opt.back : opt.forward;
            if (!link) return false;
            stopTurn();
            markUser();
            panorama.setPano(link.pano); // se conserva la orientación, como al usar las flechas de Google
            return true;
        }

        /* Gira la vista con una animación corta (cada cuadro sincroniza las demás pantallas). */
        function turn(deltaDeg) {
            if (!panorama) return;
            markUser();
            var start = panorama.getPov();
            var from = Number(start.heading) || 0;
            var to = from + deltaDeg;
            var t0 = null;
            stopTurn();
            var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduce) { panorama.setPov({ heading: SX.normalizeHeading(to), pitch: start.pitch }); return; }
            turnAnim = { id: 0 };
            var step = function (ts) {
                if (!turnAnim) return;
                if (t0 === null) t0 = ts;
                var k = Math.min(1, (ts - t0) / TURN_DURATION_MS);
                var eased = 1 - Math.pow(1 - k, 3);
                markUser();
                panorama.setPov({ heading: SX.normalizeHeading(from + (to - from) * eased), pitch: panorama.getPov().pitch });
                if (k < 1) turnAnim.id = raf(step); else turnAnim = null;
            };
            turnAnim.id = raf(step);
        }

        async function setInteractive(next) {
            next = !!next;
            if (next === interactive) return;
            interactive = next;
            if (panorama) {
                var libs = await load();
                panorama.setOptions(panoramaOptions(libs));
            }
        }

        async function setPrimary(next) {
            next = !!next;
            if (next === primary) return;
            primary = next;
            if (panorama) {
                var libs = await load();
                panorama.setOptions(panoramaOptions(libs));
            }
        }

        function hide() { stopTurn(); if (panorama) panorama.setVisible(false); }

        function getCamera() {
            if (!panorama) return null;
            var pov = panorama.getPov();
            return { pano: panorama.getPano(), heading: SX.normalizeHeading(pov.heading), pitch: Number(pov.pitch) || 0, zoom: Number(panorama.getZoom()) || 0 };
        }

        function destroy() {
            stopTurn();
            listeners.forEach(function (l) { try { l.remove(); } catch (e) { /* nada */ } });
            listeners = [];
            ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (evName) {
                el.removeEventListener(evName, onGesture, { capture: true });
            });
            handlers = { camera: null, status: null, pano: null, links: null };
        }

        return {
            show: show,
            hide: hide,
            applyCamera: applyCamera,
            setInteractive: setInteractive,
            setPrimary: setPrimary,
            getCamera: getCamera,
            getLinks: getLinks,
            navigate: navigate,
            turn: turn,
            hasPanorama: function () { return !!panorama; },
            isInteractive: function () { return interactive; },
            msSinceUser: function () { return Date.now() - lastUserAt; },
            setHandlers: function (h) { Object.assign(handlers, h || {}); },
            destroy: destroy
        };
    }

    /* Texto para cada código de error. */
    function errorMessage(code) {
        switch (code) {
            case 'NO_KEY':
                return 'Street View no está configurado en este sitio (falta la clave de Google Maps). Tus módulos siguen disponibles.';
            case 'AUTH':
                return 'Google rechazó la clave de Street View: puede ser una restricción de dominio, la API desactivada o un problema de facturación o cuota.';
            case 'TIMEOUT':
                return 'Google Maps tardó demasiado en responder. Revisa tu conexión a internet.';
            case 'LOAD_FAILED':
                return 'No se pudo cargar Google Maps. Revisa tu conexión o si algún bloqueador impide el acceso.';
            case 'SEARCH_FAILED':
                return 'Google no pudo buscar imágenes de Street View en este momento.';
            default:
                return 'Ocurrió un problema con Street View.';
        }
    }

    root.AvotexStreetView = {
        load: load,
        resolveHuerta: resolveHuerta,
        createStage: createStage,
        onAuthFailure: onAuthFailure,
        errorMessage: errorMessage,
        isAuthFailed: function () { return authFailed; }
    };
})(window);

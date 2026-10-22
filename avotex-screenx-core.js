/*
 * AVOTEX ScreenX — lógica compartida sin DOM.
 *
 * Contiene lo que se puede probar sin navegador:
 *  - Protocolo de mensajes entre ventanas (BroadcastChannel).
 *  - Estado compartido versionado (evita que una ventana con datos viejos sobrescriba a las demás).
 *  - Registro de ventanas conectadas, roles duplicados y ventanas desconectadas.
 *  - Matemática de cámara para repartir una panorámica entre tres pantallas.
 *  - Validación de coordenadas de huertas.
 *
 * Se carga como <script> clásico en el navegador (window.AvotexScreenX)
 * y con require() en las pruebas de Node.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AvotexScreenX = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var PROTOCOL = 'avotex-screenx';
    var PROTOCOL_VERSION = 1;

    var ROLES = ['left', 'center', 'right'];
    var ROLE_LABELS = { left: 'Izquierda', center: 'Central', right: 'Derecha' };
    var ROLE_SCREEN_LABELS = { left: 'Pantalla izquierda', center: 'Pantalla central', right: 'Pantalla derecha' };

    var MESSAGE_TYPES = [
        'presence',       // latido periódico: quién soy, qué rol tengo
        'bye',            // la ventana se cierra o deja ScreenX
        'state',          // instantánea del estado compartido (versionada)
        'state-request',  // una ventana nueva pide el estado actual
        'camera',         // orientación de la cámara central
        'start',          // entrar a la experiencia desde el asistente
        'open-module',    // la pantalla central pide abrir un módulo en otra pantalla
        'logout'          // se cerró la sesión en alguna ventana
    ];

    /* Valores iniciales de ScreenX. Se pueden cambiar desde el panel de calibración. */
    var SCREENX_DEFAULTS = {
        bezelDeg: 0,      // grados que "ocupan" los marcos entre monitores
        fineDeg: 0        // ajuste fino del desplazamiento de las pantallas laterales
    };
    var CALIBRATION_LIMITS = { bezelDeg: [0, 20], fineDeg: [-30, 30] };

    /* Tiempos del latido entre ventanas. */
    var PRESENCE_INTERVAL_MS = 1500;
    var PEER_STALE_MS = 5000;

    /* Búsqueda de panoramas: Google recomienda radios de 1 km o menos. */
    var STREETVIEW_SEARCH_RADIUS_M = 1000;

    /* Qué pantalla aloja cada módulo en ScreenX (los demás siguen accesibles desde el menú). */
    var MODULE_HOME = { huerta: 'left', reportes: 'left', resumen: 'right', analisis: 'right' };

    // ───────────────────────── utilidades numéricas ─────────────────────────

    function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

    function isFiniteNumber(n) { return typeof n === 'number' && isFinite(n); }

    function normalizeHeading(h) {
        var n = Number(h);
        if (!isFinite(n)) return 0;
        return ((n % 360) + 360) % 360;
    }

    /* Diferencia angular más corta (de -180 a 180). */
    function headingDelta(a, b) {
        var d = normalizeHeading(b) - normalizeHeading(a);
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return d;
    }

    /*
     * Campo de visión horizontal de Street View según el zoom.
     * La documentación de Google da la tabla 0→180°, 1→90°, 2→45°, 3→22.5°, 4→11.25°
     * (cada nivel lo divide entre dos). Para zooms fraccionarios se usa la misma regla.
     */
    function fovFromZoom(zoom) {
        var z = Number(zoom);
        if (!isFinite(z)) z = 1;
        z = clamp(z, 0, 5);
        return 180 / Math.pow(2, z);
    }

    function sanitizeCalibration(cfg) {
        var out = {};
        Object.keys(SCREENX_DEFAULTS).forEach(function (k) {
            var v = cfg && Number(cfg[k]);
            if (!isFinite(v)) v = SCREENX_DEFAULTS[k];
            var lim = CALIBRATION_LIMITS[k];
            out[k] = clamp(v, lim[0], lim[1]);
        });
        return out;
    }

    /*
     * Desplazamiento angular de una pantalla lateral respecto a la central.
     * Si cada pantalla muestra un campo de visión F, la pantalla derecha debe
     * empezar donde termina la central: heading + F. Los marcos de los monitores
     * y la disposición física se compensan con la calibración.
     */
    function sideOffsetDeg(zoom, calibration) {
        var cal = sanitizeCalibration(calibration);
        return fovFromZoom(zoom) + cal.bezelDeg + cal.fineDeg;
    }

    /* Cámara que debe mostrar una pantalla a partir de la cámara central. */
    function cameraForRole(centerCamera, role, calibration) {
        var cam = centerCamera || {};
        var zoom = isFiniteNumber(Number(cam.zoom)) ? Number(cam.zoom) : 1;
        var pitch = isFiniteNumber(Number(cam.pitch)) ? clamp(Number(cam.pitch), -90, 90) : 0;
        var heading = normalizeHeading(cam.heading);
        var offset = sideOffsetDeg(zoom, calibration);
        if (role === 'left') heading = normalizeHeading(heading - offset);
        else if (role === 'right') heading = normalizeHeading(heading + offset);
        return { heading: heading, pitch: pitch, zoom: zoom };
    }

    // ───────────────────────── geografía ─────────────────────────

    function isValidLatLng(lat, lng) {
        if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        // (0, 0) casi siempre significa "sin dato", no una huerta en el Golfo de Guinea.
        if (lat === 0 && lng === 0) return false;
        return true;
    }

    /*
     * Normaliza el campo coordinates de la tabla huertas: acepta objetos
     * {latitude, longitude} / {lat, lng}, pares [lat, lng] o un string JSON.
     * Devuelve pares [lat, lng] válidos.
     */
    function parseCoords(raw) {
        var coords = raw;
        if (typeof coords === 'string') {
            try { coords = JSON.parse(coords); } catch (e) { return []; }
        }
        if (!Array.isArray(coords)) return [];
        var out = [];
        for (var i = 0; i < coords.length; i++) {
            var c = coords[i];
            if (c == null) continue;
            var lat, lng;
            if (Array.isArray(c)) { lat = Number(c[0]); lng = Number(c[1]); }
            else {
                lat = Number(c.latitude != null ? c.latitude : c.lat);
                lng = Number(c.longitude != null ? c.longitude : c.lng);
            }
            if (isFinite(lat) && isFinite(lng)) out.push([lat, lng]);
        }
        return out;
    }

    var EARTH_RADIUS_M = 6371008.8;
    function toRad(d) { return d * Math.PI / 180; }
    function toDeg(r) { return r * 180 / Math.PI; }

    function distanceMeters(a, b) {
        var dLat = toRad(b.lat - a.lat);
        var dLng = toRad(b.lng - a.lng);
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
    }

    /* Rumbo inicial (0 = norte, 90 = este) para mirar desde a hacia b. */
    function headingBetween(a, b) {
        var p1 = toRad(a.lat), p2 = toRad(b.lat), dl = toRad(b.lng - a.lng);
        var y = Math.sin(dl) * Math.cos(p2);
        var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return normalizeHeading(toDeg(Math.atan2(y, x)));
    }

    /* Punto dentro del polígono (ray casting). Los vértices son [lat, lng]. */
    function pointInPolygon(point, latlngs) {
        if (!latlngs || latlngs.length < 3) return false;
        var inside = false;
        for (var i = 0, j = latlngs.length - 1; i < latlngs.length; j = i++) {
            var yi = latlngs[i][0], xi = latlngs[i][1];
            var yj = latlngs[j][0], xj = latlngs[j][1];
            var intersect = ((yi > point.lat) !== (yj > point.lat)) &&
                (point.lng < (xj - xi) * (point.lat - yi) / ((yj - yi) || 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /*
     * Punto de la huerta hacia el que se busca Street View.
     * Usa center_lat/center_lng (lo calcula la base de datos a partir del polígono);
     * si no existe, el promedio de los vértices registrados. Nunca inventa coordenadas.
     */
    function huertaTarget(huerta) {
        if (!huerta) return null;
        var lat = Number(huerta.center_lat), lng = Number(huerta.center_lng);
        var vertices = parseCoords(huerta.coordinates).filter(function (p) { return isValidLatLng(p[0], p[1]); });
        if (isValidLatLng(lat, lng)) return { lat: lat, lng: lng, source: 'center', vertices: vertices };
        if (vertices.length) {
            var sLat = 0, sLng = 0;
            vertices.forEach(function (p) { sLat += p[0]; sLng += p[1]; });
            return { lat: sLat / vertices.length, lng: sLng / vertices.length, source: 'vertices', vertices: vertices };
        }
        return null;
    }

    /* Describe la relación entre el panorama encontrado y la huerta. */
    function describePanoramaPlacement(target, panoLatLng) {
        if (!target || !panoLatLng) return null;
        var distance = distanceMeters(target, panoLatLng);
        var inside = pointInPolygon(panoLatLng, target.vertices);
        return {
            distanceM: Math.round(distance),
            insidePolygon: inside,
            headingToHuerta: headingBetween(panoLatLng, target)
        };
    }

    // ───────────────────────── protocolo de mensajes ─────────────────────────

    function createMessage(type, from, payload, seq, extra) {
        var msg = {
            protocol: PROTOCOL,
            v: PROTOCOL_VERSION,
            type: type,
            from: from,
            seq: seq,
            payload: payload == null ? null : payload
        };
        if (extra && typeof extra === 'object') {
            Object.keys(extra).forEach(function (k) { if (!(k in msg)) msg[k] = extra[k]; });
        }
        return msg;
    }

    function validateMessage(msg) {
        return !!msg && typeof msg === 'object' &&
            msg.protocol === PROTOCOL &&
            msg.v === PROTOCOL_VERSION &&
            MESSAGE_TYPES.indexOf(msg.type) !== -1 &&
            typeof msg.from === 'string' && msg.from.length > 0 && msg.from.length <= 80 &&
            isFiniteNumber(msg.seq);
    }

    /*
     * Envoltura del canal entre ventanas. `transport` es un BroadcastChannel
     * (o un objeto con postMessage/close y una propiedad onmessage, para pruebas).
     * Descarta mensajes propios, inválidos o repetidos/viejos del mismo emisor.
     */
    function createBus(transport, selfId, opts) {
        var seq = 0;
        var handlers = [];
        var lastSeqBySender = {};
        var loadIdBySender = {};
        var selfLoadId = (opts && opts.loadId) || String(Date.now()) + Math.random().toString(36).slice(2);
        var closed = false;

        function onRaw(ev) {
            var msg = ev && ev.data;
            if (!validateMessage(msg)) return;
            if (msg.from === selfId) {
                // Otra pestaña con el mismo identificador (pestaña duplicada que copió sessionStorage).
                if (msg.loadId && msg.loadId !== selfLoadId) {
                    handlers.forEach(function (h) { h({ type: '__collision', from: msg.from, payload: msg }); });
                }
                return;
            }
            // Si la ventana emisora se recargó, su contador vuelve a empezar.
            if (msg.loadId && loadIdBySender[msg.from] !== msg.loadId) {
                loadIdBySender[msg.from] = msg.loadId;
                lastSeqBySender[msg.from] = -1;
            }
            var last = lastSeqBySender[msg.from];
            if (last != null && msg.seq <= last) return;
            lastSeqBySender[msg.from] = msg.seq;
            handlers.forEach(function (h) { h(msg); });
        }

        transport.onmessage = onRaw;

        return {
            selfId: selfId,
            loadId: selfLoadId,
            send: function (type, payload) {
                if (closed) return null;
                if (MESSAGE_TYPES.indexOf(type) === -1) throw new Error('Tipo de mensaje desconocido: ' + type);
                seq += 1;
                var msg = createMessage(type, selfId, payload, seq, { loadId: selfLoadId, sentAt: Date.now() });
                try { transport.postMessage(msg); } catch (e) { return null; }
                return msg;
            },
            on: function (handler) {
                handlers.push(handler);
                return function off() { handlers = handlers.filter(function (h) { return h !== handler; }); };
            },
            forget: function (senderId) { delete lastSeqBySender[senderId]; delete loadIdBySender[senderId]; },
            close: function () {
                closed = true;
                handlers = [];
                try { transport.onmessage = null; transport.close && transport.close(); } catch (e) { /* nada */ }
            }
        };
    }

    // ───────────────────────── estado compartido versionado ─────────────────────────

    /*
     * Cada cambio local sube la versión; al recibir una instantánea solo se aplica
     * si es más nueva. Empates: gana el identificador de ventana mayor (determinista
     * en todas las ventanas). Una ventana recién abierta empieza en versión 0, así que
     * nunca pisa el estado que ya tienen las demás.
     */
    function createStateStore(selfId, initial) {
        var data = Object.assign({}, initial || {});
        var version = 0;
        var origin = '';

        function isNewer(v, o) {
            if (v > version) return true;
            if (v === version && v > 0 && o > origin) return true;
            return false;
        }

        return {
            get: function () { return Object.assign({}, data); },
            version: function () { return version; },
            snapshot: function () { return { data: Object.assign({}, data), version: version, origin: origin }; },
            propose: function (patch) {
                version += 1;
                origin = selfId;
                data = Object.assign({}, data, patch || {});
                return this.snapshot();
            },
            receive: function (snap) {
                if (!snap || typeof snap !== 'object' || !isFiniteNumber(snap.version) || typeof snap.origin !== 'string') return false;
                if (!isNewer(snap.version, snap.origin)) return false;
                version = snap.version;
                origin = snap.origin;
                data = Object.assign({}, snap.data || {});
                return true;
            }
        };
    }

    // ───────────────────────── registro de ventanas ─────────────────────────

    function createPeerRegistry(selfId, opts) {
        var staleMs = (opts && opts.staleMs) || PEER_STALE_MS;
        var peers = {};

        function live(now) {
            return Object.keys(peers).map(function (id) { return peers[id]; })
                .filter(function (p) { return now - p.lastSeen <= staleMs; });
        }

        return {
            update: function (id, info, now) {
                if (!id || id === selfId) return null;
                var prev = peers[id];
                peers[id] = Object.assign({}, prev || {}, info || {}, { id: id, lastSeen: now });
                return { isNew: !prev, roleChanged: !!prev && prev.role !== peers[id].role, peer: peers[id] };
            },
            remove: function (id) {
                var p = peers[id];
                delete peers[id];
                return p || null;
            },
            /* Elimina ventanas que dejaron de responder y las devuelve. */
            prune: function (now) {
                var removed = [];
                Object.keys(peers).forEach(function (id) {
                    if (now - peers[id].lastSeen > staleMs) { removed.push(peers[id]); delete peers[id]; }
                });
                return removed;
            },
            live: live,
            get: function (id) { return peers[id] || null; },
            holdersOf: function (role, now) {
                return live(now).filter(function (p) { return p.role === role; });
            },
            /*
             * Estado de cada rol desde el punto de vista de esta ventana:
             * 'self' | 'peer' | 'missing' | 'duplicate'.
             */
            roleStatus: function (selfRole, now) {
                var result = {};
                ROLES.forEach(function (role) {
                    var holders = live(now).filter(function (p) { return p.role === role; }).map(function (p) { return p.id; });
                    if (selfRole === role) holders = [selfId].concat(holders);
                    var state = 'missing';
                    if (holders.length > 1) state = 'duplicate';
                    else if (holders.length === 1) state = holders[0] === selfId ? 'self' : 'peer';
                    result[role] = { state: state, holders: holders };
                });
                return result;
            },
            summary: function (selfRole, now) {
                var status = this.roleStatus(selfRole, now);
                var assigned = ROLES.filter(function (r) { return status[r].state !== 'missing'; });
                var missing = ROLES.filter(function (r) { return status[r].state === 'missing'; });
                var duplicates = ROLES.filter(function (r) { return status[r].state === 'duplicate'; });
                return {
                    status: status,
                    assigned: assigned,
                    missing: missing,
                    duplicates: duplicates,
                    complete: missing.length === 0 && duplicates.length === 0
                };
            }
        };
    }

    // ───────────────────────── seguimiento de cámara ─────────────────────────

    /*
     * Decide si una pantalla lateral debe aplicar un mensaje de cámara.
     * Solo se acepta de la ventana que hoy tiene el rol central (y solo si no hay
     * dos centrales), y solo para la huerta que esta ventana tiene activa.
     */
    function shouldApplyCamera(msg, ctx) {
        if (!msg || msg.type !== 'camera' || !msg.payload) return false;
        if (ctx.selfRole === 'center' || !ctx.selfRole) return false;
        var centers = ctx.centerHolders || [];
        if (centers.length !== 1 || centers[0] !== msg.from) return false;
        var p = msg.payload;
        if (!isFiniteNumber(p.heading) || !isFiniteNumber(p.pitch) || !isFiniteNumber(p.zoom)) return false;
        if (ctx.huertaId && p.huertaId && p.huertaId !== ctx.huertaId) return false;
        return true;
    }

    /* Para elegir dónde se abre un módulo en ScreenX. */
    function moduleTargetRole(moduleName, selfRole, connectedRoles) {
        var home = MODULE_HOME[moduleName];
        if (!home || home === selfRole) return selfRole;
        if (connectedRoles && connectedRoles.indexOf(home) !== -1) return home;
        return selfRole;
    }

    return {
        PROTOCOL: PROTOCOL,
        PROTOCOL_VERSION: PROTOCOL_VERSION,
        ROLES: ROLES,
        ROLE_LABELS: ROLE_LABELS,
        ROLE_SCREEN_LABELS: ROLE_SCREEN_LABELS,
        MESSAGE_TYPES: MESSAGE_TYPES,
        SCREENX_DEFAULTS: SCREENX_DEFAULTS,
        CALIBRATION_LIMITS: CALIBRATION_LIMITS,
        PRESENCE_INTERVAL_MS: PRESENCE_INTERVAL_MS,
        PEER_STALE_MS: PEER_STALE_MS,
        STREETVIEW_SEARCH_RADIUS_M: STREETVIEW_SEARCH_RADIUS_M,
        MODULE_HOME: MODULE_HOME,
        clamp: clamp,
        normalizeHeading: normalizeHeading,
        headingDelta: headingDelta,
        fovFromZoom: fovFromZoom,
        sanitizeCalibration: sanitizeCalibration,
        sideOffsetDeg: sideOffsetDeg,
        cameraForRole: cameraForRole,
        isValidLatLng: isValidLatLng,
        parseCoords: parseCoords,
        distanceMeters: distanceMeters,
        headingBetween: headingBetween,
        pointInPolygon: pointInPolygon,
        huertaTarget: huertaTarget,
        describePanoramaPlacement: describePanoramaPlacement,
        createMessage: createMessage,
        validateMessage: validateMessage,
        createBus: createBus,
        createStateStore: createStateStore,
        createPeerRegistry: createPeerRegistry,
        shouldApplyCamera: shouldApplyCamera,
        moduleTargetRole: moduleTargetRole
    };
});

/*
 * AVOTEX — reconocimiento de gestos de mano para mover Street View (lógica pura, sin DOM).
 *
 * Entrada: los 21 puntos de referencia de una mano que entrega MediaPipe Hand Landmarker
 * (coordenadas normalizadas 0–1 del fotograma de la webcam, SIN espejo) y la hora del fotograma.
 * Salida: velocidades de giro (grados/s) y órdenes puntuales («avanzar»). Este archivo no toca
 * la cámara, el video ni Street View: avotex-gestos.js aplica las salidas.
 *
 * Gestos:
 *  - Pinza (pulgar + índice): toma el control y fija un punto neutro. Quieto en ese punto = vista quieta.
 *  - Pinza + mover la mano a los lados: gira. Arriba/abajo: inclina (menos sensible).
 *  - Soltar la pinza o perder la mano: se detiene de inmediato y se borra el punto neutro.
 *  - Índice y medio en V (sin pinza), sostenida: avanza UN punto. Hay que bajar la V para repetir.
 *  - Pulgar arriba (puño con el pulgar hacia arriba), sostenido: muestra u oculta las imágenes de
 *    escaneo. Hay que bajar la mano para volver a usarlo.
 *  - Con los escaneos abiertos: pinza + deslizar a la derecha / izquierda cambia a los siguientes /
 *    anteriores (createSwipe). Para repetir, regresar la mano al centro o soltar la pinza.
 *
 * Se prueba con:  node --test tests/gestos-core.test.mjs
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AvotexGestosCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * ═══════════ PARÁMETROS AJUSTABLES (todos aquí) ═══════════
     * Distancias de la mano: relativas al tamaño aparente de la mano (muñeca → nudillo del medio),
     * así no cambian si la persona se acerca o se aleja de la webcam.
     * Desplazamientos: fracción del ancho/alto del fotograma (0–1).
     *
     *  ¿El giro se siente LENTO?            sube maxYawSpeed (y/o baja fullSpeedAt).
     *  ¿Se siente BRUSCO al arrancar?        sube fullSpeedAt o baja speedEase.
     *  ¿Se mueve solo / DEMASIADO sensible?  sube deadZoneX (y deadZoneY para la inclinación).
     *  ¿La pinza parpadea (toma y suelta)?   separa más pinchClose y pinchOpen o sube pinchConfirmFrames.
     *  ¿Cuesta hacer la pinza?               sube pinchClose (p. ej. 0.40).
     *  ¿La V avanza sin querer?              sube vHoldMs.
     *  ¿El pulgar arriba cuesta o se activa solo? ajusta thumbUpMin (más alto = más estricto) o thumbHoldMs.
     *  ¿Izquierda y derecha al revés?        invertX = true (también hay un botón en la vista previa).
     *  ¿La detección traba la página?        baja inferenceFps (primero), luego maxBusyShare o captureWidth.
     *  ¿La laptop tiene buena GPU?            prueba delegate: 'GPU' y compara los ms en la vista previa.
     */
    var DEFAULTS = {
        // Cámara e inferencia
        captureWidth: 640,
        captureHeight: 360,
        inferenceFps: 20,          // inferencias por segundo como máximo
        delegate: 'CPU',           // 'CPU' (predecible, no compite con Street View ni three.js) · 'GPU' · 'auto'
        maxBusyShare: 0.4,         // la detección usa como máximo esta fracción del hilo principal

        // Pinza (distancia pulgar–índice / tamaño de la mano), con histéresis
        pinchClose: 0.34,          // por debajo: pinza cerrada
        pinchOpen: 0.50,           // por encima: pinza abierta (debe ser mayor que pinchClose)
        pinchConfirmFrames: 3,     // fotogramas seguidos para confirmar que se cerró
        releaseConfirmFrames: 2,   // fotogramas seguidos para confirmar que se abrió

        // Giro con la pinza (control tipo palanca: velocidad proporcional al desplazamiento)
        deadZoneX: 0.045,          // zona muerta horizontal alrededor del punto neutro
        deadZoneY: 0.06,           // zona muerta vertical (más amplia: horizonte estable)
        fullSpeedAt: 0.20,         // desplazamiento fuera de la zona muerta que alcanza la velocidad máxima
        maxYawSpeed: 60,           // grados por segundo, giro izquierda/derecha
        maxPitchSpeed: 22,         // grados por segundo, mirar arriba/abajo (menos sensible)
        positionSmoothing: 0.35,   // suavizado de la posición de la mano (0 = nada, 1 = máximo)
        speedEase: 0.18,           // rapidez con que la velocidad alcanza su objetivo (0–1 por fotograma de 60 Hz)
        pitchMin: -30,             // límite de inclinación hacia abajo (grados)
        pitchMax: 30,              // límite hacia arriba
        invertX: false,            // true si izquierda/derecha quedan al revés con esa webcam
        invertY: false,

        // Avance con la V
        vHoldMs: 450,              // tiempo sostenido para confirmar el avance
        vCooldownMs: 1200,         // pausa mínima entre dos avances
        vReleaseFrames: 3,         // fotogramas sin V para volver a admitir otro avance
        vSpread: 0.22,             // separación mínima entre las puntas de índice y medio

        // Pulgar arriba: muestra u oculta las imágenes de escaneo
        thumbHoldMs: 700,          // tiempo sostenido para confirmar
        thumbCooldownMs: 1500,     // pausa mínima entre dos cambios
        thumbReleaseFrames: 4,     // fotogramas sin pulgar arriba para volver a admitirlo
        thumbUpMin: 0.45,          // cuánto debe subir la punta del pulgar sobre su nudillo (en tamaños de mano)

        // Deslizar con la pinza para cambiar de escaneos (desplazamiento desde el punto neutro, 0–1 del ancho)
        swipeAt: 0.10,             // al pasar de aquí cambia una vez
        swipeRearm: 0.04,          // hay que volver por debajo de esto (o soltar la pinza) para cambiar otra vez

        // Seguimiento
        maxFrameGapMs: 400         // si pasan más de esto entre fotogramas, se descarta el movimiento
    };

    // Índices de los puntos de MediaPipe Hand Landmarker
    var P = {
        WRIST: 0, THUMB_MCP: 2, THUMB_TIP: 4,
        INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8,
        MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_TIP: 12,
        RING_MCP: 13, RING_PIP: 14, RING_TIP: 16,
        PINKY_MCP: 17, PINKY_PIP: 18, PINKY_TIP: 20
    };

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function sanitize(cfg) {
        var out = {};
        Object.keys(DEFAULTS).forEach(function (k) {
            var d = DEFAULTS[k];
            var v = cfg && Object.prototype.hasOwnProperty.call(cfg, k) ? cfg[k] : d;
            if (typeof d === 'boolean') out[k] = !!v;
            else if (typeof d === 'string') out[k] = typeof v === 'string' ? v : d;
            else out[k] = isFinite(Number(v)) ? Number(v) : d;
        });
        if (out.pinchOpen <= out.pinchClose) out.pinchOpen = out.pinchClose + 0.08;
        out.inferenceFps = clamp(out.inferenceFps, 2, 60);
        out.maxBusyShare = clamp(out.maxBusyShare, 0.1, 0.9);
        if (['auto', 'GPU', 'CPU'].indexOf(out.delegate) === -1) out.delegate = 'auto';
        out.positionSmoothing = clamp(out.positionSmoothing, 0, 0.95);
        out.speedEase = clamp(out.speedEase, 0.01, 1);
        out.fullSpeedAt = Math.max(0.02, out.fullSpeedAt);
        out.pinchConfirmFrames = Math.max(1, Math.round(out.pinchConfirmFrames));
        out.releaseConfirmFrames = Math.max(1, Math.round(out.releaseConfirmFrames));
        out.vReleaseFrames = Math.max(1, Math.round(out.vReleaseFrames));
        out.thumbReleaseFrames = Math.max(1, Math.round(out.thumbReleaseFrames));
        return out;
    }

    // Distancia en un espacio con la proporción real del fotograma (x escalada por el aspecto).
    function dist(a, b, aspect) {
        var dx = (a.x - b.x) * aspect, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /* Medidas de una mano, independientes de la distancia a la cámara. */
    function measure(lm, aspect) {
        aspect = aspect || 16 / 9;
        var size = dist(lm[P.WRIST], lm[P.MIDDLE_MCP], aspect) || 1e-6;
        var w = lm[P.WRIST];
        var ext = function (tip, pip) { return dist(w, lm[tip], aspect) > dist(w, lm[pip], aspect) * 1.12; };
        var folded = function (tip, pip, mcp) {
            return dist(w, lm[tip], aspect) < dist(w, lm[pip], aspect) * 1.02 || dist(w, lm[tip], aspect) < dist(w, lm[mcp], aspect) * 1.25;
        };
        // Centro de la palma: estable aunque los dedos se abran o cierren.
        var ids = [P.WRIST, P.INDEX_MCP, P.MIDDLE_MCP, P.RING_MCP, P.PINKY_MCP];
        // Pulgar: cuánto sube su punta sobre su nudillo (y crece hacia abajo) y qué tan vertical está.
        var tUp = (lm[P.THUMB_MCP].y - lm[P.THUMB_TIP].y) / size;
        var tSide = Math.abs(lm[P.THUMB_TIP].x - lm[P.THUMB_MCP].x) * aspect / size;
        var cx = 0, cy = 0;
        ids.forEach(function (i) { cx += lm[i].x; cy += lm[i].y; });
        return {
            size: size,
            pinch: dist(lm[P.THUMB_TIP], lm[P.INDEX_TIP], aspect) / size,
            palm: { x: cx / ids.length, y: cy / ids.length },
            indexUp: ext(P.INDEX_TIP, P.INDEX_PIP),
            middleUp: ext(P.MIDDLE_TIP, P.MIDDLE_PIP),
            ringDown: folded(P.RING_TIP, P.RING_PIP, P.RING_MCP),
            pinkyDown: folded(P.PINKY_TIP, P.PINKY_PIP, P.PINKY_MCP),
            indexDown: folded(P.INDEX_TIP, P.INDEX_PIP, P.INDEX_MCP),
            middleDown: folded(P.MIDDLE_TIP, P.MIDDLE_PIP, P.MIDDLE_MCP),
            thumbUp: tUp,
            // Punta del pulgar por encima de los nudillos y apuntando hacia arriba (menos de ~40° de inclinación).
            thumbVertical: lm[P.THUMB_TIP].y < lm[P.INDEX_MCP].y && tSide < tUp * 0.85,
            vSpread: dist(lm[P.INDEX_TIP], lm[P.MIDDLE_TIP], aspect) / size
        };
    }

    /* Velocidad proporcional al desplazamiento fuera de la zona muerta, con máximo. */
    function axisRate(offset, deadZone, fullAt, maxSpeed) {
        var a = Math.abs(offset);
        if (a <= deadZone) return 0;
        var k = clamp((a - deadZone) / fullAt, 0, 1);
        // Curva suave: arranque fino cerca del neutro, máximo al alejarse.
        return Math.sign(offset) * maxSpeed * k * k * (3 - 2 * k);
    }

    /*
     * Controlador con estado. update() recibe cada resultado de inferencia; step() da la
     * velocidad suavizada para cada cuadro de animación; cancel() bloquea hasta soltar la pinza.
     *
     * Estados (status): 'searching' (sin mano) · 'hand' (mano, sin pinza) · 'holding' (pinza en el
     * neutro, quieto) · 'turning' (pinza fuera de la zona muerta) · 'blocked' (cancelado: hay que
     * soltar la pinza y volver a tomarla).
     */
    function createController(cfg) {
        var C = sanitize(cfg);
        var st = {};
        // rearm: solo cuando la mano sale de cuadro se vuelven a admitir la V y el pulgar arriba.
        // Un corte de fotogramas o una interrupción NO los rearman: si la mano sigue igual, no se repiten.
        function reset(keepHand, rearm) {
            st.pinching = false;
            st.closeCount = 0;
            st.openCount = 0;
            st.neutral = null;
            st.pos = null;
            st.target = { yaw: 0, pitch: 0 };
            st.rate = { yaw: 0, pitch: 0 };
            st.vSince = null;
            st.vMissing = 0;
            st.thumbSince = null;
            st.thumbMissing = 0;
            if (rearm) { st.vArmed = true; st.thumbArmed = true; }
            if (!keepHand) { st.handedness = null; st.lastT = null; }
        }
        reset(false, true);
        st.blocked = false;
        st.lastForwardAt = -Infinity;
        st.lastThumbAt = -Infinity;
        st.status = 'searching';

        function stop() { st.target.yaw = st.target.pitch = 0; st.rate.yaw = st.rate.pitch = 0; }

        /*
         * frame = { landmarks: [21 puntos] | null, handedness: 'Left'|'Right'|null, t: ms, aspect,
         *           expectedGapMs: intervalo previsto entre inferencias (opcional) }
         * Devuelve { status, command: 'forward' | 'scans' | null, pinch, offset }.
         */
        function update(frame) {
            var t = frame.t;
            var out = { status: st.status, command: null, pinch: null, offset: null };
            var lm = frame.landmarks;

            // Sin mano: alto inmediato, se borra el punto neutro.
            if (!lm || lm.length < 21) {
                reset(false, true);
                st.blocked = false;
                st.status = 'searching';
                out.status = st.status;
                return out;
            }
            // Cambió la mano seguida o se cortaron los fotogramas: se descarta el movimiento anterior.
            // El límite crece con el ritmo real de inferencia (equipos lentos) para no reiniciar siempre.
            var gapLimit = Math.max(C.maxFrameGapMs, 2.5 * (Number(frame.expectedGapMs) || 0));
            var gap = st.lastT != null && t - st.lastT > gapLimit;
            var swapped = st.handedness && frame.handedness && frame.handedness !== st.handedness;
            if (gap || swapped) {
                var wasPinching = st.pinching;
                reset();
                // Al recuperar el seguimiento no hay salto: hay que volver a tomar el control.
                if (wasPinching) st.blocked = true;
            }
            st.lastT = t;
            st.handedness = frame.handedness || st.handedness;

            var m = measure(lm, frame.aspect);
            out.pinch = m.pinch;

            // Pinza con histéresis y confirmación por varios fotogramas.
            if (!st.pinching) {
                st.closeCount = m.pinch < C.pinchClose ? st.closeCount + 1 : 0;
                if (st.closeCount >= C.pinchConfirmFrames) {
                    st.closeCount = 0;
                    if (!st.blocked) {
                        st.pinching = true;
                        st.neutral = { x: m.palm.x, y: m.palm.y };
                        st.pos = { x: m.palm.x, y: m.palm.y };
                        st.vSince = null;
                    }
                }
            } else {
                st.openCount = m.pinch > C.pinchOpen ? st.openCount + 1 : 0;
                if (st.openCount >= C.releaseConfirmFrames) {
                    st.openCount = 0;
                    st.pinching = false;
                    st.neutral = null;
                    st.pos = null;
                    stop();
                }
            }
            // Bloqueado (cancelado por mouse/teclado o pérdida de foco): solo se desbloquea al soltar.
            if (st.blocked && m.pinch > C.pinchOpen) st.blocked = false;

            if (st.pinching) {
                var s = C.positionSmoothing;
                st.pos.x = st.pos.x * s + m.palm.x * (1 - s);
                st.pos.y = st.pos.y * s + m.palm.y * (1 - s);
                // En la imagen de la webcam (sin espejo) la mano derecha del presentador va hacia x menor:
                // mover la mano a SU derecha debe girar la vista a la derecha (heading mayor).
                var dx = -(st.pos.x - st.neutral.x) * (C.invertX ? -1 : 1);
                var dy = -(st.pos.y - st.neutral.y) * (C.invertY ? -1 : 1); // y crece hacia abajo
                st.target.yaw = axisRate(dx, C.deadZoneX, C.fullSpeedAt, C.maxYawSpeed);
                st.target.pitch = axisRate(dy, C.deadZoneY, C.fullSpeedAt, C.maxPitchSpeed);
                out.offset = { x: dx, y: dy };
                st.status = (st.target.yaw || st.target.pitch) ? 'turning' : 'holding';
            } else {
                stop();
                st.status = st.blocked ? 'blocked' : 'hand';
            }

            // V: índice y medio arriba y separados, anular y meñique doblados, sin pinza.
            var isV = !st.pinching && m.pinch > C.pinchOpen && m.indexUp && m.middleUp && m.ringDown && m.pinkyDown && m.vSpread > C.vSpread;
            if (isV) {
                st.vMissing = 0;
                if (st.vSince === null) st.vSince = t;
                if (st.vArmed && !st.blocked && t - st.vSince >= C.vHoldMs && t - st.lastForwardAt >= C.vCooldownMs) {
                    st.vArmed = false; // mantener la V levantada no repite el avance
                    st.lastForwardAt = t;
                    out.command = 'forward';
                }
                if (!st.pinching) st.status = 'v';
            } else {
                st.vSince = null;
                st.vMissing += 1;
                if (st.vMissing >= C.vReleaseFrames) st.vArmed = true;
            }

            // Pulgar arriba: los cuatro dedos doblados y el pulgar hacia arriba, sin pinza.
            var isThumb = !st.pinching && m.pinch > C.pinchOpen && m.indexDown && m.middleDown && m.ringDown && m.pinkyDown &&
                m.thumbUp >= C.thumbUpMin && m.thumbVertical;
            if (isThumb) {
                st.thumbMissing = 0;
                if (st.thumbSince === null) st.thumbSince = t;
                if (st.thumbArmed && !st.blocked && t - st.thumbSince >= C.thumbHoldMs && t - st.lastThumbAt >= C.thumbCooldownMs) {
                    st.thumbArmed = false; // sostener el pulgar no alterna una y otra vez
                    st.lastThumbAt = t;
                    out.command = 'scans';
                }
                st.status = 'thumb';
            } else {
                st.thumbSince = null;
                st.thumbMissing += 1;
                if (st.thumbMissing >= C.thumbReleaseFrames) st.thumbArmed = true;
            }
            out.status = st.status;
            return out;
        }

        /* Velocidad para este cuadro (dt en segundos), suavizada hacia el objetivo. */
        function step(dt) {
            var k = 1 - Math.pow(1 - C.speedEase, Math.max(0, dt) * 60);
            st.rate.yaw += (st.target.yaw - st.rate.yaw) * k;
            st.rate.pitch += (st.target.pitch - st.rate.pitch) * k;
            // Al volver a la zona neutra la velocidad llega a cero sin una cola larga.
            if (!st.target.yaw && Math.abs(st.rate.yaw) < 0.8) st.rate.yaw = 0;
            if (!st.target.pitch && Math.abs(st.rate.pitch) < 0.5) st.rate.pitch = 0;
            return { yaw: st.rate.yaw * dt, pitch: st.rate.pitch * dt, moving: !!(st.rate.yaw || st.rate.pitch) };
        }

        /* Mouse, teclado, pérdida de foco o cambio de huerta: alto inmediato y nueva pinza obligatoria. */
        function cancel() {
            var had = st.pinching;
            reset(true);
            // Se desbloquea al ver la mano abierta; luego hace falta una pinza nueva.
            st.blocked = true;
            st.status = 'blocked';
            return had;
        }

        return {
            update: update,
            step: step,
            cancel: cancel,
            config: C,
            state: function () { return { status: st.status, pinching: st.pinching, neutral: st.neutral, pos: st.pos, blocked: st.blocked, rate: Object.assign({}, st.rate) }; }
        };
    }

    /*
     * Deslizar para cambiar de escaneos. update({ pinching, x }) con x = desplazamiento horizontal
     * desde el punto neutro (positivo = a la derecha del presentador, ya con invertX) y devuelve
     * 'next', 'prev' o null. Un deslizamiento cambia UNA vez: para otro, volver al centro o soltar.
     */
    function createSwipe(cfg) {
        var C = sanitize(cfg);
        var armed = true;
        var lastSide = 0;
        return {
            update: function (f) {
                if (!f || !f.pinching || typeof f.x !== 'number') { armed = true; lastSide = 0; return null; }
                var a = Math.abs(f.x);
                var side = f.x > 0 ? 1 : -1;
                // Hacia el lado contrario cuenta aunque la detección no haya visto el paso por el centro.
                if (a >= C.swipeAt && (armed || side !== lastSide)) {
                    armed = false;
                    lastSide = side;
                    return side > 0 ? 'next' : 'prev';
                }
                if (!armed && a < C.swipeRearm) armed = true;
                return null;
            },
            reset: function () { armed = true; lastSide = 0; }
        };
    }

    /* Límite cómodo de inclinación. */
    function clampPitch(p, cfg) {
        var C = cfg || DEFAULTS;
        return clamp(p, C.pitchMin, C.pitchMax);
    }

    return {
        DEFAULTS: DEFAULTS,
        POINTS: P,
        sanitize: sanitize,
        measure: measure,
        axisRate: axisRate,
        createController: createController,
        createSwipe: createSwipe,
        clampPitch: clampPitch
    };
});

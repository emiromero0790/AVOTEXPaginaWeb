/*
 * AVOTEX — capa escénica decorativa con three.js (red de líneas y nodos luminosos).
 *
 * Qué es y qué no es:
 *  - Es AMBIENTACIÓN: una red poco densa de nodos y líneas que da profundidad a la interfaz.
 *    No representa árboles, zonas ni hallazgos; ningún nodo corresponde a una posición real.
 *    Los mapas, polígonos e indicadores con datos reales viven en el HTML de los paneles.
 *  - Tiene su propia cámara (PerspectiveCamera), separada por completo de la cámara de Street View.
 *  - El canvas es transparente y no recibe eventos (pointer-events: none): se arrastra la
 *    panorámica a través de él. Los paneles HTML van encima.
 *  - Si no hay WebGL, si three.js no carga o si se pierde el contexto, la capa no aparece y la
 *    interfaz sigue igual (mapa, datos y controles no dependen de ella).
 *
 * Rendimiento (pensado para ScreenX, que abre tres ventanas en el mismo equipo):
 *  - Dos draw calls: un LineSegments y un Points, con ShaderMaterial y mezcla aditiva.
 *  - Densidad de píxeles limitada (1 en ScreenX, 1.5 en Vista normal) y sin posprocesado.
 *  - Bucle limitado a 30 fps en modo de bajo consumo; se detiene con la ventana oculta.
 *  - prefers-reduced-motion: un solo cuadro estático (sin pulsos ni deriva de cámara).
 *  - destroy() libera geometrías, materiales, el renderer y el contexto WebGL.
 *
 * three.js r186 se sirve desde assets/vendor/three/three.avotex.min.js (build reducido;
 * ver tools/three/build.sh) y se carga con import() solo cuando se monta la capa.
 */
(function (root) {
    'use strict';

    var THREE_URL = 'assets/vendor/three/three.avotex.min.js?v=r186-1';
    var threePromise = null;

    // Paleta AVOTEX: verde hoja para las líneas, lima para los destellos, marfil en el núcleo de los nodos.
    var COLORS = { line: '#7cc35f', flash: '#b9f62f', node: '#f7f5e9', halo: '#a6e35a' };

    function loadThree() {
        if (!threePromise) {
            var url = new URL(THREE_URL, document.baseURI).href;
            threePromise = import(url).catch(function (err) { threePromise = null; throw err; });
        }
        return threePromise;
    }

    var webglCache = null;
    function webglAvailable() {
        if (webglCache !== null) return webglCache;
        try {
            var c = document.createElement('canvas');
            var gl = c.getContext('webgl2') || c.getContext('webgl');
            webglCache = !!gl;
            var lose = gl && gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        } catch (e) { webglCache = false; }
        return webglCache;
    }

    function reducedMotion() {
        return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Generador pseudoaleatorio con semilla: la red es estable entre reconstrucciones.
    function rng(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function inRects(x, y, rects, pad) {
        for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            if (x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) return true;
        }
        return false;
    }

    /*
     * Construye la red en coordenadas de pantalla (px). Cada nodo: x, y, z (profundidad, ≤ 0
     * es más lejos), tamaño, fase de brillo y retardo de aparición. Cada línea une dos nodos.
     *
     * opts.zones   rectángulos donde puede haber nodos libres (laterales, follaje, bordes).
     * opts.anchors rectángulos de tarjetas o previsualizaciones: se trazan nodos en sus
     *              esquinas y algunos tramos de su borde exterior.
     * opts.avoid   rectángulos que quedan libres (título, botones, camino central).
     */
    function buildNetwork(W, H, opts) {
        var rand = rng(opts.seed || 7);
        var nodes = [];
        var edges = [];
        var avoid = opts.avoid || [];
        var anchors = opts.anchors || [];
        var zones = opts.zones || [];
        var density = opts.density || 1;

        function addNode(x, y, z, kind) {
            nodes.push({
                x: x, y: y, z: z,
                size: kind === 'corner' ? 6 + rand() * 3 : (kind === 'hub' ? 9 + rand() * 4 : 3.5 + rand() * 4.5),
                phase: rand() * 1000,
                speed: 0.35 + rand() * 0.5,
                kind: kind,
                // Los nodos aparecen desde el borde exterior de la pantalla hacia el centro.
                delay: 0.05 + 0.55 * Math.min(1, Math.abs(x - W / 2) > W * 0.35 ? rand() * 0.4 : 0.3 + rand() * 0.7)
            });
            return nodes.length - 1;
        }

        // 1) Esquinas y bordes de las tarjetas: el brillo queda en los bordes de algunos paneles.
        anchors.forEach(function (a, ai) {
            var r = a.rect;
            var off = 7;
            var outerLeft = a.side === 'left';
            var c = {
                tl: addNode(r.left - off, r.top - off, 0, 'corner'),
                tr: addNode(r.right + off, r.top - off, 0, 'corner'),
                bl: addNode(r.left - off, r.bottom + off, 0, 'corner'),
                br: addNode(r.right + off, r.bottom + off, 0, 'corner')
            };
            // Tramos del borde: solo algunos, alternando entre tarjetas.
            var pick = (ai + (opts.seed || 0)) % 3;
            if (outerLeft) {
                edges.push([c.tl, c.bl, 'trace']);
                if (pick !== 1) edges.push([c.tl, c.tr, 'trace']);
                if (pick === 2) edges.push([c.br, c.bl, 'trace']);
            } else {
                edges.push([c.tr, c.br, 'trace']);
                if (pick !== 1) edges.push([c.tr, c.tl, 'trace']);
                if (pick === 2) edges.push([c.bl, c.br, 'trace']);
            }
            a._corners = c;
        });

        // 2) Nodos libres en las zonas laterales, con profundidad.
        zones.forEach(function (zone) {
            var area = Math.max(0, (zone.right - zone.left) * (zone.bottom - zone.top));
            var count = Math.round(Math.min(46, Math.max(5, area / 15000)) * density * (zone.weight || 1));
            var tries = 0;
            for (var i = 0; i < count && tries < count * 12; tries++) {
                var x = zone.left + rand() * (zone.right - zone.left);
                var y = zone.top + rand() * (zone.bottom - zone.top);
                if (inRects(x, y, avoid, 18)) continue;
                // Fuera de las tarjetas: los nodos rodean los paneles, no los atraviesan.
                var inside = anchors.some(function (a) { return x > a.rect.left - 4 && x < a.rect.right + 4 && y > a.rect.top - 4 && y < a.rect.bottom + 4; });
                if (inside) continue;
                var z = -Math.pow(rand(), 1.6) * (zone.depth || 520);
                addNode(x, y, z, rand() < 0.08 ? 'hub' : 'free');
                i++;
            }
        });

        // 3) Conexiones: cada nodo con sus vecinos más cercanos (red poco densa).
        var maxD = opts.maxDistance || 210;
        var degree = new Array(nodes.length).fill(0);
        edges.forEach(function (e) { degree[e[0]]++; degree[e[1]]++; });
        var seen = {};
        edges.forEach(function (e) { seen[Math.min(e[0], e[1]) + ':' + Math.max(e[0], e[1])] = true; });
        for (var i = 0; i < nodes.length; i++) {
            var a = nodes[i];
            var near = [];
            for (var j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                var b = nodes[j];
                var dx = a.x - b.x, dy = a.y - b.y, dz = (a.z - b.z) * 0.6;
                var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < maxD) near.push([d, j]);
            }
            near.sort(function (p, q) { return p[0] - q[0]; });
            var want = a.kind === 'hub' ? 3 : (a.kind === 'corner' ? 1 : 2);
            for (var k = 0; k < near.length && degree[i] < want + 1; k++) {
                var jj = near[k][1];
                if (degree[jj] > 3) continue;
                var key = Math.min(i, jj) + ':' + Math.max(i, jj);
                if (seen[key]) continue;
                // Una línea que cruza un área reservada (título, botones) se descarta.
                var crosses = false;
                for (var q = 1; q <= 4 && !crosses; q++) {
                    var mx = a.x + (nodes[jj].x - a.x) * q / 5, my = a.y + (nodes[jj].y - a.y) * q / 5;
                    if (inRects(mx, my, avoid, 6)) crosses = true;
                    else if (anchors.some(function (an) { return mx > an.rect.left + 10 && mx < an.rect.right - 10 && my > an.rect.top + 10 && my < an.rect.bottom - 10; })) crosses = true;
                }
                if (crosses) continue;
                seen[key] = true;
                edges.push([i, jj, 'link']);
                degree[i]++; degree[jj]++;
            }
        }
        return { nodes: nodes, edges: edges };
    }

    // ───────── shaders ─────────

    var LINE_VS = [
        'attribute float aT;',
        'attribute vec4 aEdge;', // fase, velocidad, retardo de revelado, tipo (0 enlace, 1 trazo de borde)
        'uniform float uClock;',
        'uniform float uReveal;',
        'uniform float uMotion;',
        'uniform vec4 uFocus;',
        'uniform float uFocusAmt;',
        'varying float vT;',
        'varying vec4 vEdge;',
        'varying float vDepth;',
        'varying float vFocus;',
        'void main() {',
        '  vT = aT;',
        '  vEdge = aEdge;',
        '  vDepth = clamp(1.0 + position.z / 700.0, 0.25, 1.0);',
        '  float inF = step(uFocus.x, position.x) * step(position.x, uFocus.z) * step(uFocus.y, position.y) * step(position.y, uFocus.w);',
        '  vFocus = inF * uFocusAmt;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
    ].join('\n');

    var LINE_FS = [
        'uniform float uClock;',
        'uniform float uReveal;',
        'uniform float uMotion;',
        'uniform vec3 uLine;',
        'uniform vec3 uFlash;',
        'varying float vT;',
        'varying vec4 vEdge;',
        'varying float vDepth;',
        'varying float vFocus;',
        'void main() {',
        // Revelado por tramos: la línea se dibuja de un extremo al otro.
        '  float drawn = clamp((uReveal - vEdge.z) / 0.45, 0.0, 1.0);',
        '  if (vT > drawn) discard;',
        '  float base = mix(0.3, 0.55, vEdge.w) * vDepth;',
        // Destello corto que viaja entre los dos puntos; cada línea tiene su propio ritmo y
        // la mayor parte del tiempo está apagada, así que solo unas pocas brillan a la vez.
        '  float cyc = fract(uClock * vEdge.y * 0.07 + vEdge.x);',
        '  float pulseOn = step(cyc, 0.18) * uMotion;',
        '  float s = cyc / 0.18;',
        '  float flash = pulseOn * smoothstep(0.16, 0.0, abs(vT - s)) * (1.0 - s * 0.35);',
        '  float alpha = base + flash * 0.95 + vFocus * 0.22;',
        '  vec3 col = mix(uLine, uFlash, clamp(flash * 1.2 + vFocus * 0.5, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
    ].join('\n');

    var POINT_VS = [
        'attribute float aSize;',
        'attribute vec4 aNode;', // fase, velocidad, retardo, tipo (0 libre, 1 esquina, 2 nodo principal)
        'uniform float uClock;',
        'uniform float uReveal;',
        'uniform float uMotion;',
        'uniform float uScale;',
        'uniform vec4 uFocus;',
        'uniform float uFocusAmt;',
        'varying float vGlow;',
        'varying float vAlpha;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  float appear = smoothstep(aNode.z, aNode.z + 0.35, uReveal);',
        // Pocos nodos encendidos a la vez: una potencia alta deja la onda casi siempre en 0.
        '  float tw = pow(max(0.0, sin(uClock * aNode.y + aNode.x)), 18.0) * uMotion;',
        '  float inF = step(uFocus.x, position.x) * step(position.x, uFocus.z) * step(uFocus.y, position.y) * step(position.y, uFocus.w);',
        '  vGlow = max(tw, inF * uFocusAmt * 0.55) + (aNode.w > 1.5 ? 0.25 : 0.0);',
        '  float depth = clamp(1.0 + position.z / 700.0, 0.3, 1.0);',
        '  vAlpha = appear * mix(0.45, 1.0, depth);',
        '  gl_PointSize = aSize * (1.0 + vGlow * 1.6) * uScale / -mv.z;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');

    var POINT_FS = [
        'uniform vec3 uNode;',
        'uniform vec3 uHalo;',
        'uniform vec3 uFlash;',
        'varying float vGlow;',
        'varying float vAlpha;',
        'void main() {',
        '  vec2 p = gl_PointCoord - 0.5;',
        '  float d = length(p) * 2.0;',
        '  if (d > 1.0) discard;',
        '  float core = smoothstep(0.42, 0.0, d);',
        '  float halo = smoothstep(1.0, 0.2, d) * (0.18 + vGlow * 0.7);',
        '  vec3 col = mix(uHalo, mix(uNode, uFlash, vGlow), core);',
        '  float a = (core * (0.75 + vGlow * 0.25) + halo) * vAlpha;',
        '  gl_FragColor = vec4(col, a);',
        '}'
    ].join('\n');

    // ───────── controlador ─────────

    /*
     * mount(host, opts) → controlador. Monta un canvas transparente en host.
     *  opts.layout()   → { zones, anchors, avoid, seed, density, maxDistance } en px del host.
     *  opts.lowPower   → ScreenX: densidad de píxeles 1 y 30 fps.
     *  opts.onState(s) → 'ready' | 'unavailable' (sin WebGL o falló la carga) | 'lost'.
     */
    function mount(host, opts) {
        opts = opts || {};
        var ctl = {
            state: 'loading',
            refresh: function () { pending.refresh = true; },
            setFocus: function (rect) { pending.focus = rect || null; },
            destroy: function () { destroyed = true; teardown(); }
        };
        var pending = { refresh: false, focus: null };
        var destroyed = false;
        var T = null, renderer = null, scene = null, camera = null, lines = null, points = null;
        var uniforms = null, startAt = 0, lastFrame = 0, ro = null, resizeTimer = null;
        var focusTarget = 0, focusAmt = 0, still = reducedMotion();
        var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;

        function setState(s) {
            ctl.state = s;
            host.dataset.fx = s;
            if (opts.onState) { try { opts.onState(s); } catch (e) { /* nada */ } }
        }

        if (!webglAvailable()) { setState('unavailable'); return ctl; }

        loadThree().then(function (mod) {
            if (destroyed) return;
            T = mod;
            try { init(); } catch (err) {
                console.warn('AVOTEX escena 3D: no se pudo iniciar, la interfaz sigue sin la capa decorativa.', err);
                teardown();
                setState('unavailable');
            }
        }, function (err) {
            if (destroyed) return;
            console.warn('AVOTEX escena 3D: three.js no cargó; la interfaz sigue sin la capa decorativa.', err);
            setState('unavailable');
        });

        function size() {
            var r = host.getBoundingClientRect();
            return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
        }

        function init() {
            var s = size();
            renderer = new T.WebGLRenderer({ alpha: true, antialias: !opts.lowPower, powerPreference: 'low-power', premultipliedAlpha: true });
            renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, opts.lowPower ? 1 : 1.5));
            renderer.setSize(s.w, s.h, false);
            renderer.setClearColor(0x000000, 0);
            var canvas = renderer.domElement;
            canvas.className = 'fx-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.addEventListener('webglcontextlost', function (e) {
                e.preventDefault();
                teardown();
                setState('lost');
            });
            host.appendChild(canvas);

            scene = new T.Scene();
            camera = new T.PerspectiveCamera(38, s.w / s.h, 10, 6000);
            uniforms = {
                uClock: { value: 0 }, uReveal: { value: 0 }, uMotion: { value: still ? 0 : 1 },
                uScale: { value: 1 }, uFocus: { value: [0, 0, 0, 0] }, uFocusAmt: { value: 0 },
                uLine: { value: new T.Color(COLORS.line) }, uFlash: { value: new T.Color(COLORS.flash) },
                uNode: { value: new T.Color(COLORS.node) }, uHalo: { value: new T.Color(COLORS.halo) }
            };
            // Los vec4 de three se pasan como objetos con x,y,z,w; un arreglo simple basta para uniform4fv.
            startAt = performance.now();
            if (still) uniforms.uReveal.value = 100;
            build(s);

            if (typeof root.ResizeObserver === 'function') {
                ro = new root.ResizeObserver(function () {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(function () { pending.refresh = true; if (still) frame(performance.now()); }, 140);
                });
                ro.observe(host);
            }
            document.addEventListener('visibilitychange', onVisibility);
            if (mq) {
                if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
                else if (mq.addListener) mq.addListener(onMotionPref);
            }
            setState('ready');
            startLoop();
        }

        function onMotionPref() {
            still = reducedMotion();
            if (!uniforms) return;
            uniforms.uMotion.value = still ? 0 : 1;
            if (still) { uniforms.uReveal.value = 100; stopLoop(); frame(performance.now()); }
            else startLoop();
        }

        function onVisibility() {
            // Ventana oculta (otra pestaña, minimizada): no se gasta GPU en ella.
            if (document.hidden) stopLoop(); else startLoop();
        }

        function startLoop() {
            if (!renderer || destroyed) return;
            if (still) { frame(performance.now()); return; }
            renderer.setAnimationLoop(frame);
        }
        function stopLoop() { if (renderer) renderer.setAnimationLoop(null); }

        function disposeGraph() {
            [lines, points].forEach(function (obj) {
                if (!obj) return;
                scene.remove(obj);
                obj.geometry.dispose();
                obj.material.dispose();
            });
            lines = points = null;
        }

        function build(s) {
            disposeGraph();
            var layout = (opts.layout && opts.layout(s.w, s.h)) || {};
            var net = buildNetwork(s.w, s.h, layout);

            // Cámara: el plano z = 0 coincide con los píxeles de la pantalla.
            camera.aspect = s.w / s.h;
            var dist = (s.h / 2) / Math.tan((camera.fov * Math.PI / 180) / 2);
            camera.position.set(0, 0, dist);
            camera.near = 10; camera.far = dist + 2000;
            camera.updateProjectionMatrix();
            camera.userData.dist = dist;
            uniforms.uScale.value = dist;

            var toX = function (x) { return x - s.w / 2; };
            var toY = function (y) { return s.h / 2 - y; };

            // Líneas: dos vértices por segmento.
            var nE = net.edges.length;
            var pos = new Float32Array(nE * 6), tAttr = new Float32Array(nE * 2), eAttr = new Float32Array(nE * 8);
            var rand = rng((layout.seed || 7) * 31 + 5);
            net.edges.forEach(function (e, i) {
                var a = net.nodes[e[0]], b = net.nodes[e[1]];
                pos.set([toX(a.x), toY(a.y), a.z, toX(b.x), toY(b.y), b.z], i * 6);
                tAttr[i * 2] = 0; tAttr[i * 2 + 1] = 1;
                var phase = rand(), speed = 0.5 + rand() * 0.9;
                var reveal = Math.max(a.delay, b.delay) + 0.1 + rand() * 0.25;
                var kind = e[2] === 'trace' ? 1 : 0;
                eAttr.set([phase, speed, reveal, kind, phase, speed, reveal, kind], i * 8);
            });
            var lg = new T.BufferGeometry();
            lg.setAttribute('position', new T.BufferAttribute(pos, 3));
            lg.setAttribute('aT', new T.BufferAttribute(tAttr, 1));
            lg.setAttribute('aEdge', new T.BufferAttribute(eAttr, 4));
            var lm = new T.ShaderMaterial({
                uniforms: uniforms, vertexShader: LINE_VS, fragmentShader: LINE_FS,
                transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
            });
            lines = new T.LineSegments(lg, lm);
            lines.frustumCulled = false;
            scene.add(lines);

            // Nodos.
            var nN = net.nodes.length;
            var pp = new Float32Array(nN * 3), sz = new Float32Array(nN), nd = new Float32Array(nN * 4);
            net.nodes.forEach(function (n, i) {
                pp.set([toX(n.x), toY(n.y), n.z], i * 3);
                sz[i] = n.size;
                nd.set([n.phase, n.speed, n.delay, n.kind === 'corner' ? 1 : (n.kind === 'hub' ? 2 : 0)], i * 4);
            });
            var pg = new T.BufferGeometry();
            pg.setAttribute('position', new T.BufferAttribute(pp, 3));
            pg.setAttribute('aSize', new T.BufferAttribute(sz, 1));
            pg.setAttribute('aNode', new T.BufferAttribute(nd, 4));
            var pm = new T.ShaderMaterial({
                uniforms: uniforms, vertexShader: POINT_VS, fragmentShader: POINT_FS,
                transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
            });
            points = new T.Points(pg, pm);
            points.frustumCulled = false;
            scene.add(points);
            ctl.stats = { nodes: nN, lines: nE };
            host.dataset.fxNodes = String(nN);
        }

        function applyFocus(s) {
            var r = pending.focus;
            if (r) {
                var pad = 70;
                uniforms.uFocus.value = [r.left - pad - s.w / 2, s.h / 2 - r.bottom - pad, r.right + pad - s.w / 2, s.h / 2 - r.top + pad];
                focusTarget = 1;
            } else {
                focusTarget = 0;
            }
        }

        function frame(now) {
            if (!renderer || destroyed) return;
            // Bajo consumo: ~30 fps.
            if (opts.lowPower && !still && now - lastFrame < 32) return;
            lastFrame = now;
            var s = null;
            if (pending.refresh) {
                pending.refresh = false;
                s = size();
                renderer.setSize(s.w, s.h, false);
                build(s);
                // Una reconstrucción (cambio de tamaño, de huerta o de paneles) no repite la entrada.
                startAt = Math.min(startAt, now - 5000);
            }
            s = s || size();
            applyFocus(s);
            focusAmt += (focusTarget - focusAmt) * (still ? 1 : 0.08);
            uniforms.uFocusAmt.value = focusAmt;
            uniforms.uClock.value = (Date.now() / 1000) % 3600; // mismo ritmo en todas las ventanas
            if (!still) uniforms.uReveal.value = (now - startAt) / 1000;
            if (!still && camera) {
                // Deriva ambiental lenta: separa los planos de profundidad sin mover la interfaz.
                var t = now / 1000;
                camera.position.x = Math.sin(t * 0.07) * 14;
                camera.position.y = Math.cos(t * 0.05) * 9;
                camera.lookAt(0, 0, -200);
            } else if (camera) {
                camera.position.x = 0; camera.position.y = 0; camera.lookAt(0, 0, -200);
            }
            renderer.render(scene, camera);
        }

        function teardown() {
            stopLoop();
            clearTimeout(resizeTimer);
            if (ro) { ro.disconnect(); ro = null; }
            document.removeEventListener('visibilitychange', onVisibility);
            if (mq) {
                if (mq.removeEventListener) mq.removeEventListener('change', onMotionPref);
                else if (mq.removeListener) mq.removeListener(onMotionPref);
            }
            if (scene) disposeGraph();
            if (renderer) {
                var canvas = renderer.domElement;
                renderer.dispose();
                try { renderer.forceContextLoss(); } catch (e) { /* nada */ }
                if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
            }
            renderer = scene = camera = null;
            if (destroyed) { delete host.dataset.fx; delete host.dataset.fxNodes; }
        }

        return ctl;
    }

    root.AvotexFx = {
        mount: mount,
        webglAvailable: webglAvailable,
        reducedMotion: reducedMotion,
        // Expuesto para pruebas: genera la red sin WebGL.
        _buildNetwork: buildNetwork
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.AvotexFx;
})(typeof window !== 'undefined' ? window : globalThis);

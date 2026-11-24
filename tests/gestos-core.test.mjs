/*
 * Pruebas de la lógica de gestos (avotex-gestos-core.js) con manos sintéticas.
 * Ejecutar:  node --test tests/gestos-core.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../avotex-gestos-core.js');
const ASPECT = 16 / 9;

/*
 * Mano sintética en «unidades de mano» (y negativa = hacia arriba), colocada con el centro
 * aproximado en (cx, cy) del fotograma y tamaño s (fracción del alto). Sin espejo, como MediaPipe.
 */
function hand({ cx = 0.5, cy = 0.55, s = 0.2, pose = 'open' } = {}) {
    const U = {};
    U[0] = [0, 0.6];
    const mcp = { 5: [-0.25, -0.1], 9: [-0.05, -0.15], 13: [0.13, -0.12], 17: [0.3, -0.05] };
    Object.assign(U, mcp);
    const ext = (m, pip, tip, dx = 0) => { U[pip] = [mcp[m][0] + dx * 0.45, mcp[m][1] - 0.3]; U[tip] = [mcp[m][0] + dx, mcp[m][1] - 0.65]; };
    const fold = (m, pip, tip) => { U[pip] = [mcp[m][0], mcp[m][1] - 0.2]; U[tip] = [mcp[m][0], mcp[m][1] + 0.05]; };
    if (pose === 'v') {
        ext(5, 6, 8, -0.2); ext(9, 10, 12, 0.08); fold(13, 14, 16); fold(17, 18, 20);
    } else if (pose === 'pinch') {
        ext(5, 6, 8, -0.1); ext(9, 10, 12); ext(13, 14, 16); ext(17, 18, 20);
    } else if (pose === 'thumb' || pose === 'fist' || pose === 'thumbside' || pose === 'thumbdown') {
        fold(5, 6, 8); fold(9, 10, 12); fold(13, 14, 16); fold(17, 18, 20);
    } else if (pose === 'point') {
        ext(5, 6, 8); fold(9, 10, 12); fold(13, 14, 16); fold(17, 18, 20);
    } else if (pose === 'three') {
        ext(5, 6, 8); ext(9, 10, 12); ext(13, 14, 16); fold(17, 18, 20);
    } else {
        ext(5, 6, 8); ext(9, 10, 12); ext(13, 14, 16); ext(17, 18, 20);
    }
    // Pulgar: junto a la punta del índice en la pinza; separado en los demás casos.
    U[4] = pose === 'pinch' ? [U[8][0] + 0.06, U[8][1] + 0.05] : [-0.65, 0.05];
    for (const i of [1, 2, 3, 7, 11, 15, 19]) U[i] = U[i] || [0, 0];
    U[1] = [-0.3, 0.45]; U[2] = [-0.45, 0.3]; U[3] = [-0.55, 0.15];
    // Pulgar arriba: sube por encima de los nudillos. De lado: apunta a un costado. Puño: pegado al índice.
    if (pose === 'thumb') { U[3] = [-0.47, -0.05]; U[4] = [-0.48, -0.42]; }
    if (pose === 'thumbdown') { U[3] = [-0.48, 0.66]; U[4] = [-0.48, 1.0]; }
    if (pose === 'thumbside') { U[3] = [-0.75, 0.25]; U[4] = [-1.1, 0.2]; }
    if (pose === 'fist') { U[3] = [-0.4, 0.15]; U[4] = [-0.2, 0.05]; }
    U[7] = [(U[6][0] + U[8][0]) / 2, (U[6][1] + U[8][1]) / 2];
    U[11] = [(U[10][0] + U[12][0]) / 2, (U[10][1] + U[12][1]) / 2];
    U[15] = [(U[14][0] + U[16][0]) / 2, (U[14][1] + U[16][1]) / 2];
    U[19] = [(U[18][0] + U[20][0]) / 2, (U[18][1] + U[20][1]) / 2];
    return Array.from({ length: 21 }, (_, i) => ({ x: cx + U[i][0] * s / ASPECT, y: cy + U[i][1] * s, z: 0 }));
}

function runner(cfg) {
    const c = G.createController(cfg);
    let t = 0;
    const feed = (lm, n = 1, dtMs = 50, handedness = 'Right') => {
        let out;
        for (let i = 0; i < n; i++) { t += dtMs; out = c.update({ landmarks: lm, handedness, t, aspect: ASPECT }); }
        return out;
    };
    const steps = (seconds) => { let sum = { yaw: 0, pitch: 0 }; for (let i = 0; i < Math.round(seconds * 60); i++) { const s = c.step(1 / 60); sum.yaw += s.yaw; sum.pitch += s.pitch; } return sum; };
    return { c, feed, steps, skip: ms => { t += ms; } };
}

test('la pinza se mide relativa al tamaño de la mano (no depende de la distancia a la webcam)', () => {
    const near = G.measure(hand({ s: 0.35, pose: 'pinch' }), ASPECT);
    const far = G.measure(hand({ s: 0.1, pose: 'pinch' }), ASPECT);
    assert.ok(Math.abs(near.pinch - far.pinch) < 1e-9);
    assert.ok(near.pinch < G.DEFAULTS.pinchClose, 'pinza cerrada');
    assert.ok(G.measure(hand({ pose: 'open' }), ASPECT).pinch > G.DEFAULTS.pinchOpen, 'mano abierta');
});

test('la pinza se confirma en varios fotogramas, fija el punto neutro y la vista queda quieta', () => {
    const { feed, steps } = runner();
    assert.equal(feed(hand({ pose: 'pinch' }), 2).status, 'hand', 'dos fotogramas no bastan');
    assert.equal(feed(hand({ pose: 'pinch' }), 1).status, 'holding');
    const s = steps(1);
    assert.equal(s.yaw, 0); assert.equal(s.pitch, 0);
    // Temblor pequeño dentro de la zona muerta: quieto.
    feed(hand({ pose: 'pinch', cx: 0.515, cy: 0.565 }), 6);
    assert.equal(steps(1).yaw, 0);
});

test('mover la pinza a la derecha del presentador gira a la derecha; arriba inclina hacia arriba, con menos sensibilidad', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    // La derecha del presentador es x menor en la imagen sin espejo de la webcam.
    const out = r.feed(hand({ pose: 'pinch', cx: 0.25 }), 10);
    assert.equal(out.status, 'turning');
    const right = r.steps(1);
    assert.ok(right.yaw > 20, 'gira a la derecha (heading aumenta): ' + right.yaw);
    assert.ok(right.yaw <= G.DEFAULTS.maxYawSpeed + 1e-6, 'nunca supera el máximo');

    const l = runner();
    l.feed(hand({ pose: 'pinch' }), 3);
    l.feed(hand({ pose: 'pinch', cx: 0.75 }), 10);
    assert.ok(l.steps(1).yaw < -20, 'izquierda');

    const u = runner();
    u.feed(hand({ pose: 'pinch' }), 3);
    u.feed(hand({ pose: 'pinch', cy: 0.3 }), 10);
    const up = u.steps(1);
    assert.ok(up.pitch > 0, 'arriba');
    assert.equal(up.yaw, 0);
    assert.ok(up.pitch < right.yaw, 'la inclinación es menos sensible que el giro');
});

test('soltar la pinza detiene el giro de inmediato y borra el punto neutro', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 10);
    r.steps(0.5);
    r.feed(hand({ pose: 'open', cx: 0.25 }), 2);
    assert.equal(r.c.state().neutral, null);
    const s = r.c.step(1 / 60);
    assert.equal(s.moving, false);
    // Nueva pinza en otro lugar: punto neutro nuevo, sin salto.
    r.feed(hand({ pose: 'pinch', cx: 0.3 }), 3);
    assert.equal(r.steps(0.5).yaw, 0);
});

test('histéresis: valores entre los dos umbrales no cambian el estado', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    assert.equal(r.c.state().pinching, true);
    // Mano a medio abrir: entre pinchClose y pinchOpen.
    const lm = hand({ pose: 'pinch' });
    lm[4] = { x: lm[8].x + (0.42 * 0.2 * 0.75) / ASPECT * 0.9, y: lm[8].y, z: 0 };
    const p = G.measure(lm, ASPECT).pinch;
    assert.ok(p > G.DEFAULTS.pinchClose && p < G.DEFAULTS.pinchOpen, 'caso intermedio: ' + p);
    r.feed(lm, 8);
    assert.equal(r.c.state().pinching, true, 'no suelta en la zona intermedia');
});

test('perder la mano o un corte de fotogramas descarta el movimiento; al volver no hay salto', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 5);
    assert.equal(r.feed(null).status, 'searching');
    assert.equal(r.c.step(1 / 60).moving, false);

    const g = runner();
    g.feed(hand({ pose: 'pinch' }), 3);
    g.feed(hand({ pose: 'pinch', cx: 0.3 }), 3);
    g.skip(1000); // la cámara se congeló un segundo
    const out = g.feed(hand({ pose: 'pinch', cx: 0.2 }), 4);
    assert.equal(out.status, 'blocked', 'hay que volver a tomar el control');
    assert.equal(g.steps(0.5).yaw, 0);
    g.feed(hand({ pose: 'open', cx: 0.2 }), 2);
    g.feed(hand({ pose: 'pinch', cx: 0.2 }), 3);
    assert.equal(g.c.state().pinching, true);
    assert.equal(g.steps(0.5).yaw, 0, 'el neutro nuevo está donde quedó la mano');
});

test('cambiar la mano seguida reinicia el control', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3, 50, 'Right');
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 1, 50, 'Left');
    assert.equal(r.c.state().pinching, false);
    assert.equal(r.steps(0.3).yaw, 0);
});

test('la V sostenida avanza una sola vez; hay que bajarla para volver a avanzar', () => {
    const r = runner();
    let forwards = 0;
    for (let i = 0; i < 60; i++) if (r.feed(hand({ pose: 'v' })).command === 'forward') forwards++; // 3 s
    assert.equal(forwards, 1);
    r.feed(hand({ pose: 'open' }), 4);
    for (let i = 0; i < 20; i++) if (r.feed(hand({ pose: 'v' })).command === 'forward') forwards++;
    assert.equal(forwards, 2);
    // Un destello corto de V no avanza.
    const q = runner();
    const outs = [q.feed(hand({ pose: 'v' }), 3), q.feed(hand({ pose: 'open' }), 3)];
    assert.ok(outs.every(o => o.command === null));
});

test('la V no avanza mientras se hace la pinza', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    let forwards = 0;
    for (let i = 0; i < 30; i++) if (r.feed(hand({ pose: 'pinch' })).command) forwards++;
    assert.equal(forwards, 0);
});

test('mouse o teclado cancelan la pinza: alto y nueva pinza obligatoria', () => {
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 5);
    assert.equal(r.c.cancel(), true);
    assert.equal(r.c.step(1 / 60).moving, false);
    // Sigue con la pinza cerrada: no recupera el control.
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 10);
    assert.equal(r.c.state().pinching, false);
    assert.equal(r.steps(0.5).yaw, 0);
    r.feed(hand({ pose: 'open', cx: 0.25 }), 2);
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 3);
    assert.equal(r.c.state().pinching, true);
});

test('invertX invierte la dirección del giro', () => {
    const r = runner({ invertX: true });
    r.feed(hand({ pose: 'pinch' }), 3);
    r.feed(hand({ pose: 'pinch', cx: 0.25 }), 10);
    assert.ok(r.steps(1).yaw < 0);
});

test('parámetros saneados y límites de inclinación', () => {
    const c = G.sanitize({ pinchClose: 0.5, pinchOpen: 0.3, inferenceFps: 500, maxYawSpeed: 'x' });
    assert.ok(c.pinchOpen > c.pinchClose);
    assert.equal(c.inferenceFps, 60);
    assert.equal(c.maxYawSpeed, G.DEFAULTS.maxYawSpeed);
    assert.equal(G.clampPitch(80), G.DEFAULTS.pitchMax);
    assert.equal(G.clampPitch(-80), G.DEFAULTS.pitchMin);
});

test('en un equipo lento (pocas inferencias por segundo) el control no se reinicia en cada fotograma', () => {
    const c = G.createController();
    let t = 0;
    const feed = (lm, n) => { let o; for (let i = 0; i < n; i++) { t += 500; o = c.update({ landmarks: lm, handedness: 'Right', t, aspect: ASPECT, expectedGapMs: 500 }); } return o; };
    feed(hand({ pose: 'pinch' }), 3);
    assert.equal(c.state().pinching, true);
    const out = feed(hand({ pose: 'pinch', cx: 0.25 }), 3);
    assert.equal(out.status, 'turning');
});

test('el pulgar arriba sostenido alterna los escaneos una sola vez; hay que bajarlo para repetir', () => {
    const r = runner();
    const m = G.measure(hand({ pose: 'thumb' }), ASPECT);
    assert.ok(m.thumbUp >= G.DEFAULTS.thumbUpMin && m.thumbVertical, 'se reconoce el pulgar arriba');
    assert.equal(r.feed(hand({ pose: 'thumb' }), 4).command, null, '200 ms no bastan');
    let cmds = 0;
    for (let i = 0; i < 60; i++) if (r.feed(hand({ pose: 'thumb' })).command === 'scans') cmds++;
    assert.equal(cmds, 1, 'sostenerlo 3 s alterna una sola vez');
    assert.equal(r.feed(hand({ pose: 'thumb' })).status, 'thumb');
    // Bajar la mano y volver a hacerlo alterna otra vez (después de la pausa mínima).
    r.feed(hand({ pose: 'open' }), 5);
    cmds = 0;
    for (let i = 0; i < 20; i++) if (r.feed(hand({ pose: 'thumb' })).command === 'scans') cmds++;
    assert.equal(cmds, 1);
});

test('el pulgar arriba no se confunde con el puño, el pulgar de lado, la mano abierta, la V ni la pinza', () => {
    for (const pose of ['fist', 'thumbside', 'open', 'v', 'pinch']) {
        const r = runner();
        let cmds = 0;
        for (let i = 0; i < 40; i++) if (r.feed(hand({ pose })).command === 'scans') cmds++;
        assert.equal(cmds, 0, pose);
    }
    // Y el pulgar arriba no avanza ni gira.
    const r = runner();
    for (let i = 0; i < 40; i++) assert.notEqual(r.feed(hand({ pose: 'thumb' })).command, 'forward');
    assert.equal(r.steps(1).yaw, 0);
});

test('el pulgar arriba funciona cerca o lejos de la webcam', () => {
    for (const s of [0.1, 0.35]) {
        const r = runner();
        let cmds = 0;
        for (let i = 0; i < 20; i++) if (r.feed(hand({ pose: 'thumb', s })).command === 'scans') cmds++;
        assert.equal(cmds, 1, 'tamaño ' + s);
    }
});

test('un corte de fotogramas con el pulgar arriba sostenido no lo repite (la laptop se trabó un momento)', () => {
    const r = runner();
    let cmds = 0;
    for (let i = 0; i < 20; i++) if (r.feed(hand({ pose: 'thumb' })).command === 'scans') cmds++;
    r.skip(900); // más que maxFrameGapMs
    for (let i = 0; i < 60; i++) if (r.feed(hand({ pose: 'thumb' })).command === 'scans') cmds++;
    assert.equal(cmds, 1);
    // La V tampoco se repite tras un corte.
    const v = runner();
    let fw = 0;
    for (let i = 0; i < 20; i++) if (v.feed(hand({ pose: 'v' })).command === 'forward') fw++;
    v.skip(900);
    for (let i = 0; i < 60; i++) if (v.feed(hand({ pose: 'v' })).command === 'forward') fw++;
    assert.equal(fw, 1);
});

test('deslizar con la pinza cambia una vez por movimiento; regresar al centro o soltar permite otro', () => {
    const sw = G.createSwipe();
    const seq = [0, 0.05, 0.12, 0.2, 0.25].map(x => sw.update({ pinching: true, x }));
    assert.deepEqual(seq.filter(Boolean), ['next'], 'un solo cambio aunque la mano siga lejos');
    assert.equal(sw.update({ pinching: true, x: 0.02 }), null, 'regresa al centro');
    assert.equal(sw.update({ pinching: true, x: -0.15 }), 'prev');
    assert.equal(sw.update({ pinching: false }), null, 'suelta');
    assert.equal(sw.update({ pinching: true, x: -0.15 }), 'prev');
    // Con la pinza real: mover la mano a la derecha del presentador (x menor en la imagen) da desplazamiento positivo.
    const r = runner();
    r.feed(hand({ pose: 'pinch' }), 3);
    const out = r.feed(hand({ pose: 'pinch', cx: 0.3 }), 10);
    assert.ok(out.offset.x > G.DEFAULTS.swipeAt, 'derecha = siguiente');
});

test('deslizar al lado contrario cambia aunque no se vea el paso por el centro (detección lenta)', () => {
    const sw = G.createSwipe();
    assert.equal(sw.update({ pinching: true, x: 0.15 }), 'next');
    assert.equal(sw.update({ pinching: true, x: -0.18 }), 'prev');
    assert.equal(sw.update({ pinching: true, x: -0.2 }), null, 'quedarse no repite');
});

test('pulgar abajo sostenido alterna la vista de módulos una vez; hay que bajar la mano para repetir', () => {
    const r = runner();
    const m = G.measure(hand({ pose: 'thumbdown' }), ASPECT);
    assert.ok(m.indexDown && m.middleDown && m.ringDown && m.pinkyDown, 'los cuatro dedos doblados');
    assert.ok(m.thumbDown >= G.DEFAULTS.thumbUpMin && m.thumbVerticalDown, 'el pulgar apunta hacia abajo');
    assert.equal(r.feed(hand({ pose: 'thumbdown' }), 4).command, null, '200 ms no bastan');
    let cmds = 0;
    for (let i = 0; i < 60; i++) if (r.feed(hand({ pose: 'thumbdown' })).command === 'board') cmds++;
    assert.equal(cmds, 1, 'sostenerlo alterna una sola vez');
    r.feed(hand({ pose: 'open' }), 5);
    cmds = 0;
    for (let i = 0; i < 20; i++) if (r.feed(hand({ pose: 'thumbdown' })).command === 'board') cmds++;
    assert.equal(cmds, 1);
});

test('pulgar abajo no se confunde con el pulgar arriba (escaneos), la V, la mano abierta ni la pinza; y no avanza ni gira', () => {
    for (const pose of ['thumb', 'v', 'open', 'pinch']) {
        const r = runner();
        let cmds = 0;
        for (let i = 0; i < 40; i++) if (r.feed(hand({ pose })).command === 'board') cmds++;
        assert.equal(cmds, 0, pose);
    }
    // El pulgar abajo no dispara los escaneos (pulgar arriba) ni avanza ni gira.
    const r = runner();
    for (let i = 0; i < 40; i++) { const o = r.feed(hand({ pose: 'thumbdown' })); assert.notEqual(o.command, 'forward'); assert.notEqual(o.command, 'scans'); }
    assert.equal(r.steps(1).yaw, 0);
    // Y el pulgar arriba no dispara la vista de módulos.
    const r2 = runner();
    for (let i = 0; i < 40; i++) assert.notEqual(r2.feed(hand({ pose: 'thumb' })).command, 'board');
});

/*
 * Pruebas unitarias del rediseño: paginación por altura (sin desplazamiento interno)
 * y generación de la red decorativa de la capa three.js (sin WebGL).
 * Ejecutar:  node --test tests/recorrido.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { paginateHeights, pageLabel } = require('../avotex-recorrido.js');
const Fx = require('../avotex-escena3d.js');

test('paginateHeights reparte filas sin pasar del alto disponible', () => {
    assert.deepEqual(paginateHeights([40, 40, 40, 40, 40], 130, 0), [[0, 3], [3, 5]]);
    // Con separación entre elementos.
    assert.deepEqual(paginateHeights([40, 40, 40], 100, 10), [[0, 2], [2, 3]]);
    // Un elemento más alto que la página ocupa una página propia (nunca se pierde).
    assert.deepEqual(paginateHeights([30, 500, 30], 200, 0), [[0, 1], [1, 2], [2, 3]]);
    assert.deepEqual(paginateHeights([], 200, 0), []);
    // Cada índice aparece exactamente una vez.
    const hs = Array.from({ length: 33 }, (_, i) => 30 + (i % 3) * 12);
    const pages = paginateHeights(hs, 260, 6);
    const flat = pages.flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i));
    assert.deepEqual(flat, hs.map((_, i) => i));
    pages.forEach(([a, b]) => {
        const used = hs.slice(a, b).reduce((s, h) => s + h, 0) + 6 * (b - a - 1);
        assert.ok(b - a === 1 || used <= 260, 'ninguna página excede el alto');
    });
});

test('pageLabel muestra rango y total', () => {
    assert.equal(pageLabel([0, 5], 33), '1–5 de 33');
    assert.equal(pageLabel([30, 33], 33), '31–33 de 33');
    assert.equal(pageLabel([2, 3], 4, true), '3 de 4');
    assert.equal(pageLabel([0, 0], 0), 'Sin registros');
});

test('la red decorativa respeta las zonas reservadas y no atraviesa las tarjetas', () => {
    const W = 1600, H = 900;
    const card = { left: 16, top: 100, right: 400, bottom: 500 };
    const title = { left: 600, top: 40, right: 1000, bottom: 140 };
    const net = Fx._buildNetwork(W, H, {
        anchors: [{ rect: card, side: 'left' }],
        zones: [{ left: 0, right: 560, top: 30, bottom: 870 }, { left: 1100, right: W, top: 30, bottom: 870 }],
        avoid: [title],
        seed: 7
    });
    assert.ok(net.nodes.length > 10 && net.nodes.length < 200, 'red poco densa');
    const inside = (n, r, pad) => n.x > r.left + pad && n.x < r.right - pad && n.y > r.top + pad && n.y < r.bottom - pad;
    net.nodes.forEach(n => {
        assert.ok(!inside(n, title, -18), 'sin nodos sobre el título');
        assert.ok(!inside(n, card, 0), 'los nodos rodean la tarjeta, no la atraviesan');
        assert.ok(n.z <= 0, 'profundidad hacia el fondo');
    });
    // El centro (camino de Street View) queda libre.
    assert.ok(net.nodes.every(n => n.x < 600 || n.x > 1050));
    // Se trazan tramos del borde de la tarjeta.
    assert.ok(net.edges.some(e => e[2] === 'trace'));
    // Determinista: misma semilla, misma red (estable entre reconstrucciones).
    const again = Fx._buildNetwork(W, H, { anchors: [{ rect: card, side: 'left' }], zones: [{ left: 0, right: 560, top: 30, bottom: 870 }, { left: 1100, right: W, top: 30, bottom: 870 }], avoid: [title], seed: 7 });
    assert.deepEqual(again.nodes.map(n => [n.x, n.y]), net.nodes.map(n => [n.x, n.y]));
});

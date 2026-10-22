/* Pruebas de la lógica compartida de ScreenX. Ejecutar con: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SX = require('../avotex-screenx-core.js');

// Bus en memoria que imita BroadcastChannel: entrega a todos menos al emisor.
function createFakeNetwork() {
    const members = new Set();
    return {
        join() {
            const t = {
                onmessage: null,
                postMessage(msg) {
                    const copy = JSON.parse(JSON.stringify(msg)); // clonado estructurado
                    for (const m of members) if (m !== t && typeof m.onmessage === 'function') m.onmessage({ data: copy });
                },
                close() { members.delete(t); }
            };
            members.add(t);
            return t;
        }
    };
}

test('fovFromZoom sigue la tabla documentada por Google', () => {
    assert.equal(SX.fovFromZoom(0), 180);
    assert.equal(SX.fovFromZoom(1), 90);
    assert.equal(SX.fovFromZoom(2), 45);
    assert.equal(SX.fovFromZoom(3), 22.5);
    assert.equal(SX.fovFromZoom(4), 11.25);
    assert.equal(SX.fovFromZoom('x'), 90, 'zoom inválido usa el valor por defecto (1)');
});

test('cameraForRole desplaza las laterales un campo de visión completo', () => {
    const center = { heading: 350, pitch: 5, zoom: 1 };
    assert.deepEqual(SX.cameraForRole(center, 'center'), { heading: 350, pitch: 5, zoom: 1 });
    assert.deepEqual(SX.cameraForRole(center, 'left'), { heading: 260, pitch: 5, zoom: 1 });
    assert.deepEqual(SX.cameraForRole(center, 'right'), { heading: 80, pitch: 5, zoom: 1 });
    // Con zoom 2 (45°) el desplazamiento se reduce a la mitad.
    assert.equal(SX.cameraForRole({ heading: 0, pitch: 0, zoom: 2 }, 'right').heading, 45);
});

test('la calibración se aplica y se limita a rangos seguros', () => {
    const cal = { bezelDeg: 3, fineDeg: -1.5 };
    assert.equal(SX.sideOffsetDeg(1, cal), 91.5);
    assert.equal(SX.cameraForRole({ heading: 10, pitch: 0, zoom: 1 }, 'left', cal).heading, SX.normalizeHeading(10 - 91.5));
    assert.deepEqual(SX.sanitizeCalibration({ bezelDeg: 999, fineDeg: -999 }), { bezelDeg: 20, fineDeg: -30 });
    assert.deepEqual(SX.sanitizeCalibration(null), SX.SCREENX_DEFAULTS);
});

test('normalizeHeading y headingDelta', () => {
    assert.equal(SX.normalizeHeading(-30), 330);
    assert.equal(SX.normalizeHeading(725), 5);
    assert.equal(SX.headingDelta(350, 10), 20);
    assert.equal(SX.headingDelta(10, 350), -20);
});

test('validación de coordenadas', () => {
    assert.ok(SX.isValidLatLng(19.72, -101.18));
    assert.ok(!SX.isValidLatLng(0, 0), '(0,0) se trata como "sin dato"');
    assert.ok(!SX.isValidLatLng(95, 10));
    assert.ok(!SX.isValidLatLng(10, 200));
    assert.ok(!SX.isValidLatLng(NaN, 10));
    assert.ok(!SX.isValidLatLng('19', '-101'), 'solo números');
});

test('parseCoords acepta los formatos guardados por la app', () => {
    assert.deepEqual(SX.parseCoords([{ latitude: 1, longitude: 2 }, { lat: 3, lng: 4 }, [5, 6]]), [[1, 2], [3, 4], [5, 6]]);
    assert.deepEqual(SX.parseCoords('[{"latitude":1,"longitude":2}]'), [[1, 2]]);
    assert.deepEqual(SX.parseCoords('no-json'), []);
    assert.deepEqual(SX.parseCoords(null), []);
});

test('huertaTarget usa el centro guardado y nunca inventa coordenadas', () => {
    const square = [{ latitude: 19.0, longitude: -101.0 }, { latitude: 19.0, longitude: -100.99 }, { latitude: 19.01, longitude: -100.99 }, { latitude: 19.01, longitude: -101.0 }];
    const withCenter = SX.huertaTarget({ center_lat: 19.005, center_lng: -100.995, coordinates: square });
    assert.equal(withCenter.source, 'center');
    assert.equal(withCenter.vertices.length, 4);
    const noCenter = SX.huertaTarget({ center_lat: null, center_lng: null, coordinates: square });
    assert.equal(noCenter.source, 'vertices');
    assert.ok(Math.abs(noCenter.lat - 19.005) < 1e-9);
    assert.equal(SX.huertaTarget({ center_lat: 0, center_lng: 0, coordinates: [] }), null);
    assert.equal(SX.huertaTarget({}), null);
    assert.equal(SX.huertaTarget(null), null);
});

test('describePanoramaPlacement calcula distancia, rumbo y si está dentro del polígono', () => {
    const verts = [[19.0, -101.0], [19.0, -100.99], [19.01, -100.99], [19.01, -101.0]];
    const target = { lat: 19.005, lng: -100.995, vertices: verts };
    const inside = SX.describePanoramaPlacement(target, { lat: 19.006, lng: -100.995 });
    assert.equal(inside.insidePolygon, true);
    const south = SX.describePanoramaPlacement(target, { lat: 18.996, lng: -100.995 });
    assert.equal(south.insidePolygon, false);
    assert.ok(south.distanceM > 900 && south.distanceM < 1100, 'unos 1000 m');
    assert.ok(SX.headingDelta(0, south.headingToHuerta) < 1, 'desde el sur se mira al norte');
});

test('validateMessage rechaza mensajes ajenos o mal formados', () => {
    const ok = SX.createMessage('presence', 'win-a', { role: 'left' }, 1);
    assert.ok(SX.validateMessage(ok));
    assert.ok(!SX.validateMessage({ ...ok, protocol: 'otro' }));
    assert.ok(!SX.validateMessage({ ...ok, type: 'hackear' }));
    assert.ok(!SX.validateMessage({ ...ok, from: '' }));
    assert.ok(!SX.validateMessage({ ...ok, seq: 'x' }));
    assert.ok(!SX.validateMessage(null));
});

test('el bus descarta mensajes propios, repetidos y viejos', () => {
    const net = createFakeNetwork();
    const a = SX.createBus(net.join(), 'a');
    const b = SX.createBus(net.join(), 'b');
    const got = [];
    b.on(m => got.push(m.type + ':' + m.seq));
    const selfGot = [];
    a.on(m => selfGot.push(m));
    a.send('presence', {});
    a.send('camera', { heading: 1, pitch: 0, zoom: 1 });
    assert.deepEqual(got, ['presence:1', 'camera:2']);
    assert.equal(selfGot.length, 0, 'una ventana no se escucha a sí misma');
    assert.throws(() => a.send('desconocido', {}));
});

test('el bus acepta de nuevo a una ventana que se recargó (contador reiniciado)', () => {
    const net = createFakeNetwork();
    const b = SX.createBus(net.join(), 'b');
    const got = [];
    b.on(m => got.push(m.seq));
    const a1 = SX.createBus(net.join(), 'a', { loadId: 'carga-1' });
    a1.send('presence', {}); a1.send('presence', {});
    a1.close();
    const a2 = SX.createBus(net.join(), 'a', { loadId: 'carga-2' });
    a2.send('presence', {});
    assert.deepEqual(got, [1, 2, 1]);
});

test('el bus detecta una pestaña duplicada con el mismo identificador', () => {
    const net = createFakeNetwork();
    const original = SX.createBus(net.join(), 'mismo-id', { loadId: 'x' });
    const copia = SX.createBus(net.join(), 'mismo-id', { loadId: 'y' });
    const events = [];
    original.on(m => events.push(m.type));
    copia.send('presence', { bornAt: 2 });
    assert.deepEqual(events, ['__collision']);
});

test('estado versionado: una ventana nueva no pisa el estado existente', () => {
    const a = SX.createStateStore('a', { huertaId: null });
    const b = SX.createStateStore('b', { huertaId: 'vieja' });
    const snapA = a.propose({ huertaId: 'h1' });
    assert.equal(b.receive(snapA), true);
    assert.equal(b.get().huertaId, 'h1');
    // Una ventana recién abierta (versión 0) no puede imponer su estado.
    const nueva = SX.createStateStore('c', { huertaId: 'h-desactualizada' });
    assert.equal(a.receive(nueva.snapshot()), false);
    assert.equal(a.get().huertaId, 'h1');
    // Un estado viejo que llega tarde se ignora.
    const snap2 = b.propose({ huertaId: 'h2' });
    assert.equal(a.receive(snap2), true);
    assert.equal(a.receive(snapA), false);
    assert.equal(a.get().huertaId, 'h2');
});

test('estado versionado: cambios simultáneos convergen igual en todas las ventanas', () => {
    const a = SX.createStateStore('a');
    const b = SX.createStateStore('b');
    const sa = a.propose({ huertaId: 'A' });
    const sb = b.propose({ huertaId: 'B' });
    a.receive(sb);
    b.receive(sa);
    assert.equal(a.get().huertaId, b.get().huertaId, 'mismo resultado en ambas');
    assert.equal(a.get().huertaId, 'B', 'gana el identificador mayor ("b" > "a")');
});

test('registro de ventanas: roles, faltantes, duplicados y desconexiones', () => {
    const reg = SX.createPeerRegistry('yo', { staleMs: 5000 });
    let t = 1000;
    let s = reg.summary('center', t);
    assert.deepEqual(s.assigned, ['center']);
    assert.deepEqual(s.missing, ['left', 'right']);
    assert.equal(s.complete, false);

    reg.update('w-left', { role: 'left' }, t);
    reg.update('w-right', { role: 'right' }, t);
    s = reg.summary('center', t);
    assert.equal(s.complete, true);
    assert.equal(s.status.left.state, 'peer');
    assert.equal(s.status.center.state, 'self');

    reg.update('w-otra', { role: 'center' }, t);
    s = reg.summary('center', t);
    assert.deepEqual(s.duplicates, ['center']);
    assert.equal(s.complete, false);

    // La ventana derecha deja de responder.
    t += 6000;
    reg.update('w-left', { role: 'left' }, t);
    reg.update('w-otra', { role: 'center' }, t);
    const removed = reg.prune(t);
    assert.deepEqual(removed.map(p => p.id), ['w-right']);
    s = reg.summary('center', t);
    assert.deepEqual(s.missing, ['right']);
    assert.equal(reg.update('yo', { role: 'left' }, t), null, 'no se registra a sí misma');
});

test('shouldApplyCamera solo acepta a la central única y de la misma huerta', () => {
    const msg = { type: 'camera', from: 'c1', payload: { heading: 10, pitch: 0, zoom: 1, huertaId: 'h1' } };
    assert.ok(SX.shouldApplyCamera(msg, { selfRole: 'left', centerHolders: ['c1'], huertaId: 'h1' }));
    assert.ok(!SX.shouldApplyCamera(msg, { selfRole: 'center', centerHolders: ['c1'], huertaId: 'h1' }), 'la central no se sigue a sí misma');
    assert.ok(!SX.shouldApplyCamera(msg, { selfRole: 'left', centerHolders: ['c1', 'c2'], huertaId: 'h1' }), 'con dos centrales no hay referencia');
    assert.ok(!SX.shouldApplyCamera(msg, { selfRole: 'left', centerHolders: ['otra'], huertaId: 'h1' }), 'una lateral no puede mover a otra');
    assert.ok(!SX.shouldApplyCamera(msg, { selfRole: 'right', centerHolders: ['c1'], huertaId: 'h2' }), 'otra huerta');
    assert.ok(!SX.shouldApplyCamera({ ...msg, payload: { heading: 'x', pitch: 0, zoom: 1 } }, { selfRole: 'right', centerHolders: ['c1'] }));
    assert.ok(!SX.shouldApplyCamera(msg, { selfRole: null, centerHolders: ['c1'], huertaId: 'h1' }), 'sin rol no aplica');
});

test('moduleTargetRole envía cada módulo a su pantalla si está conectada', () => {
    assert.equal(SX.moduleTargetRole('reportes', 'center', ['left', 'right']), 'left');
    assert.equal(SX.moduleTargetRole('resumen', 'center', ['left', 'right']), 'right');
    assert.equal(SX.moduleTargetRole('resumen', 'center', ['left']), 'center', 'si falta la derecha se abre aquí');
    assert.equal(SX.moduleTargetRole('huerta', 'left', ['center', 'right']), 'left');
    assert.equal(SX.moduleTargetRole('desconocido', 'center', ['left']), 'center');
});

test('centerCameraFromRole es la inversa de cameraForRole', () => {
    const cal = { bezelDeg: 2, fineDeg: -3 };
    for (const role of ['left', 'center', 'right']) {
        for (const h of [0, 45, 190, 359]) {
            const side = SX.cameraForRole({ heading: h, pitch: 3, zoom: 1.5 }, role, cal);
            const back = SX.centerCameraFromRole(side, role, cal);
            assert.ok(Math.abs(SX.headingDelta(h, back.heading)) < 1e-9, role + ' ' + h);
            assert.equal(back.pitch, 3); assert.equal(back.zoom, 1.5);
        }
    }
});

test('pickLink usa solo enlaces reales dentro del ángulo permitido', () => {
    const links = [{ pano: 'e', heading: 90 }, { pano: 'o', heading: 270 }, { pano: '', heading: 0 }, { heading: 10 }];
    assert.equal(SX.pickLink(links, 80).pano, 'e');
    assert.equal(SX.pickLink(links, 300).pano, 'o');
    assert.equal(SX.pickLink(links, 0), null, 'ningún enlace válido mira al norte');
    assert.equal(SX.pickLink([], 0), null);
    assert.equal(SX.pickLink(null, 0), null);
    const opt = SX.navOptions(links, 90);
    assert.equal(opt.forward.pano, 'e');
    assert.equal(opt.back.pano, 'o');
});

test('shouldAcceptNavRequest: solo la central, desde una lateral, y si cambia algo', () => {
    const msg = { type: 'nav-request', from: 'l', payload: { pano: 'p2', heading: 30, pitch: 0, zoom: 1, huertaId: 'h1' } };
    const current = { pano: 'p1', heading: 30, pitch: 0, zoom: 1 };
    assert.ok(SX.shouldAcceptNavRequest(msg, { selfRole: 'center', senderRole: 'left', huertaId: 'h1', current }));
    assert.ok(!SX.shouldAcceptNavRequest(msg, { selfRole: 'left', senderRole: 'right', huertaId: 'h1', current }), 'solo la central decide');
    assert.ok(!SX.shouldAcceptNavRequest(msg, { selfRole: 'center', senderRole: 'center', huertaId: 'h1', current }));
    assert.ok(!SX.shouldAcceptNavRequest(msg, { selfRole: 'center', senderRole: undefined, huertaId: 'h1', current }), 'emisor desconocido');
    assert.ok(!SX.shouldAcceptNavRequest(msg, { selfRole: 'center', senderRole: 'left', huertaId: 'h2', current }), 'otra huerta');
    const echo = { ...msg, payload: { ...msg.payload, pano: 'p1' } };
    assert.ok(!SX.shouldAcceptNavRequest(echo, { selfRole: 'center', senderRole: 'right', huertaId: 'h1', current }), 'el eco no provoca ciclos');
    assert.ok(!SX.shouldAcceptNavRequest({ ...msg, payload: { ...msg.payload, heading: 'x' } }, { selfRole: 'center', senderRole: 'left', current }));
});

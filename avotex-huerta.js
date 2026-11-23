/*
 * AVOTEX — fondo del selector «¿Cómo quieres explorar tu huerta?» (rediseño de noviembre 2026).
 *
 * Reemplaza la red de líneas de three.js por una escena fotográfica en capas:
 *  - Cada capa [data-depth] (foto, luz y neblina, follaje cercano) sigue al puntero con su propia
 *    profundidad: la lejana casi no se mueve y el follaje cercano se mueve más. Así se percibe volumen.
 *  - Al pasar o enfocar una tarjeta, la foto anticipa la modalidad: con «Vista normal» se recoge en
 *    una sola pantalla; con «ScreenX» se separa en tres paneles inclinados, como tres monitores.
 *
 * No captura el puntero ni bloquea nada: solo lee su posición mientras el selector está visible.
 * Con «reducir movimiento» no hay parallax; el cambio de modalidad se aplica sin transición (CSS).
 */
(function (root) {
    'use strict';
    var doc = root.document;
    var reduce = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var coarse = root.matchMedia ? root.matchMedia('(pointer: coarse)') : { matches: false };

    function init() {
        var screen = doc.getElementById('modeSelector');
        var bg = screen && screen.querySelector('[data-sel-bg]');
        if (!bg) return;
        var layers = Array.prototype.slice.call(bg.querySelectorAll('[data-depth]')).map(function (el) {
            return { el: el, k: parseFloat(el.dataset.depth) || 0 };
        });
        var target = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, raf = 0;

        var active = function () { return !screen.hidden && doc.body.dataset.mode === 'selector' && !doc.hidden; };

        function frame() {
            raf = 0;
            cur.x += (target.x - cur.x) * 0.08;
            cur.y += (target.y - cur.y) * 0.08;
            var w = root.innerWidth, h = root.innerHeight;
            layers.forEach(function (l) {
                l.el.style.transform = 'translate3d(' + (-cur.x * w * l.k).toFixed(2) + 'px,' + (-cur.y * h * l.k).toFixed(2) + 'px,0)';
            });
            if (Math.abs(target.x - cur.x) > 0.0005 || Math.abs(target.y - cur.y) > 0.0005) raf = root.requestAnimationFrame(frame);
        }
        function kick() { if (!raf && active()) raf = root.requestAnimationFrame(frame); }

        screen.addEventListener('pointermove', function (e) {
            if (reduce.matches || coarse.matches || e.pointerType === 'touch') return;
            target.x = e.clientX / root.innerWidth - 0.5;
            target.y = e.clientY / root.innerHeight - 0.5;
            kick();
        });
        screen.addEventListener('pointerleave', function () { target.x = 0; target.y = 0; kick(); });

        // La foto anticipa la modalidad de la tarjeta que se señala.
        var current = null;
        function preview(mode) {
            if (mode === current) return;
            current = mode;
            if (mode) bg.dataset.preview = mode; else delete bg.dataset.preview;
        }
        Array.prototype.forEach.call(screen.querySelectorAll('[data-preview]'), function (card) {
            var mode = card.getAttribute('data-preview');
            card.addEventListener('pointerenter', function () { preview(mode); });
            card.addEventListener('pointerleave', function () { if (!card.contains(doc.activeElement)) preview(null); });
            card.addEventListener('focusin', function () { preview(mode); });
            card.addEventListener('focusout', function (e) { if (!card.contains(e.relatedTarget)) preview(null); });
        });
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
